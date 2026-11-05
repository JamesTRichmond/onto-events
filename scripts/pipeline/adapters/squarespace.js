const path = require('node:path');
const { URL } = require('node:url');
const { parseXml, child, content } = require('../feed-xml');
const { safeHtmlText } = require('../feed-text');
const { HORIZON_DAYS } = require('./ics');
const { jsonLdEvents, jsonLdInstant, jsonLdEnd, jsonLdPlace, isCancelledStatus } = require('../jsonld-events');
const { calendarRecord } = require('../calendar-record');

const RSS = 'rss';
const MAX_EVENT_PAGES = 100;
const DAY = 86400000;

function text(node) {
  return content(node).trim();
}

function absoluteUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== new URL(base).origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

// Squarespace's robots.txt disallows every `?format=ical` and `?format=json`
// URL, so each event comes from its own page: the schema.org Event JSON-LD
// Squarespace embeds there (start, end, place, status).
function eventPageUrl(link) {
  const url = new URL(link);
  url.hash = '';
  // robots.txt disallows every format=ical and format=json URL, including a
  // same-origin RSS link that already carries that query.
  url.searchParams.delete('format');
  return url.href;
}

function mergeDescriptions(...parts) {
  return [...new Set(parts.map((part) => String(part ?? '').trim()).filter(Boolean))].join('\n');
}

// The RSS guid is "site:collection:item"; the item id is what Squarespace's
// own calendar export used as the UID, so record identity carries over.
function itemUid(guid, html, link) {
  const id = /^[0-9a-f]{24}:[0-9a-f]{24}:([0-9a-f]{24})$/i.exec(guid)?.[1]
    ?? /\bdata-item-id="([0-9a-f]{24})"/i.exec(html)?.[1];
  return id ? `${id}@squarespace.com` : link;
}

function eventFromPage(entry, html, feed, now) {
  const [event] = jsonLdEvents(html);
  if (!event) return { reason: 'missing event data' };
  const start = jsonLdInstant(event.startDate, feed.timezone);
  if (!start) return { reason: 'missing event date' };
  const ending = jsonLdInstant(event.endDate, feed.timezone);
  // An all-day listing runs through the last day it names, to the next local
  // midnight in the feed zone (a fixed 24h span is wrong across DST).
  const end = jsonLdEnd(start, ending, feed.timezone);
  if (start.instant >= now + HORIZON_DAYS * DAY || (end ?? start.instant + 3 * 3600000) <= now) return { reason: null };
  const place = jsonLdPlace(event.location);
  // RSS may abbreviate access or age terms. Keep the detail page's own Event
  // prose as eligibility evidence before any public-description wrapper.
  const rawDescription = mergeDescriptions(entry.rawDescription ?? entry.description, typeof event.description === 'string' ? event.description : '');
  return {
    item: {
      uid: itemUid(entry.guid, html, entry.url),
      title: entry.title,
      description: safeHtmlText(rawDescription),
      ...(rawDescription ? { rawDescription } : {}),
      location: place.online ? 'Virtual' : place.name || place.address,
      url: entry.url,
      timezone: feed.timezone,
      start: new Date(start.instant).toISOString(),
      ...(end ? { end: new Date(end).toISOString() } : {}),
      cancelled: isCancelledStatus(event.eventStatus),
    },
  };
}

function parseSquarespaceRss(xml, feed) {
  const root = parseXml(xml);
  if (root.local !== RSS || root.ns) throw new Error('Expected RSS feed');
  const channel = child(root, 'channel');
  if (!channel) throw new Error('Expected RSS channel');
  const entries = channel.children.filter((item) => item.local === 'item' && item.ns === '');
  const items = [];
  const seen = new Set();
  const diagnostics = {};
  const skip = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };

  for (const entry of entries) {
    const title = text(child(entry, 'title'));
    const guid = child(entry, 'guid');
    let link = absoluteUrl(text(child(entry, 'link')), feed.url);
    if (!link && guid && guid.attrs.isPermaLink?.toLowerCase() !== 'false' && /^https:\/\//i.test(text(guid))) {
      link = absoluteUrl(text(guid), feed.url);
    }
    if (!title || !link) {
      skip('missing event page');
      continue;
    }
    const pageUrl = eventPageUrl(link);
    if (seen.has(pageUrl)) {
      skip('duplicate event page');
      continue;
    }
    seen.add(pageUrl);
    if (items.length >= MAX_EVENT_PAGES) {
      skip('event page limit reached');
      continue;
    }
    const rawDescription = text(child(entry, 'description'));
    items.push({
      title,
      description: safeHtmlText(rawDescription),
      ...(rawDescription ? { rawDescription } : {}),
      url: link,
      pageUrl,
      guid: guid ? text(guid) : '',
    });
  }
  return { items, diagnostics };
}

function expandEntries(entries, diagnostics, feed, now, pages) {
  const out = [];
  const combinedDiagnostics = { ...diagnostics };
  const bump = (reason) => { combinedDiagnostics[reason] = (combinedDiagnostics[reason] ?? 0) + 1; };
  entries.forEach((entry, index) => {
    const html = pages[index];
    if (typeof html !== 'string') { bump('event page fetch failed'); return; }
    const { item, reason } = eventFromPage(entry, html, feed, now);
    if (item) out.push(item);
    else if (reason) bump(reason);
  });
  return { items: out, truncated: true, retireMissing: false, diagnostics: combinedDiagnostics };
}

function expandSquarespaceEventsSync({ feed, now, xml, getPage }) {
  const { items: entries, diagnostics } = parseSquarespaceRss(xml, feed);
  const pages = entries.map((entry) => { try { return getPage(entry.pageUrl); } catch { return null; } });
  return expandEntries(entries, diagnostics, feed, now, pages);
}

async function expandSquarespaceEvents({ feed, fetchPage, now, xml }) {
  const { items: entries, diagnostics } = parseSquarespaceRss(xml, feed);
  const pages = [];
  for (const entry of entries) {
    try { pages.push(await fetchPage(entry.pageUrl)); } catch { pages.push(null); }
  }
  return expandEntries(entries, diagnostics, feed, now, pages);
}

function createSquarespaceAdapter(feed, venues) {
  return {
    sourceName: feed.name,
    sourceKind: feed.sourceKind,
    requiredSecrets: [],
    maxCardsPerTitle: Infinity,
    weakDedupe: false,
    idPrefix: `squarespace-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const body = JSON.parse(content);
      if (!body || typeof body.rss !== 'string' || !body.pages || typeof body.pages !== 'object' || Array.isArray(body.pages)) {
        throw new Error('Invalid Squarespace fixture');
      }
      return expandSquarespaceEventsSync({
        feed,
        now,
        xml: body.rss,
        getPage: (url) => {
          const page = body.pages[url];
          if (typeof page !== 'string') throw new Error(`Missing fixture page: ${url}`);
          return page;
        },
      });
    },
    fetch: async ({ fetchImpl, now }) => {
      // Every request carries the feed's own pacing and timeout ceiling, the
      // per-event pages included, exactly as the ics and rss adapters do.
      const requestOptions = { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs };
      const response = await fetchImpl(feed.url, requestOptions);
      if (!response.ok) throw new Error(`Squarespace feed request failed (${response.status})`);
      return expandSquarespaceEvents({
        feed,
        now,
        xml: await response.text(),
        fetchPage: async (url) => {
          const eventResponse = await fetchImpl(url, requestOptions);
          if (!eventResponse.ok) throw new Error(`Squarespace event request failed (${eventResponse.status})`);
          return eventResponse.text();
        },
      });
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createSquarespaceAdapter, parseSquarespaceRss, expandSquarespaceEvents, eventPageUrl };
