const path = require('node:path');
const { URL } = require('node:url');
const { safeHtmlText } = require('../feed-text');
const { calendarRecord } = require('../calendar-record');
const { HORIZON_DAYS, addDays, localMidnight, localTime } = require('./ics');

const DAY = 86400000;
const MAX_ENTRIES = 1000;
const MAX_PRODUCT_PAGES = 5;
const PRODUCTS_PER_PAGE = 100;

// FullCalendar widgets (Tickera's event calendar among them) write their
// events into the page as a script literal: `events: [{ title: '…',
// start: '2026-11-06 19:00', end: '…', url: '…' }, …]`. A `fullcalendar`
// feed reads those literals as data, never as code. Times are the venue's
// wall clock. When the venue sells tickets through WooCommerce, its public
// Store API (`productsUrl`) supplies each event page's description, so the
// listing's own words (a members-only show, an age line) still decide access
// and rating.

function readString(source, start) {
  const quote = source[start];
  let value = '';
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (char === quote) return { value, end: i + 1 };
    if (char !== '\\') { value += char; continue; }
    const next = source[++i];
    if (next === 'u' && /^[\da-f]{4}$/i.test(source.slice(i + 1, i + 5))) { value += String.fromCharCode(parseInt(source.slice(i + 1, i + 5), 16)); i += 4; } else value += { n: '\n', r: '', t: '\t' }[next] ?? next;
  }
  return null;
}

// The end of a nested `[…]` or `{…}` value, skipping over its strings.
function skipNested(source, start) {
  let depth = 0;
  for (let i = start; i < source.length && i < start + 20000; i++) {
    const char = source[i];
    if (char === "'" || char === '"') {
      const quoted = readString(source, i);
      if (!quoted) return null;
      i = quoted.end - 1;
    } else if (char === '[' || char === '{') depth++;
    else if (char === ']' || char === '}') { if (--depth === 0) return i + 1; }
  }
  return null;
}

// One `{ key: 'value', … }` literal. String values are read; numbers,
// booleans, null and nested arrays or objects are skipped. Anything else
// (a function, a variable) ends the object and it is ignored.
function readObject(source, start) {
  const entry = {};
  let i = start + 1;
  for (;;) {
    const key = /^\s*(?:([A-Za-z_$][\w$]*)|(['"]))/.exec(source.slice(i, i + 200));
    if (!key) break;
    let name;
    if (key[1]) { name = key[1]; i += key[0].length; } else {
      const quoted = readString(source, i + key[0].length - 1);
      if (!quoted) return null;
      name = quoted.value;
      i = quoted.end;
    }
    const colon = /^\s*:\s*/.exec(source.slice(i, i + 50));
    if (!colon) return null;
    i += colon[0].length;
    if (source[i] === "'" || source[i] === '"') {
      const value = readString(source, i);
      if (!value) return null;
      entry[name] = value.value;
      i = value.end;
    } else if (source[i] === '[' || source[i] === '{') {
      const end = skipNested(source, i);
      if (!end) return null;
      i = end;
    } else {
      const literal = /^(?:-?\d+(?:\.\d+)?|true|false|null)/.exec(source.slice(i, i + 30));
      if (!literal) return null;
      i += literal[0].length;
    }
    const separator = /^\s*([,}])/.exec(source.slice(i, i + 50));
    if (!separator) return null;
    i += separator[0].length;
    if (separator[1] === '}') return { entry, end: i };
    if (/^\s*}/.test(source.slice(i, i + 50))) return { entry, end: i + /^\s*}/.exec(source.slice(i))[0].length };
  }
  const close = /^\s*}/.exec(source.slice(i, i + 50));
  return close ? { entry, end: i + close[0].length } : null;
}

function calendarEntries(html) {
  const entries = [];
  const seen = new Set();
  for (const match of html.matchAll(/\bevents\s*:\s*\[/g)) {
    let i = match.index + match[0].length;
    for (;;) {
      const next = /^\s*(,\s*)?([{\]])/.exec(html.slice(i, i + 200));
      if (!next || next[2] === ']') break;
      const objectStart = i + next[0].length - 1;
      const object = readObject(html, objectStart);
      // An entry with code in it is passed over whole; the rest still count.
      if (!object) {
        const end = skipNested(html, objectStart);
        if (!end) break;
        i = end;
        continue;
      }
      i = object.end;
      const { title, start, end, url } = object.entry;
      const key = JSON.stringify([title, start, end, url]);
      if (typeof title !== 'string' || typeof start !== 'string' || seen.has(key)) continue;
      seen.add(key);
      entries.push({ title, start, ...(typeof end === 'string' ? { end } : {}), ...(typeof url === 'string' ? { url } : {}) });
      if (entries.length >= MAX_ENTRIES) return entries;
    }
  }
  return entries;
}

// "2026-11-06 19:00", "2026-11-06T19:00:00" or an all-day "2026-11-06".
function wallTime(value, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  // An out-of-range field ("2026-00-10", "25:00") is no date, never a crash.
  const days = new Date(Date.UTC(+year, +month, 0)).getUTCDate();
  if (+month < 1 || +month > 12 || +day < 1 || +day > days || (hour && (+hour > 23 || +minute > 59 || +(second ?? 0) > 59))) return null;
  const date = `${year}${month}${day}`;
  let instant;
  try { instant = +localTime(date, hour ? `${hour}${minute}${second ?? '00'}` : '000000', timezone); } catch { return null; }
  return Number.isFinite(instant) ? { instant, date, allDay: !hour } : null;
}

function pageUrl(value, feed) {
  try {
    const url = new URL(value, feed.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== new URL(feed.url).hostname) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

const slugOf = (url) => url.replace(/\/+$/, '').split('/').pop();

// An event page's product, or the one-word-prefixed product the venue sells
// for the same page ("members-only-x" is sold as "rsvp-members-only-x").
function productIndex(products) {
  const byUrl = new Map();
  const bySlug = [];
  for (const product of Array.isArray(products) ? products : []) {
    if (!product || typeof product.permalink !== 'string') continue;
    byUrl.set(product.permalink, product);
    if (typeof product.slug === 'string') bySlug.push(product);
  }
  return (url) => {
    if (!url) return null;
    if (byUrl.has(url)) return byUrl.get(url);
    const slug = slugOf(new URL(url).pathname);
    return slug ? bySlug.find((product) => /^[a-z0-9]+-$/.test(product.slug.slice(0, -slug.length)) && product.slug.endsWith(`-${slug}`)) ?? null : null;
  };
}

const text = (value) => typeof value === 'string' ? value : '';
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function calendarItems(html, products, feed, now) {
  const diagnostics = {};
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  const productFor = productIndex(products);
  const horizon = now + HORIZON_DAYS * DAY;
  const items = [];
  const seen = new Set();
  for (const entry of calendarEntries(html)) {
    const start = wallTime(entry.start, feed.timezone);
    if (!start) { bump('missing event date'); continue; }
    const ending = entry.end ? wallTime(entry.end, feed.timezone) : null;
    let end = ending && ending.instant > start.instant ? ending.instant : undefined;
    // An all-day entry runs to the next local midnight, whatever the DST change.
    if (start.allDay && !end) end = +localMidnight(addDays(start.date, 1), feed.timezone);
    if (start.instant >= horizon || (end ?? start.instant + 3 * 3600000) <= now) continue;
    const title = safeHtmlText(entry.title).trim();
    if (!title) { bump('missing title'); continue; }
    const url = entry.url ? pageUrl(entry.url, feed) : '';
    const product = productFor(url);
    const rawDescription = [text(product?.short_description), text(product?.description)].filter(Boolean).join('\n');
    const uid = url || `${feed.id}-${slug(title)}`;
    const occurrence = new Date(start.instant).toISOString();
    if (seen.has(`${uid}\n${occurrence}`)) continue;
    seen.add(`${uid}\n${occurrence}`);
    items.push({
      uid, occurrence, title,
      description: safeHtmlText(rawDescription), ...(rawDescription ? { rawDescription } : {}),
      location: '', url: url || feed.url, timezone: feed.timezone,
      start: occurrence, ...(end ? { end: new Date(end).toISOString() } : {}),
    });
  }
  items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { items, truncated: true, horizon: new Date(horizon).toISOString(), diagnostics };
}

function productsPage(feed, page) {
  const url = new URL(feed.productsUrl);
  url.searchParams.set('per_page', String(PRODUCTS_PER_PAGE));
  url.searchParams.set('page', String(page));
  return url.href;
}

function createFullCalendarAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `fullcalendar-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const body = JSON.parse(content);
      if (!body || typeof body.page !== 'string' || (body.products !== undefined && !Array.isArray(body.products))) throw new Error('Invalid FullCalendar fixture');
      return calendarItems(body.page, body.products ?? [], feed, now);
    },
    fetch: async ({ fetchImpl, now }) => {
      const requestOptions = { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs };
      const response = await fetchImpl(feed.url, requestOptions);
      if (!response.ok) throw new Error(`Calendar page request failed (${response.status})`);
      const html = await response.text();
      // Without the listings' own words a members-only show could look public,
      // so a configured product source that fails fails the run.
      const products = [];
      for (let page = 1; feed.productsUrl && page <= MAX_PRODUCT_PAGES; page++) {
        const result = await fetchImpl(productsPage(feed, page), requestOptions);
        if (!result.ok) throw new Error(`Product request failed (${result.status})`);
        const batch = JSON.parse(await result.text());
        if (!Array.isArray(batch)) throw new Error('Product response is not a list');
        products.push(...batch);
        if (batch.length < PRODUCTS_PER_PAGE) break;
      }
      return calendarItems(html, products, feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createFullCalendarAdapter, calendarEntries, calendarItems, wallTime };
