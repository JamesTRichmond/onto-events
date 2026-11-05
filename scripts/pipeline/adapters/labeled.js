const path = require('node:path');
const { safeHtmlText } = require('../feed-text');
const { calendarRecord } = require('../calendar-record');
const { HORIZON_DAYS, localTime } = require('./ics');
const { eventLinks } = require('./jsonld');

const DAY = 86400000;
const MAX_EVENT_PAGES = 80;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Some venue sites (Harrah's Cherokee Center) publish no feed or event data,
// but every event page labels its facts: DATE "Wednesday, October 28, 2026",
// VENUE "Thomas Wolfe Auditorium", DOORS "7:00 pm", EVENT TIME(S) "8:00 pm",
// ENTRY POLICY "…". A `labeled` feed follows the listing's links on the hosts
// and paths it names, reads those labels, and lists only what they state: a
// page without a full date (year included) or a show time is reported, never
// guessed.

const stripCode = (html) => html.replace(/<(script|style|noscript|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

// "LABEL" followed by its value, in either of the two markups these pages
// use: <strong>LABEL</strong><br>value</p> or <dt>LABEL</dt><dd>value</dd>.
function labeledFields(html) {
  const fields = {};
  const clean = stripCode(html);
  const patterns = [
    /<strong>\s*([A-Z][A-Z ()&'’-]{1,40}?)\s*<\/strong>\s*<br\s*\/?>([\s\S]{0,2000}?)<\/p>/g,
    /<dt>\s*([A-Z][A-Z ()&'’-]{1,40}?)\s*<\/dt>\s*<dd>([\s\S]{0,500}?)<\/dd>/g,
  ];
  for (const pattern of patterns) {
    for (const [, label, value] of clean.matchAll(pattern)) {
      const key = label.trim().toUpperCase();
      if (!(key in fields)) fields[key] = safeHtmlText(value.replace(/<br\s*\/?>|<\/p>\s*<p[^>]*>/gi, ' | ')).replace(/(?:\s*\|\s*)+$/, '').trim();
    }
  }
  return fields;
}

function pageTitle(html) {
  const match = /<h1\b[^>]*>([\s\S]{0,500}?)<\/h1>/i.exec(stripCode(html));
  return match ? safeHtmlText(match[1]).trim() : '';
}

// The publisher's prose: the text blocks after the featured image, up to
// the related-events list.
function pageDescription(html) {
  const clean = stripCode(html);
  const start = clean.search(/class\s*=\s*"[^"]*\bevent-featured-image\b/);
  if (start < 0) return '';
  const blocks = [];
  for (const [, body] of clean.slice(start).matchAll(/<div\b[^>]*class\s*=\s*"[^"]*\bavia_textblock\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g)) {
    if (/<h\d\b[^>]*>\s*related events\s*<\/h\d>/i.test(body)) break;
    blocks.push(body.replace(/<a\b[^>]*class\s*=\s*"[^"]*event-read-more-link[^"]*"[^>]*>[\s\S]*?<\/a>/gi, ''));
    if (blocks.length >= 3) break;
  }
  return blocks.join('\n');
}

// "Wednesday, October 28, 2026" (weekday optional).
function labeledDate(value) {
  const match = /^(?:[a-z]+,?\s+)?([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(value.trim());
  if (!match) return null;
  const month = MONTHS.findIndex((name) => name.startsWith(match[1].toLowerCase()) && match[1].length >= 3);
  const day = Number(match[2]);
  if (month < 0 || day < 1 || day > 31) return null;
  const date = `${match[3]}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const check = new Date(Date.UTC(Number(match[3]), month, day));
  return check.getUTCMonth() === month ? date : null;
}

// "8:00 pm", "10:00 am - 5:00 pm", "2:00 pm & 7:30 pm", "2 pm - 4 pm & 7 pm":
// each part is one start or one range, every clock with its own meridiem. A
// doors time is not a show time, and a part that is neither ("2 - 4 pm",
// "Noon - 5 pm") or a value that still mentions doors is reported.
function labeledTimes(value) {
  const clock = /(\d{1,2})(?::(\d{2}))?\s*([ap])(?:\.?\s*m\b\.?|\b)/gi;
  const parse = ([, hour, minute = '00', half]) => {
    const h = Number(hour) % 12 + (half.toLowerCase() === 'p' ? 12 : 0);
    return Number(hour) >= 1 && Number(hour) <= 12 && Number(minute) < 60 ? `${String(h).padStart(2, '0')}${minute}00` : null;
  };
  const text = value.replace(/\([^)]*\bdoors?\b[^)]*\)/gi, ' ');
  if (/\bdoors?\b/i.test(text)) return [];
  const result = [];
  for (const part of text.split(/\s*(?:&|,|\||;|\band\b)\s*/i).filter((piece) => piece.trim())) {
    const times = [...part.matchAll(clock)].map(parse);
    const numbers = part.match(/\d{1,2}(?::\d{2})?/g) ?? [];
    const ranged = /(?:-|–|—|\bto\b)/i.test(part);
    if (!times.length || times.some((time) => !time) || numbers.length !== times.length) return [];
    if (times.length === 1 && !ranged) result.push({ start: times[0] });
    else if (times.length === 2 && ranged) result.push({ start: times[0], end: times[1] });
    else return [];
  }
  return result;
}

const TIME_LABELS = ['EVENT TIME(S)', 'EVENT TIME', 'EVENT TIMES', 'SHOW TIME', 'SHOWTIME', 'TIME'];

function pageItems(url, html, feed, now) {
  const fields = labeledFields(html);
  const title = pageTitle(html);
  if (!title) return { reason: 'missing title' };
  const date = fields.DATE ? labeledDate(fields.DATE) : null;
  if (!date) return { reason: 'missing event date' };
  // A page for a day outside the horizon says nothing about this run.
  const day = +localTime(date, '000000', feed.timezone);
  if (day >= now + HORIZON_DAYS * DAY || day + 2 * DAY <= now) return { items: [] };
  const timeLabel = TIME_LABELS.find((label) => fields[label]);
  const times = timeLabel ? labeledTimes(fields[timeLabel]) : [];
  if (!times.length) return { reason: 'missing event time' };
  const notes = ['DOORS', 'ENTRY POLICY', 'KNOW BEFORE YOU GO']
    .filter((label) => fields[label]).map((label) => `${label[0]}${label.slice(1).toLowerCase()}: ${fields[label].replace(/[.\s]+$/, '')}.`);
  const rawDescription = [notes.join(' '), pageDescription(html)].filter(Boolean).join('\n');
  const items = [];
  for (const time of times) {
    const start = +localTime(date, time.start, feed.timezone);
    let end = time.end ? +localTime(date, time.end, feed.timezone) : undefined;
    if (end !== undefined && end <= start) end = undefined;
    if (start >= now + HORIZON_DAYS * DAY || (end ?? start + 3 * 3600000) <= now) continue;
    items.push({
      uid: url, occurrence: new Date(start).toISOString(), title,
      description: safeHtmlText(rawDescription), rawDescription,
      ...(fields['ENTRY POLICY'] ? { ageNote: fields['ENTRY POLICY'] } : {}),
      location: fields.VENUE ?? '', url, timezone: feed.timezone,
      start: new Date(start).toISOString(), ...(end ? { end: new Date(end).toISOString() } : {}),
    });
  }
  return { items };
}

function expandLabeledPages(pages, feed, now) {
  const diagnostics = {};
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  const items = [];
  for (const [url, html] of pages) {
    if (typeof html !== 'string') { bump('event page fetch failed'); continue; }
    const result = pageItems(url, html, feed, now);
    if (result.reason) bump(result.reason);
    else items.push(...result.items);
  }
  items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const partial = pages.some(([, html]) => typeof html !== 'string');
  return {
    items, truncated: true, horizon: new Date(now + HORIZON_DAYS * DAY).toISOString(), diagnostics,
    ...(partial ? { retireMissing: false } : {}),
  };
}

function createLabeledAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `labeled-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const body = JSON.parse(content);
      if (!body || typeof body.index !== 'string' || (body.pages && (typeof body.pages !== 'object' || Array.isArray(body.pages)))) {
        throw new Error('Invalid labeled-page fixture');
      }
      const links = eventLinks(body.index, feed).slice(0, MAX_EVENT_PAGES);
      return expandLabeledPages(links.map((url) => [url, body.pages?.[url] ?? null]), feed, now);
    },
    fetch: async ({ fetchImpl, now }) => {
      const requestOptions = { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs };
      const response = await fetchImpl(feed.url, requestOptions);
      if (!response.ok) throw new Error(`Event listing request failed (${response.status})`);
      const links = eventLinks(await response.text(), feed);
      if (!links.length) throw new Error('Event listing links no event pages; source requires review');
      const pages = [];
      for (const url of links.slice(0, MAX_EVENT_PAGES)) {
        try {
          const page = await fetchImpl(url, requestOptions);
          pages.push([url, page.ok ? await page.text() : null]);
        } catch { pages.push([url, null]); }
      }
      return expandLabeledPages(pages, feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createLabeledAdapter, labeledFields, labeledDate, labeledTimes, pageItems, expandLabeledPages };
