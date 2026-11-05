/* global __dirname */
const path = require('node:path');
const { Buffer } = require('node:buffer');
const { createHash } = require('node:crypto');
const { calendarRecord } = require('../calendar-record');
const { safeHtmlText, htmlText } = require('../feed-text');
const { HORIZON_DAYS } = require('./ics');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TAG = 4096;
const MAX_TAGS = 20000;
const MAX_EVENTS = 1000;
const MAX_EVENT_BYTES = 32768;
const hasClass = (tag, name) => String(tag.attrs.class ?? '').split(/\s+/).includes(name);
const invalid = (detail) => new Error(`Invalid Simple Calendar ${detail}`);

// A bounded tokenizer, not a browser: scripts/styles/comments cannot add
// fake calendar rows, quoted '>' characters cannot cut a tag short, and no
// scripts, AJAX navigation or Google links are ever executed or fetched.
function tagsOf(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_BYTES) throw invalid('page size');
  const lower = html.toLowerCase();
  const tags = [];
  for (let cursor = 0; cursor < html.length;) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) throw invalid('unterminated comment');
      cursor = end + 3;
      continue;
    }
    let quote = null;
    let end = start + 1;
    for (; end < html.length && end - start <= MAX_TAG; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= html.length || end - start > MAX_TAG) throw invalid('oversized or unterminated tag');
    cursor = end + 1;
    const raw = html.slice(start, cursor);
    const name = /^<(\/?)([a-z][a-z0-9:-]*)(?=[\s/>])/i.exec(raw);
    if (!name) continue;
    const attrs = {};
    for (const attr of raw.slice(name[0].length, -1).matchAll(/(?:^|\s)([a-z][a-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi)) {
      const key = attr[1].toLowerCase();
      if (Object.hasOwn(attrs, key)) throw invalid('duplicate tag attribute');
      attrs[key] = safeHtmlText(attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    const tag = { start, end: cursor, name: name[2].toLowerCase(), closing: name[1] === '/', attrs };
    tags.push(tag);
    if (tags.length > MAX_TAGS) throw invalid('tag count');
    if (!tag.closing && ['script', 'style'].includes(tag.name)) {
      const prefix = `</${tag.name}`;
      let close = lower.indexOf(prefix, cursor);
      // Search only forward. A </scripture> string is still raw script
      // content; it cannot expose fake calendar elements to this tokenizer.
      while (close >= 0 && !/[\s>]/.test(lower[close + prefix.length] ?? '')) {
        close = lower.indexOf(prefix, close + prefix.length);
      }
      if (close < 0) throw invalid('unterminated code block');
      const end = lower.indexOf('>', close + prefix.length);
      if (end < 0 || end - close > MAX_TAG || !new RegExp(`^</${tag.name}\\s*>$`).test(lower.slice(close, end + 1))) {
        throw invalid('raw-code closing tag');
      }
      cursor = close;
    }
  }
  return tags;
}

function closingIndex(tags, index, name = tags[index].name) {
  let depth = 0;
  for (let cursor = index; cursor < tags.length; cursor++) {
    if (tags[cursor].name !== name) continue;
    depth += tags[cursor].closing ? -1 : 1;
    if (depth === 0) return cursor;
  }
  throw invalid(`unclosed ${name} block`);
}

function eventBlocks(tags, rootStart, rootEnd) {
  const stack = [];
  const blocks = [];
  for (let index = rootStart + 1; index < rootEnd; index++) {
    const tag = tags[index];
    if (tag.name !== 'li') continue;
    if (!tag.closing) {
      const event = hasClass(tag, 'simcal-event');
      if (event && stack.some((open) => open.event)) throw invalid('nested event row');
      stack.push({ index, event });
    } else {
      const open = stack.pop();
      if (!open) throw invalid('unmatched event boundary');
      if (open.event) blocks.push([open.index, index]);
    }
  }
  if (stack.length || blocks.length > MAX_EVENTS) throw invalid('event boundaries or count');
  return blocks;
}

function titleOf(html, tags, index) {
  const end = closingIndex(tags, index, 'span');
  return safeHtmlText(html.slice(tags[index].end, tags[end].start));
}

function publisherInstant(tag, field, timezone) {
  const iso = tag.attrs.content;
  const seconds = tag.attrs[`data-event-${field}`];
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(iso ?? '')
    || !/^\d{1,11}$/.test(seconds ?? '')) throw invalid(`${field} date fields`);
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant) || instant !== Number(seconds) * 1000) throw invalid(`${field} ISO/Unix mismatch`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).map(({ type, value }) => [type, value]));
  const wall = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  // Matching the publisher's complete wall clock validates the date and the
  // explicit offset. Both correct offsets in a DST fold remain legitimate.
  if (wall !== iso.slice(0, 19)) throw invalid(`${field} date/timezone offset`);
  return instant;
}

function parseSimpleCalendar(html, feed, now) {
  const tags = tagsOf(html);
  const roots = tags.map((tag, index) => ({ tag, index })).filter(({ tag }) => !tag.closing
    && tag.name === 'div' && hasClass(tag, 'simcal-calendar') && tag.attrs['data-calendar-id'] === feed.calendarId);
  if (roots.length !== 1 || roots[0].tag.attrs['data-timezone'] !== feed.timezone) throw invalid('calendar identity or timezone');
  const rootStart = roots[0].index;
  const rootEnd = closingIndex(tags, rootStart, 'div');
  if (tags.slice(rootStart + 1, rootEnd).some((tag) => !tag.closing && hasClass(tag, 'simcal-calendar'))) {
    throw invalid('nested calendar ownership');
  }
  const blocks = eventBlocks(tags, rootStart, rootEnd);
  const items = [];
  const seen = new Map();
  const diagnostics = {};
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  for (const [begin, finish] of blocks) {
    const rowTags = tags.slice(begin, finish + 1);
    const titles = rowTags.map((tag, index) => ({ tag, index })).filter(({ tag }) => !tag.closing
      && tag.name === 'span' && hasClass(tag, 'simcal-event-title'));
    if (!titles.length) throw invalid('missing event title');
    const title = titleOf(html, rowTags, titles[0].index);
    const publicTitle = title.replace(/^(?:cancelled|canceled)\b[\s:–—-]*/i, '');
    // Read no group descriptions, dates or identities for an unknown title.
    if (!feed.publicTitles.includes(publicTitle)) { bump('not publicly invited'); continue; }
    if (!hasClass(tags[begin], `simcal-events-calendar-${feed.calendarId}`)) throw invalid('eligible row ownership');
    if (tags[finish].end - tags[begin].start > MAX_EVENT_BYTES || titles.length !== 2
      || titles.some(({ index }) => titleOf(html, rowTags, index) !== title)) throw invalid('eligible title or row size');
    const dates = (field) => rowTags.filter((tag) => !tag.closing && tag.attrs.itemprop === `${field}Date`);
    const starts = dates('start');
    const ends = dates('end');
    if (starts.length !== 2 || ends.length < 1 || ends.length > 2) throw invalid('eligible occurrence fields');
    const start = publisherInstant(starts[0], 'start', feed.timezone);
    const end = publisherInstant(ends[0], 'end', feed.timezone);
    if (starts.some((tag) => publisherInstant(tag, 'start', feed.timezone) !== start)
      || ends.some((tag) => publisherInstant(tag, 'end', feed.timezone) !== end) || end <= start) throw invalid('conflicting occurrence times');
    const links = rowTags.filter((tag) => !tag.closing && tag.name === 'a' && tag.attrs.href).map((tag) => {
      try { return new URL(tag.attrs.href); } catch { return null; }
    }).filter((url) => url?.protocol === 'https:' && !url.username && !url.password
      && ['www.google.com', 'google.com'].includes(url.hostname) && url.pathname === '/calendar/event');
    if (links.length !== 1 || links[0].searchParams.getAll('eid').length !== 1) throw invalid('public occurrence identity');
    const eid = links[0].searchParams.get('eid');
    if (!/^[A-Za-z0-9+/_=-]{1,512}$/.test(eid ?? '')) throw invalid('public occurrence identity');
    const uid = `google-event:${createHash('sha256').update(eid).digest('hex')}`;
    const identity = JSON.stringify([title, start, end]);
    if (seen.has(uid)) {
      if (seen.get(uid) !== identity) throw invalid('conflicting duplicate occurrence');
      bump('duplicate event');
      continue;
    }
    seen.set(uid, identity);
    if (start >= now + HORIZON_DAYS * 86400000 || end <= now) { bump('outside horizon'); continue; }
    const addresses = rowTags.filter((tag) => !tag.closing && tag.name === 'meta' && tag.attrs.itemprop === 'address');
    const names = rowTags.filter((tag) => !tag.closing && tag.name === 'meta' && tag.attrs.itemprop === 'name');
    if (addresses.length > 1 || names.length > 1) throw invalid('ambiguous eligible location');
    const placeholder = (value) => !value || value === publicTitle || value === title;
    const explicitLocations = [addresses[0]?.attrs.content ?? '', names[0]?.attrs.content ?? ''].filter((value) => !placeholder(value));
    // The publisher repeats the worship title in its Place fields. Only
    // that exact placeholder/blank can take the reviewed church hint. A new
    // off-site or online name/address stays explicit for curated resolution.
    // Leave placeholders empty so the shared resolver checks any explicit
    // meeting instruction before falling back to the reviewed church hint.
    const location = [...new Set(explicitLocations)].join(' — ');
    const sourceText = html.slice(tags[begin].end, tags[finish].start);
    items.push({ uid, title, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      timezone: feed.timezone, url: feed.url,
      location,
      // Full source text stays in memory for restrictions/mature/venue rules;
      // only these short public facts can become the database description.
      // Normalize publisher typography only for safety classification. The
      // shared matcher recognizes members-only; Unicode or spaced dashes
      // must not turn the same restriction into unrestricted public access.
      description: htmlText(sourceText).replace(/\s*[-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]\s*/g, '-'),
      rawDescription: sourceText,
      displayDescription: `${publicTitle}. Public listing from ${feed.name}. Map point is approximate; use the listed street address.`,
    });
  }
  // The rendered month is a rolling partial snapshot. Root range attributes
  // and navigation buttons do not prove later-month coverage or deletion.
  return { items, truncated: true, retireMissing: false, diagnostics };
}

function createSimcalAdapter(feed, venues) {
  return { sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [],
    maxCardsPerTitle: Infinity, weakDedupe: false, idPrefix: `simcal-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => parseSimpleCalendar(content, feed, now),
    fetch: async ({ fetchImpl, now }) => {
      const response = await fetchImpl(feed.url, { minIntervalMs: Math.max(1000, feed.minIntervalMs ?? 1000), timeoutMs: feed.timeoutMs });
      if (!response.ok) throw new Error(`Simple Calendar request failed (${response.status})`);
      return parseSimpleCalendar(await response.text(), feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createSimcalAdapter, parseSimpleCalendar, MAX_BYTES, MAX_EVENTS };
