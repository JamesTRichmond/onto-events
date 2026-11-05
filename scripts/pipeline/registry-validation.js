const { CATEGORIES, RATINGS } = require('./schema');
const { LEGACY_REGION_ID, getServiceRegion, serviceRegionForLocation } = require('./service-regions');
const { URL } = require('node:url');
const { venueKey } = require('./calendar-record');
const { kindBySourceName } = require('./source-trust');

const https = (value) => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
};
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// A standing schedule (kind `schedule`) names the publisher's own words that
// must stay on its page, and bounded occurrences: listed dates, or weekdays
// between two dates at most a year apart.
const clock = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value ?? '');
function validSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return false;
  const { evidence, events } = schedule;
  if (!Array.isArray(evidence) || !evidence.length || evidence.length > 10
      || evidence.some((phrase) => typeof phrase !== 'string' || phrase.trim().length < 3 || phrase.length > 200)) return false;
  if (!Array.isArray(events) || !events.length || events.length > 10) return false;
  return events.every((event) => event && typeof event.title === 'string' && event.title.trim() && Array.from(event.title).length <= 120
    && clock(event.start) && clock(event.end) && event.end > event.start
    && (event.description === undefined || typeof event.description === 'string' && event.description.length <= 1000)
    && (Array.isArray(event.dates)
      ? event.dates.length > 0 && event.dates.length <= 120 && event.dates.every(date) && event.weekdays === undefined
      : Array.isArray(event.weekdays) && event.weekdays.length > 0 && event.weekdays.every((day) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].includes(day))
        && date(event.from) && date(event.until) && event.until >= event.from && Date.parse(event.until) - Date.parse(event.from) <= 366 * 86400000));
}

// A `jsonld` or `labeled` feed follows only https links on the hosts it
// names, with paths matching its own bounded pattern.
function validEventLinks(eventPath, eventHosts) {
  if (typeof eventPath !== 'string' || !eventPath || eventPath.length > 200 || !Array.isArray(eventHosts) || !eventHosts.length || eventHosts.length > 5
      || eventHosts.some((host) => typeof host !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host))) return false;
  try { new RegExp(eventPath); return true; } catch { return false; }
}

// A `fullcalendar` feed may read descriptions from the same site's public
// WooCommerce Store API product list, and nothing else.
function validProductsUrl(productsUrl, url) {
  try {
    const products = new URL(productsUrl);
    return products.protocol === 'https:' && !products.username && !products.password && !products.search && !products.hash
      && products.hostname === new URL(url).hostname && products.pathname === '/wp-json/wc/store/v1/products';
  } catch { return false; }
}

function validPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > 200) return false;
  try { new RegExp(pattern, 'i'); return true; } catch { return false; }
}

function validateRegistries(feeds, venues) {
  const errors = [];
  const aliases = new Set();
  for (const v of venues) {
    if (!v.name || !Array.isArray(v.aliases) || !v.address || !v.locality || !https(v.sourceUrl) || !date(v.verifiedOn)
        || !['bar', 'club', 'theatre', 'hall', 'church', 'park', 'store', 'library', 'outdoor', 'other'].includes(v.kind)
        || ![true, false, 'unknown'].includes(v.allAges)
        || v.legalAgeEnforced !== undefined && typeof v.legalAgeEnforced !== 'boolean'
        || v.legalAgeEnforced === true && v.allAges !== false
        || !serviceRegionForLocation({ ...v, countryCode: v.countryCode ?? 'US' })) {
      errors.push(`Invalid venue: ${v.name ?? '(unnamed)'}`);
    }
    for (const name of [v.name, ...(Array.isArray(v.aliases) ? v.aliases : [])]) {
      const key = venueKey(name);
      if (!key || aliases.has(key)) errors.push(`Duplicate or empty venue alias: ${name}`);
      aliases.add(key);
    }
  }
  const ids = new Set();
  const names = new Set(['ticketmaster']);
  const urls = new Set();
  for (const f of feeds) {
    const canonicalUrl = https(f.url) ? new URL(f.url) : null;
    if (canonicalUrl) canonicalUrl.hash = '';
    const urlKey = canonicalUrl?.href ?? f.url;
    if (!/^[a-z0-9-]{1,163}$/.test(f.id ?? '') || typeof f.name !== 'string' || !f.name.trim()
        || Array.from(f.name).length > 80 || !https(f.url) || !['ics', 'rss', 'squarespace', 'tribe', 'rhp', 'middlebury', 'myrec', 'schedule', 'jsonld', 'fullcalendar', 'labeled', 'biltmore', 'revival', 'simcal', 'higherground', 'socrata'].includes(f.kind)
        || !CATEGORIES.includes(f.defaultCategory) || !RATINGS.includes(f.defaultRating)
        || !https(f.termsUrl) || !date(f.termsCheckedOn) || !f.notes || !f.fixturePath
        || !['community', 'aggregator'].includes(f.sourceKind)
        || f.minIntervalMs !== undefined && (!Number.isInteger(f.minIntervalMs) || f.minIntervalMs < 500 || f.minIntervalMs > 86400000)
        || f.timeoutMs !== undefined && (!Number.isInteger(f.timeoutMs) || f.timeoutMs < 1000 || f.timeoutMs > 60000)
        || f.pausedReason !== undefined && (typeof f.pausedReason !== 'string' || !f.pausedReason.trim() || Array.from(f.pausedReason).length > 200)
        || f.kind === 'socrata' && !f.pausedReason
        || f.requireTimedEvents !== undefined && (f.kind !== 'tribe' || typeof f.requireTimedEvents !== 'boolean')
        || f.requireFreeAdmission !== undefined && (f.kind !== 'tribe' || f.requireFreeAdmission !== true)
        || f.leadingDescriptionTime !== undefined && (f.kind !== 'tribe' || f.requireTimedEvents !== true || f.leadingDescriptionTime !== true)
        || f.retireMissing !== undefined && (!['ics', 'jsonld', 'tribe'].includes(f.kind) || f.retireMissing !== false)
        || f.ignoreDateOnlyEnd !== undefined && (f.kind !== 'jsonld' || f.ignoreDateOnlyEnd !== true)
        || f.excludeOnlineOnly !== undefined && f.excludeOnlineOnly !== true
        || f.omitContactDetails !== undefined && f.omitContactDetails !== true
        || f.listingUrl !== undefined && (f.kind !== 'ics' || typeof f.listingUrl !== 'string'
          || f.listingUrl.length > 2000 || !https(f.listingUrl))
        || f.nonEventTitles !== undefined && (f.kind !== 'ics' || !Array.isArray(f.nonEventTitles)
          || !f.nonEventTitles.length || f.nonEventTitles.length > 20
          || new Set(f.nonEventTitles).size !== f.nonEventTitles.length
          || f.nonEventTitles.some((title) => typeof title !== 'string' || !title.trim()
            || title !== title.trim() || Array.from(title).length > 200))
        || f.eventDateField && (f.kind !== 'rss' || !['dc:date', 'pubDate'].includes(f.eventDateField))
        || f.exportLimit !== undefined && (!['ics', 'jsonld'].includes(f.kind) || !Number.isInteger(f.exportLimit) || f.exportLimit < 1 || f.exportLimit > 1000)
        || (f.eventPath !== undefined || f.eventHosts !== undefined || f.kind === 'labeled') && (!['jsonld', 'labeled'].includes(f.kind) || !validEventLinks(f.eventPath, f.eventHosts))
        || f.kind === 'fullcalendar' && !f.venueHint
        || f.kind === 'biltmore' && (!f.venueHint || f.campusRooms !== true)
        || f.kind === 'revival' && !f.venueHint
        || f.productsUrl !== undefined && (f.kind !== 'fullcalendar' || !validProductsUrl(f.productsUrl, f.url))
        || f.listingUrl !== undefined && !https(f.listingUrl)
        || f.restrictedPattern !== undefined && !validPattern(f.restrictedPattern)
        || f.titleCategories !== undefined && (!f.titleCategories || typeof f.titleCategories !== 'object' || Array.isArray(f.titleCategories)
          || !Object.keys(f.titleCategories).length || Object.keys(f.titleCategories).length > 20
          || Object.entries(f.titleCategories).some(([phrase, category]) => !/^[a-z0-9][a-z0-9 &'’-]{1,39}$/.test(phrase) || !CATEGORIES.includes(category)))
        || f.offSiteTitles !== undefined && (f.offSiteTitles !== true || !f.venueHint)
        || f.campusRooms !== undefined && (f.campusRooms !== true || !f.venueHint)
        // Quarantine may remove invented rules; unpausing must supply valid evidence again.
        || (f.kind === 'schedule'
          ? (!(f.pausedReason && f.schedule === undefined) && !validSchedule(f.schedule)) || !f.venueHint
          : f.schedule !== undefined)
        || f.programCategories !== undefined && (f.kind !== 'myrec' || !f.programCategories || typeof f.programCategories !== 'object' || Array.isArray(f.programCategories)
          || !Object.keys(f.programCategories).length || Object.keys(f.programCategories).length > 10
          || Object.entries(f.programCategories).some(([name, category]) => !/^[A-Za-z &.]{1,80}$/.test(name) || !CATEGORIES.includes(category)))
        || f.kind === 'myrec' && f.programCategories === undefined
        || f.programIds !== undefined && (f.kind !== 'myrec' || !Array.isArray(f.programIds)
          || !f.programIds.length || f.programIds.length > 40 || new Set(f.programIds).size !== f.programIds.length
          || f.programIds.some((id) => typeof id !== 'string' || !/^\d{1,10}$/.test(id)))
        || f.allowedWeekdaysByProgram !== undefined && (f.kind !== 'myrec' || !f.allowedWeekdaysByProgram
          || typeof f.allowedWeekdaysByProgram !== 'object' || Array.isArray(f.allowedWeekdaysByProgram)
          || !Object.keys(f.allowedWeekdaysByProgram).length || Object.keys(f.allowedWeekdaysByProgram).length > 40
          || Object.entries(f.allowedWeekdaysByProgram).some(([id, weekdays]) => !/^\d{1,10}$/.test(id) || !f.programIds?.includes(id)
            || !Array.isArray(weekdays) || !weekdays.length || weekdays.length > 7 || new Set(weekdays).size !== weekdays.length
            || weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)))
        || f.calendarId !== undefined && (f.kind !== 'simcal' || typeof f.calendarId !== 'string' || !/^[1-9]\d{0,19}$/.test(f.calendarId))
        || f.publicTitles !== undefined && (f.kind !== 'simcal' || !Array.isArray(f.publicTitles)
          || !f.publicTitles.length || f.publicTitles.length > 20 || new Set(f.publicTitles).size !== f.publicTitles.length
          || f.publicTitles.some((title) => typeof title !== 'string' || !title.trim() || title !== title.trim() || Array.from(title).length > 200))
        || f.nonEventTitles !== undefined && (!Array.isArray(f.nonEventTitles)
          || !f.nonEventTitles.length || f.nonEventTitles.length > 20 || new Set(f.nonEventTitles).size !== f.nonEventTitles.length
          || f.nonEventTitles.some((title) => typeof title !== 'string' || !title.trim() || title !== title.trim() || Array.from(title).length > 200))
        || f.categoryByTitle !== undefined && (!f.categoryByTitle || typeof f.categoryByTitle !== 'object' || Array.isArray(f.categoryByTitle)
          || !Object.keys(f.categoryByTitle).length || Object.keys(f.categoryByTitle).length > 50
          || Object.entries(f.categoryByTitle).some(([title, category]) => !title.trim() || title !== title.trim()
            || Array.from(title).length > 200 || !CATEGORIES.includes(category)))
        || f.publicCategorySlugs !== undefined && (f.kind !== 'tribe' || !Array.isArray(f.publicCategorySlugs)
          || !f.publicCategorySlugs.length || f.publicCategorySlugs.length > 20
          || new Set(f.publicCategorySlugs).size !== f.publicCategorySlugs.length
          || f.publicCategorySlugs.some((slug) => typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)))
        || f.kind === 'simcal' && (f.calendarId === undefined || f.publicTitles === undefined
          || typeof f.venueHint !== 'string' || !f.venueHint.trim())
        || f.categoryMap !== undefined && (f.kind !== 'tribe' || !f.categoryMap || typeof f.categoryMap !== 'object' || Array.isArray(f.categoryMap)
          || !Object.keys(f.categoryMap).length || Object.keys(f.categoryMap).length > 20
          || Object.entries(f.categoryMap).some(([slug, category]) => !/^[a-z0-9-]{1,80}$/.test(slug) || !CATEGORIES.includes(category)))) errors.push(`Invalid feed: ${f.id}`);
    try { new Intl.DateTimeFormat('en', { timeZone: f.timezone }).format(); if (!f.timezone) throw new Error(); }
    catch { errors.push(`Invalid feed timezone: ${f.id}`); }
    const serviceRegion = f.serviceRegion === undefined ? null : getServiceRegion(f.serviceRegion);
    if (f.serviceRegion !== undefined && (!serviceRegion || f.timezone !== serviceRegion.timezone)) {
      errors.push(`Invalid feed service region: ${f.id}`);
    }
    const hint = f.venueHint && venues.find((v) => [v.name, ...(Array.isArray(v.aliases) ? v.aliases : [])]
      .some((name) => venueKey(name) === venueKey(f.venueHint)));
    if (hint) {
      const hintRegion = serviceRegionForLocation({ ...hint, countryCode: hint.countryCode ?? 'US' });
      if (hintRegion && (serviceRegion ? hintRegion.id !== serviceRegion.id : hintRegion.id !== LEGACY_REGION_ID)) {
        errors.push(`Venue hint outside feed service region: ${f.id}`);
      }
    }
    if (f.venueAliases !== undefined) {
      const entries = f.venueAliases && typeof f.venueAliases === 'object' && !Array.isArray(f.venueAliases)
        ? Object.entries(f.venueAliases) : null;
      const keys = new Set();
      if (!entries || entries.length > 100) errors.push(`Invalid feed venue aliases: ${f.id}`);
      for (const [alias, target] of entries ?? []) {
        const key = venueKey(alias);
        const venue = typeof target === 'string' && venues.find((v) => venueKey(v.name) === venueKey(target));
        const region = venue && serviceRegionForLocation({ ...venue, countryCode: venue.countryCode ?? 'US' });
        if (!key || Array.from(alias).length > 200 || keys.has(key) || !venue
            || region?.id !== (serviceRegion?.id ?? LEGACY_REGION_ID)) {
          errors.push(`Invalid feed venue alias: ${f.id}`);
        }
        keys.add(key);
      }
    }
    if (f.sourceKind !== kindBySourceName(f.name)) errors.push(`Source trust name map needs updating: ${f.id}`);
    if (f.venueHint && !aliases.has(venueKey(f.venueHint))) errors.push(`Unmapped venue hint: ${f.id}`);
    if (ids.has(f.id) || names.has(f.name?.toLowerCase()) || urls.has(urlKey)) errors.push(`Duplicate feed: ${f.id}`);
    ids.add(f.id); names.add(f.name?.toLowerCase()); urls.add(urlKey);
  }
  return errors;
}

module.exports = { validateRegistries };
