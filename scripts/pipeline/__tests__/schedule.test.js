const { scheduleItems, missingEvidence, createScheduleAdapter } = require('../adapters/schedule');
const { validateRegistries } = require('../registry-validation');

const venue = {
  name: 'Contract Market', aliases: [], lat: 35.5951, lng: -82.5515, address: '1 Main St', locality: 'Asheville', region: 'NC',
  sourceUrl: 'https://example.org/', kind: 'outdoor', allAges: true, verifiedOn: '2026-10-08',
};
const feed = {
  id: 'contract-market', name: 'Contract Market', kind: 'schedule', sourceKind: 'community', serviceRegion: 'asheville',
  timezone: 'America/New_York', url: 'https://market.example/', defaultCategory: 'food', defaultRating: 'general',
  venueHint: 'Contract Market', termsUrl: 'https://market.example/', termsCheckedOn: '2026-10-08', notes: 'Contract feed.',
  fixturePath: 'scripts/pipeline/fixtures/schedule/west-asheville-tailgate-market.txt',
  schedule: {
    evidence: ['Tuesdays from 3:30-6:30pm', 'April – Christmas'],
    events: [{ title: 'Contract Market', weekdays: ['TU'], from: '2026-04-07', until: '2026-12-22', start: '15:30', end: '18:30' }],
  },
};
const page = '<p>Visit us <b>Tuesdays</b> from 3:30–6:30pm!</p><p>APRIL - CHRISTMAS</p>';
const now = Date.parse('2026-10-08T12:00:00Z');

it('lists the published weekdays inside the sixty-day horizon, in local time', () => {
  const { items } = scheduleItems(page, feed, now);
  expect(items.map((item) => item.start.slice(0, 10))).toEqual([
    '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01',
  ]);
  // 3:30 pm Eastern daylight time, then standard time after November 1.
  expect(items[0]).toMatchObject({ start: '2026-10-13T19:30:00.000Z', end: '2026-10-13T22:30:00.000Z', uid: 'contract-market-contract-market' });
  expect(items[3].start).toBe('2026-11-03T20:30:00.000Z');
  expect(new Set(items.map((item) => item.occurrence)).size).toBe(items.length);
});

it('lists explicit dates and drops the ones already over', () => {
  const dated = { ...feed, schedule: { evidence: ['Oct 9-10'], events: [{ title: 'Trail', dates: ['2026-10-07', '2026-10-09', '2026-10-10'], start: '18:00', end: '21:00' }] } };
  expect(scheduleItems('Open Oct 9-10, 6-9 pm', dated, now).items.map((item) => item.start)).toEqual(['2026-10-09T22:00:00.000Z', '2026-10-10T22:00:00.000Z']);
});

// The publisher's own words are the evidence; a page that drops them fails
// the run, so a changed schedule never keeps producing old dates.
it('fails the run when the page no longer states the schedule', () => {
  expect(missingEvidence('<p>Tuesdays from 3:30-6:30pm</p>', feed.schedule.evidence)).toEqual(['April – Christmas']);
  expect(() => scheduleItems('<p>Closed for the season</p>', feed, now)).toThrow('Published schedule no longer states');
});

// Words left in page data or a style block are not on the page a reader sees.
it('does not accept the schedule from script, style or form text', () => {
  const hidden = '<p>Closed for the season</p><script>window.copy = "Tuesdays from 3:30-6:30pm APRIL - CHRISTMAS";</script>'
    + '<style>/* April – Christmas */</style><form><label>Tuesdays from 3:30-6:30pm</label></form>';
  expect(missingEvidence(hidden, feed.schedule.evidence)).toEqual(feed.schedule.evidence);
  expect(() => scheduleItems(hidden, feed, now)).toThrow('Published schedule no longer states');
});

it('places every occurrence at the feed’s venue', async () => {
  const adapter = createScheduleAdapter(feed, [venue]);
  const snapshot = await adapter.fetch({ now, fetchImpl: async (url, options) => {
    expect(url).toBe(feed.url);
    expect(options).toEqual({ minIntervalMs: undefined, timeoutMs: undefined });
    return { ok: true, text: async () => page };
  } });
  const records = snapshot.items.map((item) => adapter.normalize(item, { now, skip: () => {} }));
  expect(records.every((record) => record.venue === 'Contract Market' && record.sourceName === 'Contract Market')).toBe(true);
});

it('validates schedules through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  const bad = (schedule) => validateRegistries([{ ...feed, schedule }], [venue]);
  expect(bad(undefined)).not.toEqual([]);
  expect(bad({ ...feed.schedule, evidence: [] })).not.toEqual([]);
  expect(bad({ ...feed.schedule, events: [{ ...feed.schedule.events[0], start: '25:00' }] })).not.toEqual([]);
  expect(bad({ ...feed.schedule, events: [{ ...feed.schedule.events[0], until: '2028-01-01' }] })).not.toEqual([]);
  expect(validateRegistries([{ ...feed, venueHint: undefined }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'ics' }], [venue])).not.toEqual([]);
});
