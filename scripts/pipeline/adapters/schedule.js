const path = require('node:path');
const { safeDisplayHtmlText, safeHtmlText } = require('../feed-text');
const { calendarRecord } = require('../calendar-record');
const { HORIZON_DAYS, localTime } = require('./ics');

const DAY = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// A published standing schedule: the publisher's own page states the days and
// hours ("Tuesdays from 3:30-6:30pm", "Oct 9-10, 16-17 2026") and offers no
// calendar feed (James, 2026-10-08: tailgate markets, the Haunted Trail).
// Every run re-reads that page and requires the schedule's own words to still
// be on it; a page that no longer says them fails the run instead of
// producing dates nobody published.
// The page is matched as a reader sees it: script, style and form bodies do
// not count, so words left behind in page data cannot keep a schedule alive.
const normalize = (value, decode = safeHtmlText) => decode(String(value ?? ''))
  .replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

function missingEvidence(pageText, evidence) {
  const page = normalize(pageText, safeDisplayHtmlText);
  return evidence.filter((phrase) => !page.includes(normalize(phrase)));
}

const ymd = (date) => date.replace(/-/g, '');
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Calendar days from..until inclusive, as YYYY-MM-DD, by UTC date arithmetic.
function* days(from, until) {
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${until}T00:00:00Z`); t += DAY) yield new Date(t).toISOString().slice(0, 10);
}

function occurrenceDates(event) {
  if (Array.isArray(event.dates)) return event.dates;
  return [...days(event.from, event.until)].filter((day) => event.weekdays.includes(WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]));
}

function scheduleItems(pageText, feed, now) {
  if (!feed.schedule) throw new Error('Published schedule requires verified publisher evidence; source is quarantined');
  const missing = missingEvidence(pageText, feed.schedule.evidence);
  if (missing.length) throw new Error(`Published schedule no longer states: ${missing.join(' | ')}; source requires review`);
  const horizon = now + HORIZON_DAYS * DAY;
  const items = [];
  for (const event of feed.schedule.events) {
    for (const day of occurrenceDates(event)) {
      const start = +localTime(ymd(day), `${event.start.replace(':', '')}00`, feed.timezone);
      const end = +localTime(ymd(day), `${event.end.replace(':', '')}00`, feed.timezone);
      if (start >= horizon || end <= now) continue;
      items.push({
        uid: `${feed.id}-${slug(event.title)}`, occurrence: new Date(start).toISOString(),
        title: event.title, description: event.description ?? '', location: '',
        url: feed.url, timezone: feed.timezone,
        start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      });
    }
  }
  items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { items, truncated: true, horizon: new Date(horizon).toISOString() };
}

function createScheduleAdapter(feed, venues) {
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `schedule-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => scheduleItems(content, feed, now),
    fetch: async ({ fetchImpl, now }) => {
      const response = await fetchImpl(feed.url, { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs });
      if (!response.ok) throw new Error(`Schedule page request failed (${response.status})`);
      return scheduleItems(await response.text(), feed, now);
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createScheduleAdapter, scheduleItems, missingEvidence, WEEKDAYS };
