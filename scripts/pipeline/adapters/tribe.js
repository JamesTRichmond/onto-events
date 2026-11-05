const path = require('node:path');
const { URL } = require('node:url');
const { calendarRecord } = require('../calendar-record');
const { safeHtmlText, safeDisplayHtmlText } = require('../feed-text');
const { HORIZON_DAYS, localMidnight } = require('./ics');
const { recoverLeadingTime, explicitFilmRating } = require('./tribe-leading-time');

const DAY = 86400000;
const PER_PAGE = 50;
const MAX_PAGES = 60;

// The Events Calendar (WordPress) caps its ICS export at one listing page, 30
// upcoming events on most sites. Its public REST listing pages through the
// whole horizon. Venue coordinates stay with the curated registry: the
// plugin's map points are geocoded from whatever the site typed, and on
// Live Music Asheville several land in Ohio, California or Alaska.

// Live Music Asheville sells featured listings as all-day teasers ("COMING
// SATURDAY OCTOBER 17th | Band", "TONIGHT | Concert") on the days before the
// real listing. They are advertising, not events, and would land on the
// wrong day.
const TEASER = /^\s*(?:coming\b[^|]{0,60}|tonight)\s*\|/i;

function localDay(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  return ['year', 'month', 'day'].map((key) => parts.find((p) => p.type === key).value).join('-');
}

// Block-editor sites embed the plugin's own schedule line (an empty one
// leaves a bare "@") and "Add to calendar" menu in the event body. They are
// page chrome, not listing text.
function withoutCalendarChrome(description) {
  return description.replace(/^\s*@(?:\s+|$)/, '')
    .replace(/\s*\bAdd to calendar(?:\s+(?:Google Calendar|iCalendar|Outlook 365|Outlook Live))+\b\s*/gi, ' ').trim();
}

function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return NaN;
  return Date.parse(`${value.replace(' ', 'T')}Z`);
}

// The window is "ends after yesterday, starts before the horizon's last day".
// start_date/end_date would drop a run already under way (a month-long pop-up)
// and one that ends past the window (a holiday ice rink), and the retire step
// would then mark the stored row cancelled. Live Music Asheville reads
// ends_after by whole days (after the end of that day), so yesterday keeps
// all of today; sites that read it to the second return a superset, and ended
// listings are dropped below. `legacy` asks the old way, for sites whose plugin
// version ignores ends_after/starts_before (Paramount Theatre Vermont).
function pageUrl(feed, now, page, { legacy = false } = {}) {
  const url = new URL(feed.url);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set(legacy ? 'start_date' : 'ends_after', `${localDay(legacy ? now : now - DAY, feed.timezone)} 00:00:00`);
  url.searchParams.set(legacy ? 'end_date' : 'starts_before', `${localDay(now + HORIZON_DAYS * DAY, feed.timezone)} 23:59:59`);
  url.searchParams.set('page', String(page));
  return url.href;
}

function checkPage(body) {
  if (!body || !Array.isArray(body.events) || !Number.isInteger(body.total_pages) || body.total_pages < 0) {
    throw new Error('Invalid Events Calendar page');
  }
  return body;
}

// A site that ignores the window answers with every future event; reading it
// as a snapshot would page to the cap and misplace the retirement horizon.
const IGNORED_WINDOW = 'Events Calendar ignored the date window';
function checkWindow(body, now) {
  const limit = now + (HORIZON_DAYS + 2) * DAY;
  if (body.events.some((event) => utcInstant(event?.utc_start_date) >= limit)) throw new Error(IGNORED_WINDOW);
  return body;
}

// A feed's `categoryMap` files each listing under the onto category of the
// first site category it maps ("recreation" → sports for Highland's volleyball);
// unmapped listings keep the feed's default.
function mappedCategory(event, categoryMap) {
  const slugs = new Set((Array.isArray(event.categories) ? event.categories : []).map((category) => category?.slug));
  return Object.entries(categoryMap ?? {}).find(([slug]) => slugs.has(slug))?.[1];
}

// Opted-in publishers must keep both the public label and every structured
// amount explicitly free. Blank, member-only and mixed-price listings fail closed.
function verifiedFreeAdmission(event) {
  const amounts = event.cost_details?.values;
  return typeof event.cost === 'string' && /^free$/i.test(safeHtmlText(event.cost).trim())
    && Array.isArray(amounts) && amounts.length > 0
    && amounts.every((amount) => typeof amount === 'number' ? amount === 0
      : typeof amount === 'string' && /^0+(?:\.0+)?$/.test(amount.trim()));
}

function parseTribePages(pages, { now, timezone, requireTimedEvents = false, requireFreeAdmission = false, leadingDescriptionTime = false, categoryMap, publicCategorySlugs }) {
  const horizon = now + HORIZON_DAYS * DAY;
  const publicCategories = publicCategorySlugs ? new Set(publicCategorySlugs) : null;
  const diagnostics = {};
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  const items = [];
  const seen = new Set();
  let safeHorizon = horizon;
  pages.forEach(checkPage);
  if (pages.length && pages[0].total_pages > pages.length) {
    diagnostics['page cap'] = pages[0].total_pages - pages.length;
    const last = pages[pages.length - 1].events.at(-1);
    const lastStart = utcInstant(last?.utc_start_date);
    if (Number.isFinite(lastStart)) safeHorizon = Math.min(safeHorizon, lastStart);
  }
  for (const event of pages.flatMap((page) => page.events)) {
    const uid = String(event?.global_id ?? event?.id ?? '');
    if (!uid || seen.has(uid)) { bump(uid ? 'duplicate event' : 'missing identity'); continue; }
    seen.add(uid);
    if (event.hide_from_listings === true) { bump('hidden from listings'); continue; }
    if (requireFreeAdmission && !verifiedFreeAdmission(event)) { bump('unverified free admission'); continue; }
    // The upstream query can be ignored or change behavior. A reviewed subset
    // must remain enforced locally before internal committee rows become cards.
    if (publicCategories && !(Array.isArray(event.categories) && event.categories.some((category) => publicCategories.has(category?.slug)))) {
      bump('unreviewed public category'); continue;
    }
    // Recover a show clock only for a separately opted-in publisher contract.
    // Other strict feeds still exclude every date-only advertisement.
    const recovered = requireTimedEvents && leadingDescriptionTime ? recoverLeadingTime(event, timezone) : null;
    if (requireTimedEvents && event.all_day !== false && !recovered) { bump('missing occurrence time'); continue; }
    const title = safeHtmlText(String(event.title ?? ''));
    if (event.all_day === true && TEASER.test(title)) { bump('featured-listing teaser'); continue; }
    let start = recovered?.start ?? utcInstant(event.utc_start_date);
    let end = recovered ? NaN : utcInstant(event.utc_end_date);
    if (!Number.isFinite(start)) { bump('missing event date'); continue; }
    if (event.all_day === true && !recovered) {
      // Sites shift all-day events by their day cutoff (03:00 on Live Music
      // Asheville). Read them as whole local days, as the ICS adapter does.
      const days = Number.isFinite(end) && end > start ? Math.ceil((end - start) / DAY) : 1;
      start = +localMidnight(localDay(start, timezone).replace(/-/g, ''), timezone);
      end = +localMidnight(localDay(start + days * DAY + 12 * 3600000, timezone).replace(/-/g, ''), timezone);
    }
    if (start >= safeHorizon || (Number.isFinite(end) && end > start ? end : start + 3 * 3600000) <= now) continue;
    if (recovered) bump('description occurrence time');
    const venue = event.venue && !Array.isArray(event.venue) && typeof event.venue === 'object' ? event.venue : null;
    const rawDescription = typeof event.description === 'string' ? event.description : '';
    const filmRating = requireTimedEvents && leadingDescriptionTime ? explicitFilmRating(rawDescription) : undefined;
    const category = mappedCategory(event, categoryMap);
    items.push({
      uid,
      title,
      ...(category ? { category } : {}),
      description: withoutCalendarChrome(safeHtmlText(rawDescription)),
      displayDescription: withoutCalendarChrome(safeDisplayHtmlText(rawDescription)),
      ...(rawDescription ? { rawDescription } : {}),
      ...(filmRating ? { filmRating } : {}),
      location: venue && typeof venue.venue === 'string' ? safeHtmlText(venue.venue) : '',
      url: typeof event.url === 'string' ? event.url : '',
      timezone,
      start: new Date(start).toISOString(),
      ...(Number.isFinite(end) && end > start ? { end: new Date(end).toISOString() } : {}),
    });
  }
  return { items, truncated: true, horizon: new Date(safeHorizon).toISOString(), diagnostics };
}

async function fetchTribePages({ feed, fetchImpl, now, legacy = false }) {
  const requestOptions = { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs };
  const pages = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetchImpl(pageUrl(feed, now, page, { legacy }), requestOptions);
    if (!response.ok) throw new Error(`Events Calendar request failed (${response.status})`);
    pages.push(checkWindow(checkPage(await response.json()), now));
    if (page >= pages[0].total_pages) break;
  }
  return pages;
}

function createTribeAdapter(feed, venues) {
  const completeness = (snapshot) => feed.retireMissing === false ? { ...snapshot, retireMissing: false } : snapshot;
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `tribe-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const body = JSON.parse(content);
      if (!body || !Array.isArray(body.pages)) throw new Error('Invalid Events Calendar fixture');
      return completeness(parseTribePages(body.pages, { now, timezone: feed.timezone, requireTimedEvents: feed.requireTimedEvents, requireFreeAdmission: feed.requireFreeAdmission, leadingDescriptionTime: feed.leadingDescriptionTime, categoryMap: feed.categoryMap, publicCategorySlugs: feed.publicCategorySlugs }));
    },
    fetch: async ({ fetchImpl, now }) => {
      const parse = (pages) => completeness(parseTribePages(pages, { now, timezone: feed.timezone, requireTimedEvents: feed.requireTimedEvents, requireFreeAdmission: feed.requireFreeAdmission, leadingDescriptionTime: feed.leadingDescriptionTime, categoryMap: feed.categoryMap, publicCategorySlugs: feed.publicCategorySlugs }));
      try {
        return parse(await fetchTribePages({ feed, fetchImpl, now }));
      } catch (error) {
        if (error.message !== IGNORED_WINDOW) throw error;
        // The old query still bounds the listing, but drops runs under way;
        // a site that ignores it too fails the run.
        const snapshot = parse(await fetchTribePages({ feed, fetchImpl, now, legacy: true }));
        return { ...snapshot, diagnostics: { ...snapshot.diagnostics, 'legacy date window': 1 } };
      }
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createTribeAdapter, parseTribePages, fetchTribePages, pageUrl, MAX_PAGES, PER_PAGE };
