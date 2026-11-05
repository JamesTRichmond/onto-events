// Ticketmaster Discovery API adapter: raw API events -> canonical records.
// This is the reference adapter — a future source (ICS/RSS, Eventbrite,
// JustServe curation) implements the same two functions: buildPagePlan()
// to enumerate requests, normalize() to emit canonical records (validated
// downstream by ../schema.js — adapters may emit null to skip an event).

const path = require('node:path');

const core = require(path.join(__dirname, '..', '..', 'refresh-core.js'));
const { categoryFor } = require('../category.js');
const { rateEvent } = require('../rating.js');
const { rateCalendarEvent, venueKey } = require('../calendar-record');
const { safeHtmlText } = require('../feed-text');
const venues = require('../../../data/venues.json');

const SOURCE_NAME = 'Ticketmaster';
const SLC = { lat: 40.7608, lng: -111.891 };
const RADIUS_MILES = 25;

// Discovery API limits: size max 200; deep paging cut off at size*page < 1000.
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

/**
 * Pages to fetch after seeing the first response's page info.
 * Returns an array of page numbers (0-based), first page included.
 */
function pagePlan(totalElements) {
  const total = Number.isFinite(totalElements) ? totalElements : 0;
  const needed = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages = Math.min(needed, MAX_PAGES);
  return Array.from({ length: pages }, (_, i) => i);
}

function requestUrl({ key, lat, lng, radiusMiles, page }) {
  return (
    `https://app.ticketmaster.com/discovery/v2/events.json` +
    `?apikey=${encodeURIComponent(key)}&latlong=${lat},${lng}&radius=${radiusMiles}&unit=miles` +
    `&sort=date,asc&size=${PAGE_SIZE}&page=${page}`
  );
}

function imageUrlFor(images) {
  if (!Array.isArray(images)) return undefined;
  const secure = images
    .filter((image) => typeof image?.url === 'string' && /^https:\/\//.test(image.url))
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return secure[0]?.url;
}

/** Map one raw Ticketmaster event to a canonical record, or null to skip. */
function normalize(ev) {
  if (typeof ev?.id !== 'string' || ev.id === '') return null;
  if (typeof ev?.name !== 'string' || ev.name.trim() === '') return null;
  // Constitution (onto.events): Jazz/Mammoth ticketing belongs to SeatGeek —
  // never serve those from Ticketmaster. Excluded until a SeatGeek adapter
  // exists. Only sports (or unclassified) listings are excluded, so e.g. a
  // music event that merely name-drops the team survives.
  const seg = ev.classifications?.[0]?.segment?.name?.toLowerCase();
  if (
    (seg == null || seg === 'sport' || seg === 'sports') &&
    /\butah jazz\b|\butah mammoth\b/i.test(ev.name)
  ) {
    return null;
  }
  const venue = ev._embedded?.venues?.[0];
  if (typeof venue?.name !== 'string' || venue.name === '') return null;
  const lat = core.parseCoord(venue?.location?.latitude);
  const lng = core.parseCoord(venue?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  const startIso = ev.dates?.start?.dateTime;
  if (!startIso || Number.isNaN(Date.parse(startIso))) return null;

  const classification = ev.classifications?.[0];
  const segment = classification?.segment?.name;
  const genre = classification?.genre?.name;
  const description = descriptionFor(ev.info, genre);

  const record = {
    id: `tm-${ev.id}`,
    sourceEventId: ev.id,
    title: ev.name.trim(),
    category: categoryFor(segment, genre),
    venue: venue.name,
    area:
      venue.city?.name === 'Salt Lake City'
        ? (venue.address?.line1 ?? 'Salt Lake City')
        : (venue.city?.name ?? 'Nearby'),
    locality: venue.city?.name ?? null,
    region: venue.state?.stateCode ?? venue.state?.name ?? 'UT',
    countryCode: venue.country?.countryCode ?? 'US',
    timezone: venue.timezone ?? 'America/Denver',
    imageUrl: imageUrlFor(ev.images),
    isCancelled: ev.dates?.status?.code === 'cancelled',
    lat,
    lng,
    whenLabel: core.whenLabelFor(startIso, venue.timezone),
    startsInMinutes: 0, // overridden at runtime from startsAtIso
    startsAtIso: startIso,
    ...(ev.dates?.end?.dateTime ? { endsAtIso: ev.dates.end.dateTime } : {}),
    description,
    attendees: 0, // Discovery provides no attendance count; never invent one.
    rating: rateEvent({
      familyFlag: classification?.family === true,
      // Ticketmaster's hard age-restriction flag: the strongest mature signal.
      legalAgeEnforced: ev.ageRestrictions?.legalAgeEnforced === true,
      name: ev.name,
      venueName: venue.name,
      locality: venue.city?.name,
      genre,
      segment,
      description,
      // Rate on the FULL info and pleaseNote — "must be 21" often sits past
      // the 140-char description cut, and pleaseNote is where TM puts it.
      info: ev.info,
      pleaseNote: ev.pleaseNote,
    }),
    source: 'live',
    sourceName: SOURCE_NAME,
    sourceKind: 'ticketing',
  };

  // A publisher-verified venue rule applies regardless of who sells tickets.
  // Rate the complete listing and retain stronger provider restrictions.
  const curated = venues.find((v) => [v.name, ...v.aliases].some((name) => venueKey(name) === venueKey(venue.name)));
  if (curated) {
    record.venueKind = curated.kind;
    if (record.rating !== 'mature') record.rating = rateCalendarEvent({
      title: ev.name, description: [ev.info, ev.pleaseNote, genre].filter(Boolean).join(' '),
    }, curated, { defaultCategory: record.category, defaultRating: classification?.family === true ? 'family' : 'general' });
  }

  if (typeof ev.url === 'string' && /^https:\/\//.test(ev.url)) {
    record.sourceUrl = ev.url;
  }
  // Ticketmaster's own venue-local calendar day, used by dedupe's weak rule
  // so an evening show doesn't roll to "tomorrow" under UTC. Internal-only:
  // never part of the canonical schema, stripped before emit.
  if (typeof ev.dates?.start?.localDate === 'string' && ev.dates.start.localDate !== '') {
    record.localDay = ev.dates.start.localDate;
  }
  return record;
}

/** Decode Ticketmaster markup/entities before applying the feed summary limit. */
function descriptionFor(info, genre) {
  const raw = typeof info === 'string' ? info : '';
  const text = raw ? safeHtmlText(raw) : '';
  if (text) return text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
  return genre ?? 'Tickets available.';
}

function snapshotFromPages(pages) {
  const items = pages.flatMap((page) => page?._embedded?.events ?? []);
  return { items, truncated: (pages[0]?.page?.totalElements ?? 0) > items.length };
}

async function fetchItems({ secrets = {}, fetchImpl, lat = SLC.lat, lng = SLC.lng, radiusMiles = RADIUS_MILES }) {
  const key = secrets.TM_KEY;
  if (!key) throw new Error('TM_KEY is required');
  async function fetchPage(page) {
    const response = await fetchImpl(requestUrl({ key, lat, lng, radiusMiles, page }), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Ticketmaster request failed (${response.status}): ${core.redactSecret(await response.text(), key)}`);
    }
    return response.json();
  }
  const first = await fetchPage(0);
  const pages = [first];
  for (const page of pagePlan(first?.page?.totalElements ?? 0).slice(1)) pages.push(await fetchPage(page));
  return snapshotFromPages(pages);
}

module.exports = {
  normalize, pagePlan, requestUrl, imageUrlFor, PAGE_SIZE, MAX_PAGES, SOURCE_NAME,
  SLC, RADIUS_MILES, snapshotFromPages,
  sourceName: SOURCE_NAME,
  idPrefix: 'tm-',
  sourceKind: 'ticketing',
  requiredSecrets: Object.freeze(['TM_KEY']),
  fixturePath: path.join(__dirname, '..', 'fixtures', 'tm-page.json'),
  parseFixture: (content) => snapshotFromPages([JSON.parse(content)]),
  fetch: fetchItems,
};
