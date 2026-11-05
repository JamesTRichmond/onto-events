const path = require('node:path');
const { calendarRecord } = require('../calendar-record');
const { safeHtmlText, safeDisplayHtmlText } = require('../feed-text');
const { jsonLdEvents, isCancelledStatus } = require('../jsonld-events');
const { localTime, HORIZON_DAYS } = require('./ics');
const { innerHtml } = require('./rhp');

const DAY = 86400000;
const MAX_EVENT_PAGES = 100;
const MAX_PAGE_CHARS = 2 * 1024 * 1024;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function checkedHtml(html) {
  if (typeof html !== 'string' || html.length > MAX_PAGE_CHARS) throw new Error('Invalid or oversized Higher Ground page');
  return html;
}

// The publisher uses unquoted event links. Scan each tag once and bound its
// attributes, including malformed HTML without a closing angle bracket.
function eventLinks(html, base) {
  checkedHtml(html);
  const origin = new URL(base).origin;
  const links = new Set();
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    const end = html.indexOf('>', start + 1);
    if (end < 0) break;
    cursor = end + 1;
    if (end - start > 4096) continue;
    const tag = html.slice(start, end + 1);
    if (!/^<a\s/i.test(tag)) continue;
    const href = /(?<![\w-])href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(tag);
    if (!href) continue;
    let url;
    try { url = new URL(safeHtmlText(href[1] ?? href[2] ?? href[3]), base); } catch { continue; }
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password
        || !/^\/events\/[a-z0-9-]+\/$/.test(url.pathname)) continue;
    url.search = '';
    url.hash = '';
    links.add(url.href);
  }
  return [...links];
}

function artistBio(html) {
  const open = /<div\b[^>]{0,4096}\bid\s*=\s*["']artistBio["'][^>]{0,4096}>/i.exec(html);
  if (!open) return '';
  const start = open.index + open[0].length;
  let depth = 1;
  const tags = /<(\/?)div\b[^<>]{0,4096}>/gi;
  tags.lastIndex = start;
  for (let tag; (tag = tags.exec(html));) {
    depth += tag[1] ? -1 : 1;
    if (!depth) return html.slice(start, tag.index);
  }
  return '';
}

function showClock(value) {
  const clock = /^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?$/i.exec(value);
  if (!clock || +clock[1] < 1 || +clock[1] > 12) return null;
  return `${String(+clock[1] % 12 + (clock[3].toLowerCase() === 'p' ? 12 : 0)).padStart(2, '0')}${clock[2] ?? '00'}00`;
}

function showInstant(day, clock, timezone) {
  let value;
  try { value = +localTime(day, clock, timezone); } catch { return null; }
  if (!Number.isFinite(value)) return null;
  const formatter = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = (instant) => {
    const fields = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    return `${fields.year}${fields.month}${fields.day}T${fields.hour}${fields.minute}${fields.second}`;
  };
  const expected = `${day}T${clock}`;
  if (wall(value) !== expected || wall(value - 3600000) === expected || wall(value + 3600000) === expected) return null;
  return value;
}

function parseEventPage(html, url, { now, timezone }) {
  checkedHtml(html);
  const events = jsonLdEvents(html).filter((event) => event.url === url);
  if (events.length !== 1) return { reason: 'missing or ambiguous event identity' };
  const event = events[0];
  // This interface writes the event DAY as UTC midnight. It is not a show
  // instant. Require the visible weekday/month/day to independently agree.
  const date = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\+00:00|Z)$/.exec(String(event.startDate ?? ''));
  if (!date) return { reason: 'invalid structured date' };
  const day = new Date(Date.UTC(+date[1], +date[2] - 1, +date[3]));
  if (+date[1] < 1900 || day.getUTCFullYear() !== +date[1] || day.getUTCMonth() !== +date[2] - 1 || day.getUTCDate() !== +date[3]) return { reason: 'invalid structured date' };
  const info = innerHtml(html, 'event-info-block');
  const visibleDate = safeHtmlText(innerHtml(info, 'event-date'));
  if (visibleDate !== `${WEEKDAYS[day.getUTCDay()]} ${MONTHS[day.getUTCMonth()]} ${String(day.getUTCDate()).padStart(2, '0')}`
      && visibleDate !== `${WEEKDAYS[day.getUTCDay()]} ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}`) return { reason: 'conflicting event date' };
  if (+day >= now + HORIZON_DAYS * DAY || +day + 2 * DAY <= now) return {};
  const showText = safeHtmlText(innerHtml(info, 'see-showtime'));
  const clock = showClock(showText);
  if (!clock) return { reason: 'missing show time' };
  const start = showInstant(`${date[1]}${date[2]}${date[3]}`, clock, timezone);
  if (start === null) return { reason: 'ambiguous or nonexistent show time' };
  if (start >= now + HORIZON_DAYS * DAY || start + 3 * 3600000 <= now) return {};
  const title = safeHtmlText(String(event.name ?? '')).trim();
  const venueText = safeHtmlText(innerHtml(info, 'venue')).replace(/^at\s+/i, '').trim();
  const structuredVenue = safeHtmlText(String(event.location?.name ?? '')).trim();
  if (!title) return { reason: 'missing title' };
  if (!venueText || venueText !== structuredVenue) return { reason: 'conflicting event venue' };
  const bio = artistBio(html);
  // This publisher places its admission statement in a dedicated first
  // biography paragraph. Only an exact age label can cross into ageNote;
  // generic artist prose about audiences of all ages is not admission.
  let bioStart = 0;
  while (bioStart < bio.length) {
    while (bioStart < bio.length && /\s/.test(bio[bioStart])) bioStart++;
    if (!bio.startsWith('<!--', bioStart)) break;
    const end = bio.indexOf('-->', bioStart + 4);
    if (end < 0) { bioStart = bio.length; break; }
    bioStart = end + 3;
  }
  const firstParagraph = /^<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(bio.slice(bioStart));
  const ageLabel = firstParagraph ? safeHtmlText(firstParagraph[1]).trim() : '';
  const explicitLabel = /^(?:All Ages|(?:Ages?\s+)?(?:18|21)(?:\+|\s+(?:and|&)\s+(?:over|up|older)))$/i.test(ageLabel);
  const ageNote = safeHtmlText(innerHtml(info, 'ages')) || (explicitLabel ? ageLabel : '');
  const description = [ageNote, safeDisplayHtmlText(bio)].filter(Boolean).join('\n');
  return { item: {
    uid: url, title, location: venueText, url, timezone, start: new Date(start).toISOString(),
    description, ...(ageNote ? { ageNote } : {}),
    displayDescription: `${title}. Show: ${showText}.${ageNote ? ` ${ageNote}.` : ''} See the publisher for tickets and current details. Map point is approximate.`,
    cancelled: isCancelledStatus(event.eventStatus),
  } };
}

function expandPages(links, pages, feed, now) {
  const items = [];
  const diagnostics = {};
  const bump = (reason, count = 1) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + count; };
  if (links.length > MAX_EVENT_PAGES) bump('event page limit reached', links.length - MAX_EVENT_PAGES);
  for (const url of links.slice(0, MAX_EVENT_PAGES)) {
    const page = pages[url];
    if (typeof page !== 'string') { bump('event page fetch failed'); continue; }
    if (page.length > MAX_PAGE_CHARS) { bump('event page exceeds size limit'); continue; }
    const result = parseEventPage(page, url, { now, timezone: feed.timezone });
    if (result.reason) bump(result.reason);
    if (result.item) items.push(result.item);
  }
  // The calendar is a rolling public listing. Even an omitted or failed page
  // does not prove that a stored event has been cancelled.
  return { items, truncated: true, retireMissing: false, diagnostics };
}

function createHigherGroundAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [],
    idPrefix: `higherground-${feed.id}-`, maxCardsPerTitle: Infinity, weakDedupe: false,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const body = JSON.parse(content);
      if (!body || typeof body.index !== 'string' || !body.pages || typeof body.pages !== 'object' || Array.isArray(body.pages)) throw new Error('Invalid Higher Ground fixture');
      const links = eventLinks(body.index, feed.url);
      if (!links.length) throw new Error('Higher Ground index has no event links');
      return expandPages(links, body.pages, feed, now);
    },
    fetch: async ({ fetchImpl, now }) => {
      const options = { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs };
      const response = await fetchImpl(feed.url, options);
      if (!response.ok) throw new Error(`Higher Ground index request failed (${response.status})`);
      const links = eventLinks(await response.text(), feed.url);
      if (!links.length) throw new Error('Higher Ground index has no event links');
      const pages = {};
      for (const url of links.slice(0, MAX_EVENT_PAGES)) {
        try {
          const page = await fetchImpl(url, options);
          pages[url] = page.ok ? await page.text() : null;
        } catch { pages[url] = null; }
      }
      return expandPages(links, pages, feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createHigherGroundAdapter, eventLinks, parseEventPage, expandPages, MAX_EVENT_PAGES };
