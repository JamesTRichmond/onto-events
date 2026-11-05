const path = require('node:path');
const { URL } = require('node:url');
const { safeHtmlText } = require('../feed-text');
const { calendarRecord } = require('../calendar-record');
const { HORIZON_DAYS } = require('./ics');
const { jsonLdEvents, jsonLdInstant, jsonLdEnd, jsonLdPlace, isCancelledStatus } = require('../jsonld-events');

const DAY = 86400000;
const MAX_EVENT_PAGES = 60;

// Publishers and ticketing platforms (DICE, SimpleTix, Ticket Tailor) put
// schema.org Event data on their pages for search engines. A `jsonld` feed
// reads it from an index page, and from the event pages that index links to
// on the hosts the feed names (`eventHosts`) whose paths match `eventPath`.
function eventLinks(html, feed) {
  if (!feed.eventPath) return [];
  const pattern = new RegExp(feed.eventPath);
  const links = new Set();
  for (const match of html.matchAll(/href\s*=\s*["']([^"'\s]+)["']/gi)) {
    let url;
    // Ticket Tailor writes its links entity-encoded ("&#x2F;events&#x2F;…").
    try { url = new URL(safeHtmlText(match[1]), feed.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || !feed.eventHosts.includes(url.hostname) || !pattern.test(url.pathname)) continue;
    url.search = '';
    url.hash = '';
    links.add(url.href);
  }
  return [...links];
}

const text = (value) => typeof value === 'string' ? value : '';

function itemFromEvent(event, feed, now, pageUrl) {
  const start = jsonLdInstant(event.startDate, feed.timezone);
  if (!start) return { reason: 'missing event date' };
  const ending = jsonLdInstant(event.endDate, feed.timezone);
  // Some public calendars repeat the concert's date as an unclocked end.
  // Their opt-in contract preserves timed ends and actual all-day programs.
  const end = feed.ignoreDateOnlyEnd && !start.allDay && ending?.allDay
    ? undefined : jsonLdEnd(start, ending, feed.timezone);
  if (start.instant >= now + HORIZON_DAYS * DAY || (end ?? start.instant + 3 * 3600000) <= now) return { reason: null };
  const url = text(event.url) || text(event['@id']) || pageUrl;
  const title = safeHtmlText(text(event.name)).trim();
  if (!title || !url) return { reason: 'missing identity or title' };
  const place = jsonLdPlace(event.location);
  const rawDescription = text(event.description);
  return {
    item: {
      // A page's URL is its event's identity; several dates on one page are
      // occurrences of it.
      uid: url, occurrence: new Date(start.instant).toISOString(), title,
      description: safeHtmlText(rawDescription), ...(rawDescription ? { rawDescription } : {}),
      location: place.online ? 'Virtual' : place.name || place.address,
      url, timezone: feed.timezone,
      start: new Date(start.instant).toISOString(), ...(end ? { end: new Date(end).toISOString() } : {}),
      cancelled: isCancelledStatus(event.eventStatus),
    },
  };
}

function expandPages(indexHtml, pages, feed, now) {
  const diagnostics = {};
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  const items = [];
  const seen = new Set();
  const indexEvents = jsonLdEvents(indexHtml);
  // An index that lists a fixed number of events (DICE stops at 30) says
  // nothing past its last start, so rows beyond it must not be retired.
  let horizon = now + HORIZON_DAYS * DAY;
  if (feed.exportLimit && indexEvents.length >= feed.exportLimit) {
    bump('export limit reached');
    const starts = indexEvents.map((event) => jsonLdInstant(event.startDate, feed.timezone)?.instant).filter(Number.isFinite);
    if (starts.length) horizon = Math.min(horizon, Math.max(...starts));
  }
  const add = (event, pageUrl) => {
    const { item, reason } = itemFromEvent(event, feed, now, pageUrl);
    if (!item) { if (reason) bump(reason); return; }
    const key = `${item.uid}\n${item.occurrence}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };
  for (const event of indexEvents) add(event, feed.url);
  for (const [url, html] of pages) {
    if (typeof html !== 'string') { bump('event page fetch failed'); continue; }
    const events = jsonLdEvents(html);
    if (!events.length) bump('missing event data');
    for (const event of events) add(event, url);
  }
  const partial = pages.some(([, html]) => typeof html !== 'string');
  return { items, truncated: true, horizon: new Date(horizon).toISOString(), diagnostics,
    ...(partial || feed.retireMissing === false ? { retireMissing: false } : {}) };
}

function createJsonLdAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `jsonld-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const body = JSON.parse(content);
      if (!body || typeof body.index !== 'string' || (body.pages && (typeof body.pages !== 'object' || Array.isArray(body.pages)))) {
        throw new Error('Invalid JSON-LD fixture');
      }
      const links = eventLinks(body.index, feed).slice(0, MAX_EVENT_PAGES);
      return expandPages(body.index, links.map((url) => [url, body.pages?.[url] ?? null]), feed, now);
    },
    fetch: async ({ fetchImpl, now }) => {
      const requestOptions = { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs };
      const response = await fetchImpl(feed.url, requestOptions);
      if (!response.ok) throw new Error(`Event index request failed (${response.status})`);
      const index = await response.text();
      const pages = [];
      for (const url of eventLinks(index, feed).slice(0, MAX_EVENT_PAGES)) {
        try {
          const page = await fetchImpl(url, requestOptions);
          pages.push([url, page.ok ? await page.text() : null]);
        } catch { pages.push([url, null]); }
      }
      return expandPages(index, pages, feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createJsonLdAdapter, eventLinks, expandPages };
