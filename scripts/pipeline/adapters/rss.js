const path = require('node:path');
const { parseXml, child, content } = require('../feed-xml');
const { calendarRecord } = require('../calendar-record');
const { htmlText, safeHtmlText } = require('../feed-text');

const ATOM = 'http://www.w3.org/2005/Atom';
const EVENT = 'http://purl.org/rss/1.0/modules/event/';
const DC = 'http://purl.org/dc/elements/1.1/';
const ISO = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})\b/g;
const RSS_DATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(?:(GMT|UTC)|([+-])(\d{2})(\d{2}))$/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function eventDate(value) {
  if (!value || value.match(ISO)?.[0] !== value || !Number.isFinite(Date.parse(value))) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return new Date(value).toISOString();
}

function rssEventDate(value) {
  const match = value?.match(RSS_DATE);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.indexOf(match[2].toLowerCase());
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
  const calendarDate = new Date(Date.UTC(year, month, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month || calendarDate.getUTCDate() !== day) return null;
  const offsetMinutes = (match[8] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  return new Date(Date.UTC(year, month, day, hour, minute, second) - offsetMinutes * 60_000).toISOString();
}

function atomText(node) {
  if (!node) return '';
  const type = (node.attrs.type ?? 'text').split(';', 1)[0].trim().toLowerCase();
  if (node.attrs.src || !['text', 'html', 'xhtml', 'application/xhtml+xml'].includes(type) && !/^text\/[^\s/;]+$/.test(type)) {
    throw new Error('Unsupported Atom content; source requires review');
  }
  return ['html', 'text/html'].includes(type) ? htmlText(content(node)) : content(node).trim();
}

function atomUrl(root, entry, link, url) {
  if (!link) return undefined;
  for (const node of [root, entry, link]) if (node.attrs['xml:base']) url = new URL(node.attrs['xml:base'], url).href;
  return link.attrs.href ? new URL(link.attrs.href, url).href : undefined;
}

function parseFeed(xml, feed, now) {
  const root = parseXml(xml);
  const atom = root.local === 'feed' && root.ns === ATOM;
  const channel = root.local === 'rss' && !root.ns ? child(root, 'channel') : atom ? root : null;
  if (!channel) throw new Error('Expected RSS 2.0 or Atom feed');
  const entries = channel.children.filter((item) => item.local === (atom ? 'entry' : 'item') && item.ns === (atom ? ATOM : ''));
  const items = [];
  const diagnostics = {};
  const skip = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  let dated = 0;
  for (const entry of entries) {
    const value = (name, ns = atom ? ATOM : '') => content(child(entry, name, ns)).trim();
    const title = atom ? atomText(child(entry, 'title', ATOM)) : value('title');
    // Publication fields describe the post unless a source note explicitly
    // proves this feed uses RSS pubDate for the event start.
    const structured = value('startdate', EVENT) || (feed.eventDateField === 'dc:date' ? value('date', DC) : '');
    const titleDates = [...new Set(title.match(ISO) ?? [])];
    const publication = !atom && feed.eventDateField === 'pubDate' ? value('pubDate') : '';
    const start = structured ? eventDate(structured)
      : publication ? rssEventDate(publication)
        : eventDate(titleDates.length === 1 ? titleDates[0] : '');
    if (!start) { skip('missing unambiguous event date'); continue; }
    dated++;
    const endText = value('enddate', EVENT);
    const end = eventDate(endText);
    if (endText && !end || end && end < start) { skip('invalid event end'); continue; }
    if (Date.parse(start) >= now + 60 * 86400000 || (end ? Date.parse(end) : Date.parse(start) + 3 * 3600000) <= now) { skip('outside horizon'); continue; }
    const link = entry.children.find((item) => item.local === 'link' && item.ns === ATOM && (!item.attrs.rel || item.attrs.rel === 'alternate'));
    const url = atom ? atomUrl(root, entry, link, feed.url) : value('link');
    const uid = value(atom ? 'id' : 'guid') || url;
    if (!uid) { skip('missing stable identity'); continue; }
    const rawDescription = atom ? undefined : value('description');
    items.push({ uid, title, start, end: end ?? undefined, url,
      // Both summary and full inline content can contain age restrictions.
      description: atom ? [...new Set(['summary', 'content'].map((name) => atomText(child(entry, name, ATOM))).filter(Boolean))].join('\n')
        : safeHtmlText(rawDescription),
      ...(rawDescription ? { rawDescription } : {}),
      location: value('location', EVENT), timezone: feed.timezone,
      cancelled: value('status', EVENT).toUpperCase() === 'CANCELLED',
    });
  }
  // RSS is often a rolling recent-post window. It cannot prove that an absent
  // event was deleted, so synchronization may upsert but must never retire it.
  return { items, truncated: true, retireMissing: false, diagnostics,
    ...(!dated && entries.length ? { skipReason: 'no structured event dates; feed not eligible' } : {}) };
}

function createRssAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `rss-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => parseFeed(content, feed, now),
    fetch: async ({ fetchImpl, now }) => {
      const response = await fetchImpl(feed.url, { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs });
      if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
      return parseFeed(await response.text(), feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createRssAdapter, parseFeed, eventDate, rssEventDate };
