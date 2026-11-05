const path = require('node:path');
const { URL } = require('node:url');
const { calendarRecord } = require('../calendar-record');
const { safeHtmlText } = require('../feed-text');
const { HORIZON_DAYS, localTime } = require('./ics');

// Rockhouse Partners (RHP) Events is the WordPress plugin behind many music
// venue sites (The Orange Peel, The Grey Eagle, Asheville Music Hall). It
// publishes no calendar export. The listing page links every upcoming show;
// each show page carries the date, show time, room, the venue's own age line
// and the description, and on most sites a schema.org Event with an exact
// start. Nothing is inferred beyond what those pages state.

const DAY = 86400000;
const MAX_EVENT_PAGES = 100;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const stripCode = (html) => html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

function listingLinks(html, base) {
  const origin = new URL(base).origin;
  const links = [];
  for (const [, href] of html.matchAll(/id\s*=\s*"eventTitle"\s+class\s*=\s*"url"\s+href\s*=\s*"([^"]+)"/g)) {
    let url;
    try { url = new URL(href.replace(/&amp;/g, '&'), base); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin || !url.pathname.startsWith('/event/')) continue;
    url.hash = '';
    url.search = '';
    if (!links.includes(url.href)) links.push(url.href);
  }
  return links;
}

/** Inner HTML of the first element whose class list has `name`, nesting-aware. */
function innerHtml(html, name) {
  const open = new RegExp(`<(div|span|h[1-6]|p|section)\\b[^>]*\\bclass\\s*=\\s*"[^"]*(?<![\\w-])${name}(?![\\w-])[^"]*"[^>]*>`, 'i').exec(html);
  if (!open) return '';
  const tag = open[1].toLowerCase();
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  pattern.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let match; (match = pattern.exec(html));) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, match.index);
  }
  return '';
}

const textOf = (html, name) => safeHtmlText(innerHtml(html, name));

function jsonLdEvent(html) {
  for (const [, body] of html.matchAll(/<script\b[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(body); } catch { continue; }
    const queue = [data];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) { queue.push(...node); continue; }
      if (!node || typeof node !== 'object') continue;
      const types = [].concat(node['@type'] ?? []);
      if (types.some((type) => /Event$/.test(String(type)))) return node;
      if (node['@graph']) queue.push(node['@graph']);
    }
  }
  return null;
}

/** An ISO start with an explicit offset; "-0400" is normalized to "-04:00". */
function explicitInstant(value) {
  const normalized = String(value ?? '').trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(normalized)) return NaN;
  return Date.parse(normalized);
}

function zonedDay(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).formatToParts(instant);
  const get = (type) => parts.find((part) => part.type === type).value;
  return { year: +get('year'), month: +get('month'), day: +get('day') };
}

/**
 * "Thursday, October 08" names no year. The weekday does: within the window
 * from yesterday to 400 days out, only one year puts that date on that
 * weekday. No match, or more than one, leaves the show undated.
 */
function datedDay(text, now, timezone) {
  const match = /^(\w+)[,\s]+(\w+)\s+(\d{1,2})$/i.exec(text.trim());
  if (!match) return null;
  const weekday = WEEKDAYS.indexOf(match[1].toLowerCase());
  const month = MONTHS.indexOf(match[2].toLowerCase());
  const day = +match[3];
  if (weekday < 0 || month < 0 || day < 1 || day > 31) return null;
  const { year } = zonedDay(now, timezone);
  const hits = [year - 1, year, year + 1, year + 2].filter((candidate) => {
    const date = new Date(Date.UTC(candidate, month, day));
    if (date.getUTCMonth() !== month || date.getUTCDay() !== weekday) return false;
    return +date >= now - 2 * DAY && +date <= now + 400 * DAY;
  });
  return hits.length === 1 ? `${hits[0]}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}` : null;
}

/** "Show: 7 pm | Doors: 6 pm" → 190000; the show time, else the doors time. */
function showTime(text) {
  for (const label of ['show', 'doors']) {
    const match = new RegExp(`\\b${label}\\s*:\\s*(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?\\s*m\\b`, 'i').exec(text);
    if (!match) continue;
    const hour = +match[1] % 12 + (match[3].toLowerCase() === 'p' ? 12 : 0);
    const minute = match[2] ? +match[2] : 0;
    if (+match[1] < 1 || +match[1] > 12 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00`;
  }
  return null;
}

function parseEventPage(page, url, { now, timezone }) {
  const ld = jsonLdEvent(page);
  const html = stripCode(page);
  const dayText = textOf(html, 'eventStDate');
  const timeText = textOf(html, 'eventDoorStartDate');
  const day = datedDay(dayText, now, timezone);
  const time = showTime(timeText);
  const textStart = day && time ? +localTime(day, time, timezone) : NaN;
  const ldStart = ld ? explicitInstant(ld.startDate) : NaN;
  if (Number.isFinite(ldStart) && Number.isFinite(textStart) && ldStart !== textStart) return { skip: 'conflicting start' };
  const start = Number.isFinite(ldStart) ? ldStart : textStart;
  if (!Number.isFinite(start)) return { skip: 'missing event date' };
  const ldEnd = ld ? explicitInstant(ld.endDate) : NaN;
  const venueLink = /<a\b[^>]*class\s*=\s*"venueLink"[^>]*\btitle\s*=\s*"([^"]*)"/i.exec(html)?.[1];
  const location = safeHtmlText(String(ld?.location?.name ?? venueLink ?? ''));
  const title = safeHtmlText(String(ld?.name ?? innerHtml(html, 'rhp-event-header')));
  const ageNote = [textOf(html, 'eventAgeRestriction'), textOf(html, 'rhp-event-notes-box')].filter(Boolean).join(' · ');
  const rawDescription = innerHtml(html, 'singleEventDescription');
  return {
    item: {
      uid: url, title, location, url, timezone,
      description: [ageNote, safeHtmlText(rawDescription)].filter(Boolean).join('\n'),
      ...(rawDescription ? { rawDescription } : {}),
      ...(ageNote ? { ageNote } : {}),
      start: new Date(start).toISOString(),
      ...(Number.isFinite(ldEnd) && ldEnd > start ? { end: new Date(ldEnd).toISOString() } : {}),
      cancelled: /cancel/i.test(String(ld?.eventStatus ?? '')),
    },
  };
}

/** pages: [{ url, html } | { url, error }] in listing order. */
function collectRhpEvents(links, pages, { now, timezone }) {
  const horizon = now + HORIZON_DAYS * DAY;
  const diagnostics = {};
  const bump = (reason, count = 1) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + count; };
  const items = [];
  let safeHorizon = horizon;
  let failed = false;
  if (links.length > MAX_EVENT_PAGES) bump('event page limit reached', links.length - MAX_EVENT_PAGES);
  let lastStart = NaN;
  for (const page of pages) {
    if (page.error) { failed = true; bump('event page failed'); continue; }
    const parsed = parseEventPage(page.html, page.url, { now, timezone });
    if (parsed.skip) { bump(parsed.skip); continue; }
    const start = Date.parse(parsed.item.start);
    lastStart = start;
    if (!parsed.item.title) { bump('missing identity or title'); continue; }
    if (start >= horizon || (parsed.item.end ? Date.parse(parsed.item.end) : start + 3 * 3600000) <= now) continue;
    items.push(parsed.item);
  }
  if (links.length > MAX_EVENT_PAGES && Number.isFinite(lastStart)) safeHorizon = Math.min(safeHorizon, lastStart);
  return {
    items, truncated: true, horizon: new Date(safeHorizon).toISOString(), diagnostics,
    // A show page that failed to load is not a show that ended: keep its row.
    ...(failed ? { retireMissing: false } : {}),
  };
}

function createRhpAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `rhp-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const body = JSON.parse(content);
      if (!body || typeof body.listing !== 'string' || !body.pages || typeof body.pages !== 'object') throw new Error('Invalid RHP fixture');
      const links = listingLinks(body.listing, feed.url);
      const pages = links.slice(0, MAX_EVENT_PAGES).map((url) => (typeof body.pages[url] === 'string'
        ? { url, html: body.pages[url] } : { url, error: true }));
      return collectRhpEvents(links, pages, { now, timezone: feed.timezone });
    },
    fetch: async ({ fetchImpl, now }) => {
      const requestOptions = { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs };
      const response = await fetchImpl(feed.url, requestOptions);
      if (!response.ok) throw new Error(`RHP listing request failed (${response.status})`);
      const links = listingLinks(await response.text(), feed.url);
      if (!links.length) throw new Error('RHP listing has no event links');
      const pages = [];
      for (const url of links.slice(0, MAX_EVENT_PAGES)) {
        try {
          const page = await fetchImpl(url, requestOptions);
          pages.push(page.ok ? { url, html: await page.text() } : { url, error: true });
        } catch {
          pages.push({ url, error: true });
        }
      }
      return collectRhpEvents(links, pages, { now, timezone: feed.timezone });
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createRhpAdapter, listingLinks, parseEventPage, collectRhpEvents, datedDay, showTime, innerHtml, MAX_EVENT_PAGES };
