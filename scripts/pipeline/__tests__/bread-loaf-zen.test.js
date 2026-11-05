jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const fs = require('node:fs');
const { calendarAdapters } = require('../sources');
const { readSourceFixture, fetchSourceRecords } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const feed = require('../../../docs/sources/vermont-round-two/batch-06-bread-loaf-zen/feed.json');
const venue = require('../../../docs/sources/vermont-round-two/batch-06-bread-loaf-zen/venue.json');
const evidence = require('../../../docs/sources/vermont-round-two/batch-06-bread-loaf-zen/reader-evidence.json');
const now = Date.parse(evidence.evaluationClock);
const adapter = () => calendarAdapters([feed], [venue])[0];
const fixture = () => fs.readFileSync(feed.fixturePath, 'utf8');

it('registers one Middlebury publisher and its exact physical temple contract in the candidate only', () => {
  const feeds = require('../../../data/feeds.json'), venues = require('../../../data/venues.json');
  expect(validateRegistries(feeds, venues)).toEqual([]);
  expect(feeds.filter((f) => new URL(f.url).hostname === 'breadloafmountainzen.org')).toEqual([feed]);
  expect(venues.find((v) => v.name === venue.name)).toEqual(venue);
  expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain(`- '${feed.name}'`);
});

it('retains the 21 real daily sittings and one physical Dharma reflection through the public catalog and PWA', () => {
  const result = readSourceFixture(adapter(), undefined, { now });
  expect(result.records).toHaveLength(22);
  expect(result.records.filter((r) => r.title === 'Meditation')).toHaveLength(21);
  expect(result.records.filter((r) => r.title.startsWith('Dharma'))).toHaveLength(1);
  expect(result.rejectedCount).toBe(0);
  expect(new Set(result.records.map((r) => r.id)).size).toBe(22);
  for (const record of result.records) {
    expect(record).toMatchObject({ sourceName: feed.name, venue: venue.name, locality: 'Middlebury', rating: 'general', timezone: 'America/New_York' });
    expect(record.description).toContain('See the publisher');
    expect(record.description).not.toMatch(/zoom\.us|pwd=|@|omitted/i);
    expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).not.toBeNull();
  }
});

it('preserves weekday, weekend and daylight-saving clocks without creating additional recurrence', () => {
  const records = readSourceFixture(adapter(), undefined, { now }).records;
  const day = (date) => records.find((r) => r.title === 'Meditation' && r.startsAtIso.startsWith(date));
  expect(day('2026-10-16')).toMatchObject({ startsAtIso: '2026-10-16T11:00:00.000Z', endsAtIso: '2026-10-16T11:40:00.000Z' });
  expect(day('2026-10-31')).toMatchObject({ startsAtIso: '2026-10-31T11:00:00.000Z', endsAtIso: '2026-10-31T12:00:00.000Z' });
  expect(day('2026-11-01')).toMatchObject({ startsAtIso: '2026-11-01T12:00:00.000Z', endsAtIso: '2026-11-01T13:00:00.000Z' });
  expect(day('2026-11-02')).toMatchObject({ startsAtIso: '2026-11-02T12:00:00.000Z', endsAtIso: '2026-11-02T12:40:00.000Z' });
  expect(records.some((r) => r.startsAtIso.startsWith('2026-11-06'))).toBe(false);
});

it('keeps hybrid attendance physical while excluding real member/clerical/online programmes and ambiguous VT locations', () => {
  const a = adapter(), snapshot = a.parseFixture(fixture(), { now });
  const result = readSourceFixture(a, undefined, { now });
  expect(snapshot.items).toHaveLength(30);
  expect(result.skipped).toEqual({ 'restricted or room-booking listing': 7, 'unmapped venue': 1 });
  expect(result.unmapped).toEqual({ VT: 1 });
  expect(result.records.some((r) => /Infinite Circle|Priests|Postulants|Precepts|Shared World|Intro to Zen/i.test(r.title))).toBe(false);
  const event = snapshot.items.find((r) => r.title === 'Meditation');
  expect(event.description).toMatch(/in person or online/i);
  expect(a.normalize(event, { now })).not.toBeNull();
  for (const restriction of ['This event is private.', 'This event is online-only.']) {
    expect(a.normalize({ ...event, description: event.description + ' ' + restriction }, { now })).toBeNull();
  }
  expect(a.normalize({ ...event, location: 'Private Residence' }, { now })).toBeNull();
  expect(a.normalize({ ...event, location: 'VT' }, { now })).toBeNull();
});

it('retains source cancellation identity and never retires missing occurrences from the real 30-entry rolling export', () => {
  const a = adapter(), event = a.parseFixture(fixture(), { now }).items.find((r) => r.title === 'Meditation');
  const original = a.normalize(event, { now });
  expect(a.normalize({ ...event, cancelled: true }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  expect(a.normalize({ ...event, title: 'Cancelled: Meditation' }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  const result = readSourceFixture(a, undefined, { now });
  expect(result.retireMissing).toBe(false);
  expect(result.diagnostics['export limit reached']).toBe(30);
  expect(a.parseFixture(fixture().replace(/BEGIN:VEVENT\r?\n[\s\S]*?END:VEVENT\r?\n/, ''), { now }).retireMissing).toBe(false);
});

it('fetches exactly one public export using the publisher ten-minute pacing and keeps joining credentials out of fixtures', async () => {
  const requests = [];
  const result = await fetchSourceRecords(adapter(), { now, overrides: {}, politeFetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, text: async () => fixture() };
  } });
  expect(requests).toEqual([{ url: feed.url, options: { minIntervalMs: 600000, timeoutMs: 30000 } }]);
  expect(result.records).toHaveLength(22);
  expect(result.retireMissing).toBe(false);
  expect(fixture()).not.toMatch(/zoom\.us\/|[?&]pwd=|mailto:/i);
});

it('pins the temple to its 76 Court Street building, not the Middlebury city point', () => {
  const temple = require('../../../data/venues.json').find((v) => v.name === venue.name);
  expect([temple.lat, temple.lng]).not.toEqual([44.0153, -73.1673]);
  expect(Math.abs(temple.lat - 44.0077135)).toBeLessThan(0.0005);
  expect(Math.abs(temple.lng - -73.1619119)).toBeLessThan(0.0005);
});
