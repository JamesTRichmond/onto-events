const path = require('node:path');
const { URL } = require('node:url');
const { safeHtmlText } = require('../feed-text');
const { calendarRecord } = require('../calendar-record');
const { HORIZON_DAYS, localTime } = require('./ics');

const DAY = 86400000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Revival's calendar is a Webflow list of show cards: weekday, "Oct 8", a
// show time, the title and a ticket link. Its ticket pages sit behind a
// bot challenge, which onto does not pass, so the card is all there is. A
// card names no year; the weekday decides it: the show is on the next date
// (this year or next) that falls on the stated weekday, and a card whose
// weekday matches neither is reported. The cards' "DOORS" text is Webflow's
// placeholder Latin, never shown.

function cards(html) {
  return [...html.matchAll(/<div\b[^>]*role="listitem"[^>]*class="[^"]*\bw-dyn-item\b[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/g)].map(([, card]) => {
    const values = (pattern) => [...card.matchAll(pattern)].map(([, value]) => safeHtmlText(value).trim());
    return {
      href: /<a\b[^>]*href="([^"]+)"/.exec(card)?.[1] ?? '',
      dates: values(/<p class="[^"]*\bdate\b(?![^"]*\bdark\b)[^"]*">([^<]*)<\/p>/g),
      time: values(/<p class="[^"]*\bdate dark\b[^"]*">([^<]*)<\/p>/g)[0] ?? '',
      title: values(/<div class="[^"]*\bb-show-2\b[^"]*">([^<]*)<\/div>/g)[0] ?? '',
    };
  });
}

// "Thursday" + "Oct 8": the first such date, from yesterday on (last year's
// Dec 31 still counts on Jan 1), whose weekday is the one stated.
function cardDate(weekday, monthDay, now, timezone) {
  const day = WEEKDAYS.indexOf(weekday.toLowerCase());
  const match = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})$/i.exec(monthDay);
  const month = match ? MONTHS.indexOf(match[1].toLowerCase()) : -1;
  if (day < 0 || month < 0) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const year = Number(today.slice(0, 4));
  for (const candidate of [year - 1, year, year + 1]) {
    const date = new Date(Date.UTC(candidate, month, Number(match[2])));
    if (date.getUTCMonth() !== month) continue;
    const iso = date.toISOString().slice(0, 10);
    if (iso < new Date(Date.parse(`${today}T00:00:00Z`) - DAY).toISOString().slice(0, 10)) continue;
    return date.getUTCDay() === day ? iso.replace(/-/g, '') : null;
  }
  return null;
}

function showTime(value) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(value.trim());
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) return null;
  const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === 'p' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}${match[2] ?? '00'}00`;
}

function revivalItems(html, feed, now) {
  const diagnostics = {};
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  const horizon = now + HORIZON_DAYS * DAY;
  const items = [];
  for (const card of cards(html)) {
    const [weekday = '', monthDay = ''] = card.dates;
    const date = cardDate(weekday, monthDay, now, feed.timezone);
    if (!date) { bump('missing event date'); continue; }
    const time = showTime(card.time);
    if (!time) { bump('missing event time'); continue; }
    let url;
    try { url = new URL(card.href); } catch { url = null; }
    if (!url || url.protocol !== 'https:' || !card.title) { bump('missing identity or title'); continue; }
    url.hash = '';
    const start = +localTime(date, time, feed.timezone);
    if (start >= horizon || start + 3 * 3600000 <= now) continue;
    items.push({
      uid: url.href, occurrence: new Date(start).toISOString(), title: card.title, description: '',
      location: '', url: url.href, timezone: feed.timezone, start: new Date(start).toISOString(),
    });
  }
  items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { items, truncated: true, horizon: new Date(horizon).toISOString(), diagnostics };
}

function createRevivalAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `revival-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => revivalItems(content, feed, now),
    fetch: async ({ fetchImpl, now }) => {
      const response = await fetchImpl(feed.url, { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs });
      if (!response.ok) throw new Error(`Calendar page request failed (${response.status})`);
      const html = await response.text();
      if (!cards(html).length) throw new Error('Calendar page has no show cards; source requires review');
      return revivalItems(html, feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createRevivalAdapter, revivalItems, cardDate, showTime };
