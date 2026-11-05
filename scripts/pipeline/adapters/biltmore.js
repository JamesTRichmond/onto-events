const path = require('node:path');
const { URL } = require('node:url');
const { safeHtmlText } = require('../feed-text');
const { calendarRecord } = require('../calendar-record');
const { HORIZON_DAYS, addDays, localDate, localTime } = require('./ics');

const DAY = 86400000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MAX_DAYS = 400;

// Biltmore publishes its events through the estate site's WordPress API
// (`/wp-json/wp/v2/event`): each has first and last dates (YYYYMMDD), the
// weekdays it runs, its hours as words ("4:30–8:15 p.m.", "5 p.m.–12 a.m.")
// and the places on the estate it happens ("Antler Hill Village"). A day is
// listed only when all of those are stated; "Select evenings", "Open daily;
// hours may vary" or an empty hours field is reported, never guessed.

// "11 a.m.–5 p.m.", "4:30–8:15 p.m." (one meridiem for both), "6 p.m.".
function biltmoreHours(value) {
  const words = safeHtmlText(String(value ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();
  const clock = String.raw`(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?`;
  const match = new RegExp(`^${clock}(?:\\s*(?:-|–|—|to)\\s*${clock})?$`).exec(words);
  if (!match) return null;
  const [, h1, m1 = '00', half1, h2, m2 = '00', half2] = match;
  const start = { hour: Number(h1), minute: Number(m1), half: half1 ?? half2 };
  const end = h2 ? { hour: Number(h2), minute: Number(m2), half: half2 } : null;
  const valid = (time) => time.half && time.hour >= 1 && time.hour <= 12 && time.minute < 60;
  if (!valid(start) || (end && !valid(end))) return null;
  const minutes = (time) => (time.hour % 12 + (time.half === 'p' ? 12 : 0)) * 60 + time.minute;
  // "11–1 p.m." shares the end's meridiem only when that keeps it in order;
  // otherwise the start takes the other one ("9–1 a.m." is 9 p.m. to 1 a.m.).
  if (!half1 && end && minutes(start) > minutes(end)) start.half = half2 === 'p' ? 'a' : 'p';
  const startMinutes = minutes(start);
  let endMinutes = end ? minutes(end) : null;
  // "5 p.m.–12 a.m." ends at the next midnight.
  if (endMinutes !== null && endMinutes <= startMinutes) endMinutes += 24 * 60;
  return { start: startMinutes, ...(endMinutes !== null ? { end: endMinutes } : {}) };
}

const ymd = (value) => typeof value === 'string' && /^\d{8}$/.test(value) ? value : null;
const hhmmss = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}00`;
const text = (value) => typeof value === 'string' ? value : '';

function biltmoreItems(events, feed, now) {
  const diagnostics = {};
  const bump = (reason) => { diagnostics[reason] = (diagnostics[reason] ?? 0) + 1; };
  const horizon = now + HORIZON_DAYS * DAY;
  const items = [];
  for (const event of Array.isArray(events) ? events : []) {
    const fields = event?.acf ?? {};
    const first = ymd(fields.e_event_start);
    const last = ymd(fields.e_event_end) ?? first;
    if (!first || last < first) { bump('missing event date'); continue; }
    // A last night that runs past midnight is still under way the next morning.
    if (+localTime(first, '000000', feed.timezone) >= horizon || +localTime(addDays(last, 2), '000000', feed.timezone) <= now) continue;
    const hours = biltmoreHours(fields.hours);
    const weekdays = Array.isArray(fields.days_of_the_week) ? fields.days_of_the_week.map((day) => String(day).toLowerCase()) : [];
    if (!hours || !weekdays.length) { bump('missing event time'); continue; }
    let link;
    try { link = new URL(text(event.link)); } catch { bump('missing identity or title'); continue; }
    const title = safeHtmlText(text(event.title?.rendered)).trim();
    if (link.protocol !== 'https:' || link.hostname !== new URL(feed.url).hostname || !title) { bump('missing identity or title'); continue; }
    const places = (Array.isArray(fields.location_select_event) ? fields.location_select_event : []).map((place) => safeHtmlText(text(place)).trim()).filter(Boolean);
    const rawDescription = [
      fields.sub_headline, fields.card_snippet, fields.cost && `Cost: ${fields.cost}`, fields.good_to_know, fields.additional_content,
    ].map(text).filter((part) => part.trim()).join('\n');
    // Walk from yesterday (or the first date, if later), so a long-running
    // series spends its day budget on days that can still list.
    const yesterday = localDate(now - DAY, feed.timezone);
    let day = first > yesterday ? first : yesterday;
    for (let count = 0; day <= last; day = addDays(day, 1), count++) {
      if (+localTime(day, '000000', feed.timezone) >= horizon) break;
      if (count >= MAX_DAYS) { bump('expansion limit reached'); break; }
      const weekday = WEEKDAYS[new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay()];
      if (!weekdays.includes(weekday)) continue;
      const start = +localTime(day, hhmmss(hours.start), feed.timezone);
      const end = hours.end === undefined ? undefined
        : +localTime(hours.end >= 24 * 60 ? addDays(day, 1) : day, hhmmss(hours.end), feed.timezone);
      if (start >= horizon || (end ?? start + 3 * 3600000) <= now) continue;
      items.push({
        uid: link.href, occurrence: new Date(start).toISOString(), title,
        description: safeHtmlText(rawDescription), ...(rawDescription ? { rawDescription } : {}),
        location: places.join(' and '), url: link.href, timezone: feed.timezone,
        start: new Date(start).toISOString(), ...(end ? { end: new Date(end).toISOString() } : {}),
      });
    }
  }
  items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { items, truncated: true, horizon: new Date(horizon).toISOString(), diagnostics };
}

function createBiltmoreAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `biltmore-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => biltmoreItems(JSON.parse(content), feed, now),
    fetch: async ({ fetchImpl, now }) => {
      const response = await fetchImpl(feed.url, { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs });
      if (!response.ok) throw new Error(`Event API request failed (${response.status})`);
      const events = JSON.parse(await response.text());
      if (!Array.isArray(events)) throw new Error('Event API response is not a list');
      // The API returns at most 100 per page; a full page may have more.
      if (events.length >= 100) throw new Error('Event API returned a full page; source requires review');
      return biltmoreItems(events, feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createBiltmoreAdapter, biltmoreHours, biltmoreItems };
