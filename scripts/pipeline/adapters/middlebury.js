const path = require('node:path');
const { URL } = require('node:url');
const { htmlText } = require('../feed-text');
const { calendarRecord, venueKey, resolveVenue } = require('../calendar-record');
const { parseCalendar, HORIZON_DAYS } = require('./ics');

const DAY = 86400000;
const MAX_PAGES = 10;
const MAX_DETAILS = 120;
const ORIGIN = 'https://www.middlebury.edu';

function listingUrl(value, base) {
  const url = new URL(value.replaceAll('&amp;', '&'), base);
  const allowed = new Set(['access[28]', 'categories[52]', 'page']);
  if (url.origin !== ORIGIN || url.pathname !== '/events/' || url.username || url.password || url.hash
      || url.searchParams.getAll('access[28]').join() !== '28'
      || url.searchParams.getAll('categories[52]').join() !== '52'
      || [...url.searchParams.keys()].some((key) => !allowed.has(key))
      || url.searchParams.getAll('page').length > 1
      || !/^\d{1,3}$/.test(url.searchParams.get('page') ?? '0')) {
    throw new Error('Middlebury listing lost its public arts filter');
  }
  return url.href;
}

function detailUrl(value, base) {
  const url = new URL(value, base);
  // Drupal publishes both the clean route and this front-controller route.
  // Keep the actual public URL and the same-origin, single-slug restriction.
  if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash
      || !/^\/events\/(?:index\.php\/)?event\/[a-z0-9-]+$/.test(url.pathname)) {
    throw new Error('Unsafe Middlebury event link');
  }
  return url.href;
}

function parseListing(html, url) {
  const entries = [];
  const ids = new Set();
  for (const match of html.matchAll(/<article\b[^>]*aria-labelledby="midd-event-(\d+)-header"[^>]*>([\s\S]*?)<\/article>/g)) {
    const body = match[2];
    const title = body.match(/<h3\b[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const time = body.match(/<time[^>]*datetime="([^"]+)"/);
    const location = body.match(/<p class="f3 font-medium">([\s\S]*?)<\/p>/);
    const access = [...body.matchAll(/<small class="f2 text-gray">([\s\S]*?)<\/small>/g)];
    const description = body.match(/<div class="f3 my-3 typography">([\s\S]*?)<\/div>/)?.[1] ?? '';
    if (!title || !time || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(time[1])
        || !Number.isFinite(Date.parse(time[1])) || ids.has(match[1])) throw new Error('Invalid Middlebury listing identity or time');
    ids.add(match[1]);
    const accessText = access.length === 1 ? htmlText(access[0][1]) : '';
    // Price precedes this label on ticketed programs. The label must belong
    // to this article's access field, never to the page filter or its prose.
    const accessLabel = access.length === 1 ? htmlText(access[0][1].split(/<br\s*\/?>/i).at(-1)) : '';
    const isPublic = accessLabel === 'Open to the Public';
    const price = access.length === 1 ? htmlText(access[0][1].split(/<br\s*\/?>/i).slice(0, -1).join(' ')) : '';
    entries.push({ uid: `node-${match[1]}`, title: htmlText(title[2]),
      url: detailUrl(title[1], url), start: new Date(time[1]).toISOString(),
      location: htmlText(location?.[1] ?? ''), description: `${htmlText(description)}\n${accessText}`.trim(),
      accessText, isPublic, price, priceSourceUrl: url,
      category: /href="\/events\/organizations\/music"/.test(body) ? 'music' : 'arts',
    });
  }
  // A changed template or an unverified empty-state must not retire inventory.
  if (!entries.length || entries.length !== (html.match(/aria-labelledby="midd-event-/g) ?? []).length) {
    throw new Error('Middlebury listing has missing or unrecognized event articles');
  }
  const next = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*rel="next"[^>]*>/g)];
  if (next.length > 1 || next.length !== (html.match(/rel=["']next["']/g) ?? []).length) {
    throw new Error('Ambiguous Middlebury pagination');
  }
  return { entries, next: next.length ? listingUrl(next[0][1], url) : null };
}

function parseDetail(html, entry, feed, now) {
  const calendars = [...html.matchAll(/href="data:text\/calendar;charset=utf8;base64,([A-Za-z0-9+/=]+)"/g)];
  if (calendars.length !== 1 || calendars[0][1].length > 256 * 1024) throw new Error('Middlebury event needs one bounded public calendar');
  const encoded = calendars[0][1];
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.toString('base64') !== encoded) throw new Error('Invalid Middlebury calendar encoding');
  const calendar = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if ((calendar.match(/^BEGIN:VEVENT\r?$/gm) ?? []).length !== 1 || /^RRULE[:;]/m.test(calendar)
      || !/^DTSTART;TZID=America\/New_York:\d{8}T\d{6}\r?$/m.test(calendar)
      || !/^DTEND;TZID=America\/New_York:\d{8}T\d{6}\r?$/m.test(calendar)) throw new Error('Unsupported Middlebury occurrence calendar');
  const snapshot = parseCalendar(calendar, { now, timezone: feed.timezone });
  if (snapshot.diagnostics?.['private event']) return { private: true };
  if (snapshot.items.length !== 1) throw new Error('Middlebury occurrence is missing or ambiguous');
  const item = snapshot.items[0];
  if (item.start !== entry.start || !item.end || Date.parse(item.end) <= Date.parse(item.start)
      || venueKey(item.location) !== venueKey(entry.location) || item.timezone !== feed.timezone) {
    throw new Error('Middlebury listing and calendar disagree');
  }
  // Drupal's node is the stable listing identity. Calendar summaries can
  // over-escape commas; the listing title supplies the publisher's display.
  // Venue coordinates always come from the reviewed registry.
  const { geo: _geo, occurrence: _occurrence, ...event } = item;
  const admission = entry.price === 'Free' ? 'free' : /^\$[\d.$/]+$/.test(entry.price) ? 'paid' : null;
  return { ...event, uid: entry.uid, title: entry.title, url: entry.url,
    description: `${htmlText(item.description).replace(/^\(Event Details\)\s*/, '')}\n${entry.accessText}`.trim(),
    rawDescription: item.description, category: entry.category,
    ...(admission ? { eventFacts: { admission: { value: admission, sourceUrl: entry.priceSourceUrl,
      excerpt: entry.price, checkedOn: new Date(now).toISOString().slice(0, 10) } } } : {}) };
}

function* collectPages({ feed, venues, now }) {
  const items = [];
  const diagnostics = {};
  const seenPages = new Set();
  const seenIds = new Set();
  const horizon = now + HORIZON_DAYS * DAY;
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  let url = listingUrl(feed.url, feed.url);
  if (Number(new URL(url).searchParams.get('page') ?? 0) !== 0) throw new Error('Middlebury calendar must start on its first page');
  let previousTime = -Infinity;
  let detailCount = 0;
  while (url) {
    if (seenPages.has(url) || seenPages.size >= MAX_PAGES) throw new Error('Middlebury pagination did not complete');
    seenPages.add(url);
    const page = parseListing((yield { kind: 'pages', url }), url);
    let reachedHorizon = false;
    for (const entry of page.entries) {
      const start = Date.parse(entry.start);
      if (start < previousTime || seenIds.has(entry.uid)) throw new Error('Middlebury calendar ordering or identity changed');
      previousTime = start;
      seenIds.add(entry.uid);
      if (start >= horizon) { reachedHorizon = true; continue; }
      if (!entry.isPublic) { bump('not explicitly open to the public'); continue; }
      if (start < now) { bump('already started listing'); continue; }
      if (!resolveVenue(entry, feed, venues).venue) {
        // Preserve the exact alias worklist without fetching unknown venues
        // or inventing a campus-wide map point or occurrence end.
        items.push(entry);
        continue;
      }
      if (++detailCount > MAX_DETAILS) throw new Error('Middlebury detail limit reached');
      const event = parseDetail((yield { kind: 'details', url: entry.url }), entry, feed, now);
      if (event.private) bump('private event calendar');
      else items.push(event);
    }
    if (reachedHorizon) break;
    if (page.next && Number(new URL(page.next).searchParams.get('page')) !== Number(new URL(url).searchParams.get('page') ?? 0) + 1) {
      throw new Error('Middlebury pagination skipped or repeated a page');
    }
    url = page.next;
  }
  // Complete within this start-time window only. Any list/detail failure
  // throws before writes; future rows beyond the window remain protected.
  return { items, truncated: true, horizon: new Date(horizon).toISOString(), diagnostics };
}

async function collect({ getPage, getDetail, ...context }) {
  const requests = collectPages(context);
  let step = requests.next();
  while (!step.done) {
    step = requests.next(await (step.value.kind === 'pages' ? getPage : getDetail)(step.value.url));
  }
  return step.value;
}

function collectFixture(content, feed, venues, { now }) {
  const fixture = JSON.parse(content);
  if (!fixture?.pages || !fixture.details) throw new Error('Invalid Middlebury fixture');
  const requests = collectPages({ feed, venues, now });
  let step = requests.next();
  while (!step.done) {
    const html = fixture[step.value.kind]?.[step.value.url];
    if (typeof html !== 'string') throw new Error('Missing Middlebury fixture page');
    step = requests.next(html);
  }
  return step.value;
}

function createMiddleburyAdapter(feed, venues) {
  return { sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [],
    maxCardsPerTitle: Infinity, weakDedupe: false, idPrefix: `middlebury-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    // The fixture runner uses the same parser and pagination state machine.
    parseFixture: (content, context) => collectFixture(content, feed, venues, context),
    fetch: async ({ fetchImpl, now }) => {
      const get = async (url) => {
        const response = await fetchImpl(url, { minIntervalMs: Math.max(1000, feed.minIntervalMs ?? 1000), timeoutMs: feed.timeoutMs });
        if (!response.ok) throw new Error(`Middlebury public calendar request failed (${response.status})`);
        return response.text();
      };
      return collect({ feed, venues, now, getPage: get, getDetail: get });
    },
    normalize: (event, context) => {
      const record = calendarRecord(event, { ...context, feed, venues });
      return record ? { ...record, category: event.category === 'music' ? 'music' : feed.defaultCategory,
        ...(event.eventFacts ? { eventFacts: event.eventFacts } : {}) } : null;
    },
  };
}

module.exports = { createMiddleburyAdapter, parseListing, parseDetail, listingUrl, collect };
