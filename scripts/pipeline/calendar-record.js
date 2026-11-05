const { createHash } = require('node:crypto');
const { URL } = require('node:url');
const { rateEvent } = require('./rating');
const { whenLabelFor } = require('../refresh-core');
const { boundDescription } = require('./event-signals');
const { htmlText, safeHtmlText } = require('./feed-text');
const { SERVICE_REGIONS, LEGACY_REGION_ID, serviceRegionForLocation } = require('./service-regions');
const { isCancelledTitle, isRestrictedListing } = require('./event-availability');

const venueKey = (name) => String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const text = (value) => typeof value === 'string' ? value : typeof value?.val === 'string' ? value.val : '';

// Trumba (the Salt Lake County calendars) prepends its custom fields to
// DESCRIPTION as "Label: value<br>" segments: address, ages, neighborhood,
// registration and the department's staff phone, email and contact name.
// Buncombe County's library calendars open with "Location: …<br>Phone:" (or
// Phone alone for off-site programs) and add email, age group, branch and
// link fields. They are listing metadata,
// not prose, and staff contact details are not onto's to repeat on a card.
// Only descriptions carrying a Trumba marker are touched, and only the known
// labels are dropped; any prose survives.
const TRUMBA_MARKER = /(?:^|<br\s*\/?>)\s*(?:Event Location\/Address|Department (?:Phone|Email)):|^\s*(?:Location:[^<]*<br\s*\/?>\s*)?Phone:[^<]*<br\s*\/?>\s*(?:Email|Event Type):/i;
const TRUMBA_FIELDS = new Set([
  'event location/address', 'ages', 'neighborhood', 'event type', 'register link',
  'department phone', 'department email', 'contact name', 'contact phone', 'contact email',
  'sensory friendly program', 'asl', 'spanish interpretation',
  'other languages avaliable', 'other languages available', 'cost',
  'location', 'phone', 'email', 'age group', 'library', 'link',
]);

function displayDescription(raw) {
  if (!TRUMBA_MARKER.test(raw)) return raw;
  return raw.split(/<br\s*\/?>/i).filter((segment, index, segments) => {
    const label = /^\s*([A-Za-z][A-Za-z /]{0,40}?)\s*:/.exec(segment)?.[1];
    if (label && TRUMBA_FIELDS.has(label.toLowerCase())) return false;
    // Captured fixtures cut long text with "[trimmed]". In a Trumba listing a
    // cut final segment with no colon is a field label cut short, not prose.
    return !(index === segments.length - 1 && /\[trimmed\]\s*$/.test(segment) && !segment.includes(':'));
  }).join('<br>').replace(/^(?:\s*<br>)+|(?:<br>\s*)+$/g, '').trim();
}

function explicitAllAges(words) {
  const claim = /\ball[-\s]?ages\b/i.exec(words);
  if (!claim) return false;
  // Scan the full remaining text once, without a repeated unbounded wildcard
  // for every all-ages phrase in a large description.
  return !/\b(?:not|no|never)\b[\s\S]{0,40}\ball[-\s]?ages\b/i.test(words)
    && !/\b(?:no|not|never|prohibited|forbidden|excluded|restricted|except|excluding)\b/i.test(words.slice(claim.index + claim[0].length));
}

function secureUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

function isPlaceholderEvent(title) {
  return /\brun host needed\b/i.test(title)
    || /^\s*(?:library\s+(?:is\s+)?closed\b|library\s+(?:is\s+)?open\s+\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?|[–—-]))/i.test(title);
}

// "CLOSED for THANKSGIVING" on a venue calendar announces that nothing
// happens. "Closed Captioned Screening" or "Closed Door Session" do not.
// A short name may come first ("Shalom Closed for Teacher Trainings").
function isClosureNotice(title) {
  return /^\s*(?:[*[(]+\s*)?(?:[\w'’&.-]+\s+){0,3}?closed\b(?:\s+(?:for|on|today|tonight|until)\b|\s*[:!–—-]|\s*[*\])]*\s*$)/i.test(title);
}

// A congregation's calendar also carries funerals, visitations, weddings and
// baptisms for named people ("Funeral for …"). They are not public
// happenings to list. A feast such as "Baptism of the Lord" still is.
function isPersonalCeremony(title) {
  return /^\s*(?:funeral|visitation|viewing|memorial|wedding|baptism|christening|trisagion)(?:\s+service)?\s+(?:for|of)\b(?!\s+(?:the\s+lord|christ|jesus|our\s+lord)\b)/i.test(title);
}

function locationCandidate(value) {
  const raw = text(value).trim();
  if (!raw) return '';
  // A location that is a web address is never a venue name. Feeds also emit
  // truncated bare domains with no scheme, which must not reach the alias
  // worklist. A name that only starts with one ("ExploreAsheville.com Arena")
  // is still a name.
  if (/^https?:\/\//i.test(raw) || /^maps\.app\.goo\.gl\//i.test(raw)
    || /^[^\s]*\.(?:com|org|net|edu|gov|io|co|us|app|gl|info|me)\b\S*(?:\s*$|\s+[(\d])/i.test(raw)) return '';
  const key = venueKey(raw);
  if (/^(zoom|microsoft teams|virtual|n\/a|tbd|tba)$/.test(key)) return '';
  return raw;
}

function meetingSpotFromDescription(description, { html = true } = {}) {
  // Preserve paragraph boundaries before later venue-clause decoding collapses
  // whitespace.
  const raw = html ? text(description)
    .replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, ' ')
    : text(description);
  // Ignore complete time-only meeting clauses, then still look for a named
  // place in a later sentence. A time alone does not veto the default venue.
  const places = raw.replace(/\bmeet(?:ing)?\s+(?:at|@)\s+(?:(?:[01]?\d|2[0-3])(?::[0-5]\d)?[^\S\r\n]*(?:[ap]\.?m\.?)?|noon|midnight)(?:[^\S\r\n]+to[^\S\r\n]+carpool)?(?=[^\S\r\n]*(?:[.;\r\n]|$))/gi, '');
  // "Meet at the Arboretum and return to the Arboretum": the place ends where
  // the trip begins.
  const match = places.match(/\bmeet(?:ing)?\s+(?:at|@)\s+(.+?)(?=\s+at\s+\d|\s+to\s+carpool|\s+and\s+(?:return|then)\b|(?<!&[a-zA-Z0-9#]{1,32});(?=\s)|[!?](?=\s)|\n|$)/i);
  if (!match) return '';
  const candidate = match[1].trim().replace(/[,;.]+$/g, '').trim();
  return candidate;
}

function findVenue(location, venues) {
  const key = venueKey(location);
  if (!key) return null;
  return venues.find((v) => [v.name, ...v.aliases].some((name) => venueKey(name) === key)) ?? null;
}

// A publisher's room labels belong to that feed, not the global registry.
// Never let a generic 'Main Library' or 'Taproom Stage' alias remap another
// publisher's event: a feed's `venueAliases` apply to that feed alone.
function findScopedVenue(location, feed, venues) {
  const key = venueKey(location);
  const scoped = key && Object.entries(feed?.venueAliases ?? {}).find(([alias]) => venueKey(alias) === key);
  return scoped ? findVenue(scoped[1], venues) : null;
}

// "Birding at Lake Junaluska": the place a title names after "at", read as
// its run of capitalized words. Times of day are not places.
function titlePlace(title) {
  const match = /\b[Aa][Tt]\s+((?:[Tt]he\s+)?[A-Z][\w'’.&-]*(?:\s+(?:of|the|and|&|[A-Z][\w'’.&-]*))*)/.exec(text(title));
  const place = match ? match[1].replace(/(?:\s+(?:of|the|and|&))+$/, '') : '';
  return /^(?:noon|midnight|dawn|dusk|sunrise|sunset|night)$/i.test(place) ? '' : place;
}

// James, 2026-10-08 (reevaluated): a listing needs a place a typical local
// could find on their own or with a phone map, not an exact meeting point.
// "Meet at the trailhead" at a named park, a campus room, or a location that
// only repeats the venue's own town all point somewhere a person can get to.
// Coordinates still come only from a registered place; nothing is geocoded.
const SPOT_WORDS = String.raw`(?:parking(?:\s+(?:lot|area|garage|deck))?|trail\s*head(?:\s+parking(?:\s+(?:lot|area))?)?|entrance|entry|gates?|lobby|front\s+desk|welcome\s+desk|information\s+desk|box\s+office|visitors?['’]?\s+cent(?:er|re)|front\s+porch|porch|front\s+steps|flag\s*pole|fountain|kiosk|picnic\s+(?:shelter|area|tables?))`;
const SPOT_MODIFIERS = String.raw`(?:(?:main|front|back|rear|side|upper|lower|north|south|east|west|large|small|gravel|overflow|public)\s+)*`;
const GENERIC_SPOT = new RegExp(String.raw`^(?:the\s+|our\s+)?${SPOT_MODIFIERS}${SPOT_WORDS}$`, 'i');
const SPOT_OF_PLACE = new RegExp(String.raw`^(?:the\s+|our\s+)?${SPOT_MODIFIERS}${SPOT_WORDS}\s+(?:at|of|for|to|by|near|in|inside|outside|behind)\s+(.+)$`, 'i');
const PLACE_SPOT = new RegExp(String.raw`^(?:the\s+)?(.+?)(?:['’]s)?\s+${SPOT_MODIFIERS}${SPOT_WORDS}$`, 'i');

// Spots are short phrases; a long clause is never matched against the
// nested patterns.
const SPOT_LIMIT = 120;
const isGenericSpot = (place) => place.length <= SPOT_LIMIT && GENERIC_SPOT.test(place.trim());

// "The Bent Creek trailhead" or "the parking lot at Carrier Park": the place
// a local would type into a map.
function spotPlace(place) {
  const value = place.trim();
  if (value.length > SPOT_LIMIT) return '';
  const named = (SPOT_OF_PLACE.exec(value)?.[1] ?? PLACE_SPOT.exec(value)?.[1] ?? '').trim();
  return /^[A-Z0-9]/.test(named.replace(/^the\s+/i, '')) ? named : '';
}

function lookupPlace(name, feed, venues) {
  if (!name) return null;
  return [name, name.replace(/^the\s+/i, '')]
    .map((candidate) => findScopedVenue(candidate, feed, venues) ?? findVenue(candidate, venues)).find(Boolean) ?? null;
}

const STATE_NAMES = { NC: 'North Carolina', UT: 'Utah', VT: 'Vermont' };

// "NC", "Swannanoa, NC" or "Asheville, North Carolina 28801" on a venue's own
// calendar names only the town it is already in.
function isOwnArea(place, venue) {
  const key = venueKey(place).replace(/\./g, '').replace(/,?\s*(?:usa|united states)$/, '')
    .replace(/\s+\d{5}(?:-\d{4})?$/, '').replace(/\s*,\s*/g, ', ').trim();
  const town = venueKey(venue.locality);
  // Utah's registry entries predate the region field, as in calendarRecord.
  const region = venue.region ?? 'UT';
  const states = [region, STATE_NAMES[region]].filter(Boolean).map(venueKey);
  return [...states, town, ...states.flatMap((state) => [`${town}, ${state}`, `${town} ${state}`])].includes(key);
}

// A town and state ("Charlotte, NC") or a street number places a listing
// somewhere other than the feed's own venue.
const namesElsewhere = (place) => /,\s*[A-Z]\.?\s?[A-Z]\.?\s*(?:\d{5}(?:-\d{4})?)?\s*$/.test(place) || /^\d+\s+[A-Za-z]/.test(place);

const TOWNS = new Set(SERVICE_REGIONS.flatMap((region) => [
  ...(region.groups ?? []).flatMap((group) => group.municipalities), ...(region.hubs ?? []).map((hub) => hub.name),
]).map(venueKey));

// "Online" or "Zoom Meeting" is not a room. A physical "Zoom Room" can be.
const isOnlinePlace = (place) => /^(?:online|virtual|webinar|zoom|microsoft teams)(?:\s+(?:meeting|call|link|webinar|session|event|class|only))?$/i.test(venueKey(place));

// A campus calendar's "Sage Cafe" or "Sunderland, 007" is a room a visitor
// finds by asking or reading the campus map. A town, state, street address
// or online placeholder is not.
function isCampusRoom(place) {
  if (!place || Array.from(place).length > 80 || namesElsewhere(place) || isOnlinePlace(place) || /,\s*[A-Z]\.?\s?[A-Z]\.?\b/.test(place)) return false;
  const words = venueKey(place).split(/[^a-z]+/);
  return !words.some((word, index) => [1, 2, 3].some((size) => {
    const candidate = words.slice(index, index + size).join(' ');
    if (candidate === 'reading' && words[index + size] === 'room') return false;
    return TOWNS.has(candidate);
  }));
}

// "Where: …" or "Location: …" in a listing's text. The value ends at the next
// one-word field label ("Distance:", "Time:") or sentence. "St." and "Mt." are
// abbreviations, not sentence ends: cutting there would hide another town.
const PLACE_LABEL = /(?:^|\n|[.!?]\s+|:\s+)[^\S\n]*(?:where|location|meeting\s+(?:place|point|spot|location)|meet(?:ing)?\s+(?:location|spot)|trailhead)\s*:[^\S\n]*([^\n]+)/i;

function labeledPlace(description, { html = true } = {}) {
  const raw = html ? text(description)
    .replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, ' ')
    : text(description);
  const match = PLACE_LABEL.exec(raw);
  if (!match) return '';
  return match[1].split(/\s+(?=[A-Z][a-z]+\s*:)|(?<![A-Z][a-z]?)\.\s|\s[|–—]\s|;/)[0].trim().replace(/[,;.]+$/, '').trim();
}

// A listing that says it happens only online has no place to go. Streaming
// an in-person gathering ("live-streamed on Zoom") or offering a link
// alongside it does not make it online-only. "Not in person" is not an
// in-person gathering, and a Zoom aside does not cancel a title that is
// itself online. Opted-in feeds can let an explicit online-only declaration
// outrank that streaming exception; hybrid audiences and other feeds do not.
function isOnlineEvent(title, description, { onlineOnlyBeforeStream = false } = {}) {
  const words = `${title} ${description}`;
  const titleOnline = /\b(?:zoom|webinar)\b|[([]\s*(?:virtual|online)\s*[)\]]|^\s*(?:virtual|online)\s*[:–—-]|[:–—-]\s*(?:virtual|online)\s*$/i.test(title);
  const gatherings = words.match(/\b(?:in[-\s]person|hybrid)\b/gi) ?? [];
  const negated = words.match(/\b(?:not|no|never|isn['’]t|aren['’]t)\s+(?:an?\s+|the\s+)?(?:in[-\s]person|hybrid)\b/gi) ?? [];
  const inPerson = gatherings.length > negated.length;
  const liveStream = /\blive[-\s]?stream(?:ed|ing)?\b/i.test(words);
  const zoomAside = !titleOnline && /\b(?:also|or\s+join)\b[^.]{0,40}\bzoom\b/i.test(words);
  if (inPerson || zoomAside) return false;
  if (onlineOnlyBeforeStream && /\bonline[-\s]only\b/i.test(words)) return true;
  if (liveStream) return false;
  return titleOnline
    || /\b(?:gathers|meet(?:s)?|is\s+held|takes\s+place)\s+(?:online|virtually|on\s+zoom|via\s+zoom)\b|\bonline[-\s]only\b|\b(?:virtual|online)\s+(?:event|program|celebration|meeting|session|class|talk|gathering)\b(?!\s+calendar\b)/i.test(description);
}

// "The JCC is pleased to be a sponsor of this year's festival": a sponsor's
// listing is not at the sponsor's own building.
const SPONSOR_NOTE = /\b(?:is|are)\s+(?:pleased|proud|happy|honou?red|excited|delighted)\s+to\s+(?:be\s+)?(?:an?\s+)?(?:official\s+)?(?:co-?)?sponsor/i;

function isMapLocation(value) {
  try {
    const url = new URL(/^maps\.app\.goo\.gl\//i.test(value) ? `https://${value}` : value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && (['maps.app.goo.gl', 'maps.google.com'].includes(url.hostname)
        || ['google.com', 'www.google.com'].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname));
  } catch { return false; }
}

function resolveMeetingVenue(meeting, venues, decodeHtml, feed) {
  // A feed's own venue aliases count as meeting places for that feed only.
  const scoped = Object.entries(feed?.venueAliases ?? {}).map(([alias, target]) => ({
    venue: findVenue(target, venues), key: venueKey(alias) })).filter((alias) => alias.venue);
  const aliases = [...scoped, ...venues.flatMap((venue) => [venue.name, ...venue.aliases]
    .map((name) => ({ venue, key: venueKey(name) })))];
  let prefix = '';
  let matched = null;
  // Continue across a period only if a curated name can extend that prefix.
  // This handles J. Willard without decoding unrelated later sentences or
  // building every possible long prefix of an unbounded description.
  for (const part of meeting.split(/\.(?=\s)|(?<!&[a-zA-Z0-9#]{1,32});(?=\s)|[!?](?=\s)/)) {
    let decoded;
    try { decoded = decodeHtml ? htmlText(part) : part.trim(); }
    catch (error) { if (matched) return matched; throw error; }
    prefix = prefix ? `${prefix}. ${decoded}` : decoded;
    const key = venueKey(locationCandidate(prefix));
    if (!key) break;
    const keys = [key, key.replace(/^the\s+/i, '')];
    for (const candidate of keys) {
      const exact = aliases.find((alias) => alias.key === candidate);
      if (exact) { matched = { venue: exact.venue, candidate: prefix }; break; }
    }
    if (!aliases.some((alias) => keys.some((candidate) => alias.key.startsWith(`${candidate}. `)))) break;
  }
  return matched ?? { venue: null, candidate: meeting };
}

function decodedPlace(place, decodeHtml) {
  try { return decodeHtml ? htmlText(place) : place.trim(); } catch { return place.trim(); }
}

// Online-only and sponsor-only listings have no place at the feed's own
// building. A different registered place named in the location or meeting
// point still wins.
function refusesHome(event) {
  const description = safeHtmlText(text(event.description));
  if (isOnlineEvent(text(event.title), description)) return { venue: null, candidate: '', online: true };
  if (SPONSOR_NOTE.test(description)) return { venue: null, candidate: '' };
  return null;
}

// A mixed venue's own title words ("Volleyball", "Craft Fair") pick the
// category its feed maps them to (`titleCategories`); anything else keeps the
// feed's default.
function titleCategory(title, feed) {
  const words = title.toLowerCase();
  return Object.entries(feed?.titleCategories ?? {})
    .find(([phrase]) => new RegExp(`(?<![a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(words))?.[1];
}

function resolveVenue(event, feed, venues) {
  const explicit = text(event.location).trim();
  const home = feed?.venueHint ? findVenue(locationCandidate(feed.venueHint), venues) : null;
  const refusal = refusesHome(event);
  const accept = (result) => refusal && result.venue && home && result.venue === home ? refusal : result;
  // An unknown off-site LOCATION must never become the feed's home venue.
  // Only map links may defer to a named meeting point; online/TBD stays unknown.
  // A spot at the venue ("Front Lobby"), its own town ("NC") or, on a campus
  // feed, a room ("Sage Cafe") is the home venue.
  if (explicit && !isMapLocation(explicit)) {
    const candidate = locationCandidate(explicit);
    const venue = lookupPlace(candidate, feed, venues) ?? lookupPlace(spotPlace(candidate), feed, venues);
    if (venue) return accept({ venue, candidate: explicit });
    if (home && candidate && (isGenericSpot(candidate) || isOwnArea(candidate, home))) return accept({ venue: home, candidate: explicit });
    if (home && feed.campusRooms && isCampusRoom(candidate)) return accept({ venue: home, candidate: explicit, room: candidate });
    return { venue: null, candidate: explicit };
  }
  const rawDescription = typeof event.rawDescription === 'string' ? event.rawDescription : undefined;
  const decodeHtml = rawDescription !== undefined || feed?.kind !== 'rss';
  const description = rawDescription ?? event.description;
  const meeting = meetingSpotFromDescription(description, { html: decodeHtml });
  // A spot with no place of its own ("meet at the trailhead") belongs to the
  // place the title names, else the feed's own venue.
  let spot = false;
  // An unrecognized "Where:" value is only reported, never trusted over the
  // feed's own venue.
  let reported = '';
  if (meeting) {
    const resolved = resolveMeetingVenue(meeting, venues, decodeHtml, feed);
    if (resolved.venue) return accept(resolved);
    // The meeting clause runs to the end of its line; its first sentence names the spot.
    const place = decodedPlace(meeting, decodeHtml).split(/\.(?=\s)/)[0].trim();
    const venue = lookupPlace(spotPlace(place), feed, venues);
    if (venue) return accept({ venue, candidate: place });
    if (isGenericSpot(place)) spot = true;
    else if (home && isOwnArea(place, home)) return accept({ venue: home, candidate: place });
    else return resolved;
  } else {
    const label = decodedPlace(labeledPlace(description, { html: decodeHtml }), decodeHtml);
    const candidate = locationCandidate(label);
    if (label && !candidate) return { venue: null, candidate: label };
    if (candidate) {
      const venue = lookupPlace(candidate, feed, venues) ?? lookupPlace(spotPlace(candidate), feed, venues);
      if (venue) return accept({ venue, candidate: label });
      if (isGenericSpot(candidate)) spot = true;
      else if (home && isOwnArea(candidate, home)) return accept({ venue: home, candidate: label });
      else if (namesElsewhere(candidate)) return { venue: null, candidate: label };
      else reported = label;
    }
  }
  // A campus feed can also run trips elsewhere with no location and no
  // meeting point ("Birding at Lake Junaluska"). With `offSiteTitles`, a
  // title naming a place other than the feed's own is where the trip goes:
  // a registered place, or an unmapped one, never the venue hint.
  const place = !explicit && (feed?.offSiteTitles || spot) ? titlePlace(event.title) : '';
  if (place) return accept({ venue: lookupPlace(place, feed, venues), candidate: place });
  if (explicit) return { venue: null, candidate: explicit };
  if (!home) return { venue: null, candidate: reported };
  return accept({ venue: home, candidate: feed.venueHint });
}

/**
 * The rating and what it rests on. `signal`: the listing, the venue's legal-age
 * rule or the feed states it. `venue-default`: a bar or club (or a nightlife
 * feed's unnamed spot) with no age statement, rated mature by default.
 * `all-ages`: a bar or club listing that states All Ages. `listing`: anything
 * else. James, 2026-10-08: a default never outweighs a venue's own All Ages.
 */
function rateCalendarEventWithBasis(event, venue, feed) {
  const title = text(event.title);
  const description = text(event.description);
  const ageNote = text(event.ageNote);
  const words = `${title} ${description} ${ageNote}`;
  const allAges = [title, description, ageNote].some(explicitAllAges);
  const titleAllAges = explicitAllAges(title);
  const explicitAgeException = titleAllAges || explicitAllAges(ageNote)
    || venue?.kind === 'bar' && explicitAllAges(description);
  const ratingDescription = description.replace(/\bfamily\b/gi, '');
  const ratingText = safeHtmlText(description)
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, ' ');
  const explicitMatureRating = ['R', 'NC-17'].includes(event.filmRating)
    || /\brating\s*:\s*(?:r|nc-17)\s*(?=\n|$|production\s+year\s*:)/i.test(ratingText);
  const explicitAgeRestriction = /\b(?:18|21)\s*(?:\+|only\b|and\s+(?:over|up|older)\b)/i.test(words);
  // These phrases describe relatives or genealogy, not a children's activity.
  // Keep the public title unchanged and retain stronger child/age evidence.
  const ratingTitle = title.replace(/\bfamily\s+(?=history\b|vets\s+town\s+hall\b)/gi, '');
  const eventSignals = {
    legalAgeEnforced: venue?.legalAgeEnforced === true,
    name: ratingTitle,
    description: ratingDescription,
    info: ageNote,
    pleaseNote: ageNote,
  };
  const eventRating = rateEvent(eventSignals);
  const venueRating = rateEvent({ ...eventSignals, venueName: venue?.name, locality: venue?.locality });
  const matureSignal = eventRating === 'mature' || venueRating === 'mature'
    || explicitMatureRating || explicitAgeRestriction
    || /\bdrag\s+(?:show|brunch|queens?)\b/i.test(words) || feed?.defaultRating === 'mature';
  const matureDefault = feed?.defaultCategory === 'nightlife' && venue?.kind === 'other'
    || venue?.allAges === false || ['bar', 'club'].includes(venue?.kind);
  const canOverrideDefault = explicitAgeException && venue?.legalAgeEnforced !== true
    && venue?.allAges !== false && feed?.defaultRating !== 'mature';
  const familyActivity = /\b(?:story\s*time|sesame|disney)\b/i.test(`${title} ${description}`)
    || /\bfamily\b/i.test(ratingTitle)
    || !titleAllAges && /\b(?:kids?(?!\s+area)|children?)\b/i.test(`${title} ${description}`)
    || feed?.defaultRating === 'family';
  const rating = matureSignal || matureDefault && !canOverrideDefault
    ? 'mature'
    : familyActivity ? 'family' : allAges ? 'general' : eventRating;
  const basis = rating === 'mature'
    ? matureSignal ? 'signal' : 'venue-default'
    : allAges && rating === 'general' ? 'all-ages'
      : /\bfree\b/i.test(words) && !/\b(?:not|no)\s+free\b/i.test(words) ? 'free'
        : 'listing';
  return { rating, basis };
}

function rateCalendarEvent(event, venue, feed) {
  return rateCalendarEventWithBasis(event, venue, feed).rating;
}

function calendarRecord(event, { feed, venues, skip = () => {} }) {
  const title = text(event.title).trim();
  if (!event.uid || !title) { skip('missing identity or title'); return null; }
  // A source's own calendar notices are not activities. Exact exclusions keep
  // new public game titles flowing without a global keyword rule.
  if (feed.nonEventTitles?.includes(title)) { skip('publisher non-event notice'); return null; }
  if (isPlaceholderEvent(title)) { skip('placeholder event'); return null; }
  if (isClosureNotice(title)) { skip('closure notice'); return null; }
  if (isPersonalCeremony(title)) { skip('personal ceremony'); return null; }
  if (Array.isArray(feed?.nonEventTitles) && feed.nonEventTitles.includes(title)) {
    skip('publisher non-event notice');
    return null;
  }
  // A feed may name the access words its publisher uses for members' or
  // passholders' events ("Members Show", "Passholder Exclusive").
  const restricted = feed?.restrictedPattern ? new RegExp(feed.restrictedPattern, 'i') : null;
  if (isRestrictedListing(title, text(event.description)) || restricted?.test(`${title}\n${safeHtmlText(text(event.description))}`)) {
    skip('restricted or room-booking listing'); return null;
  }
  // Mixed public publishers can retain a building in an online-only listing.
  // Opt in at the source boundary; preserve existing home/off-site semantics
  // for other feeds and the shared detector's explicit hybrid exceptions.
  // An explicit online-only declaration outranks a streaming aside here.
  if (feed.excludeOnlineOnly && isOnlineEvent(title, safeHtmlText(text(event.description)), { onlineOnlyBeforeStream: true })) {
    skip('online event'); return null;
  }
  // A publisher may mark placeholder rows that are not events ("NO OTHER EVENTS").
  if (Array.isArray(feed?.nonEventTitles) && feed.nonEventTitles.some((notice) => title === notice)) {
    skip('publisher non-event notice'); return null;
  }
  const { venue, candidate, room, online } = resolveVenue(event, feed, venues);
  if (online) { skip('online event'); return null; }
  if (!venue) { skip(candidate ? 'unmapped venue' : 'missing location', locationCandidate(candidate)); return null; }
  const venueRegion = serviceRegionForLocation({ ...venue, countryCode: venue.countryCode ?? 'US' });
  if (feed.serviceRegion && venueRegion?.id !== feed.serviceRegion) { skip('outside feed service region'); return null; }
  if (!feed.serviceRegion && venueRegion && venueRegion.id !== LEGACY_REGION_ID) { skip('missing feed service region'); return null; }
  if (!Number.isFinite(Date.parse(event.start))) { skip('missing event date'); return null; }
  // Typed tuples distinguish a recurring slot from a one-off UID containing
  // the same date/delimiters. No live calendar identities have shipped yet.
  const identity = JSON.stringify(event.occurrence ? ['recurring', event.uid, event.occurrence] : ['single', event.uid]);
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  const sourceText = text(event.description).trim();
  const shown = displayDescription(text(event.displayDescription ?? sourceText)).trim() || title;
  // A campus room the listing names only in its location stays on the card.
  const description = room && !venueKey(safeHtmlText(shown)).includes(venueKey(room)) ? `Where: ${room}. ${shown}` : shown;
  const timezone = event.timezone ?? feed.timezone;
  // Reviewed publisher titles classify mixed calendars without a fuzzy global
  // keyword rule. A source's native category still takes precedence.
  // Exact title map wins over the phrase matcher; do not shadow the function.
  const exactTitleCategory = feed.categoryByTitle && Object.hasOwn(feed.categoryByTitle, title)
    ? feed.categoryByTitle[title] : undefined;
  const dateParts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(event.start));
  return {
    id: `${feed.kind}-${feed.id}-${digest}`,
    sourceEventId: Array.from(identity).length <= 200 ? identity : `sha256:${digest}`,
    sourceName: feed.name, sourceKind: feed.sourceKind ?? 'community', source: 'live',
    sourceUrl: secureUrl(text(event.url)) ?? secureUrl(feed.listingUrl) ?? secureUrl(feed.url),
    title, description: boundDescription(description), category: event.category ?? exactTitleCategory ?? titleCategory(title, feed) ?? feed.defaultCategory,
    // Classify the complete source text, including mature signals beyond the
    // database's description limit; shortening display text never lowers rating.
    ...(({ rating, basis }) => ({ rating, ratingBasis: basis }))(
      rateCalendarEventWithBasis({ title, description: sourceText || title, ageNote: text(event.ageNote).trim() || undefined,
        filmRating: event.filmRating }, venue, feed)),
    venue: venue.name, venueKind: venue.kind, area: venue.address,
    locality: venue.locality, region: venue.region ?? 'UT', countryCode: venue.countryCode ?? 'US',
    lat: event.geo?.lat ?? venue.lat, lng: event.geo?.lon ?? venue.lng,
    startsAtIso: new Date(event.start).toISOString(),
    ...(event.end ? { endsAtIso: new Date(event.end).toISOString() } : {}),
    timezone, localDay: ['year', 'month', 'day'].map((key) => dateParts.find((part) => part.type === key).value).join('-'),
    whenLabel: whenLabelFor(event.start, timezone),
    startsInMinutes: 0, attendees: 0, isCancelled: event.cancelled === true || isCancelledTitle(title),
  };
}

module.exports = {
  calendarRecord, rateCalendarEvent, rateCalendarEventWithBasis, explicitAllAges, venueKey, text, displayDescription,
  meetingSpotFromDescription, resolveVenue, isPlaceholderEvent, isClosureNotice, isPersonalCeremony, isRestrictedListing, locationCandidate, titlePlace,
  labeledPlace, spotPlace, isGenericSpot, isOwnArea, isCampusRoom, isOnlineEvent,
};
