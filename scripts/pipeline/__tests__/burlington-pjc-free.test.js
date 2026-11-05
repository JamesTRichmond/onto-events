jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const fs = require('node:fs');
const { calendarAdapters } = require('../sources');
const { readSourceFixture, fetchSourceRecords } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const batch = require('../../../docs/sources/vermont-round-two/batch-09-burlington-free/feeds.json');
const venues = require('../../../docs/sources/vermont-round-two/batch-09-burlington-free/venues.json');
const feed = batch.find((f) => f.id === 'peace-justice-center-burlington');
const body = require('../fixtures/tribe/peace-justice-center-burlington.json');
const now = Date.parse(body.capture.evaluationClock);
const adapter = () => calendarAdapters([feed], venues)[0];

it('reads all21 actual free programmes at three distinct published Burlington meeting points', () => {
  const result = readSourceFixture(adapter(), undefined, { now });
  expect(result.records).toHaveLength(21);
  expect(result.rejectedCount).toBe(0);
  expect(result.unmapped).toEqual({});
  expect(result.retireMissing).toBe(false);
  expect(new Set(result.records.map((r) => r.venue)).size).toBe(3);
  expect(result.records[0]).toMatchObject({ title: 'Mini Clean Up Crew at City Hall Park', area: '149 Church Street, Burlington, VT 05401', startsAtIso: '2026-10-20T12:00:00.000Z', endsAtIso: '2026-10-20T12:30:00.000Z' });
  expect(result.records.find((r) => r.startsAtIso === '2026-11-03T13:00:00.000Z')).toBeDefined();
  for (const record of result.records) {
    expect(record).toMatchObject({ locality: 'Burlington', region: 'VT', rating: 'general' });
    expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).not.toBeNull();
    expect(record.description).not.toMatch(/@|omitted/);
  }
});

it('keeps venue, public programme, online and age restrictions before the short card description', () => {
  const a = adapter(), event = a.parseFixture(JSON.stringify(body), { now }).items[0];
  const original = a.normalize(event, { now });
  for (const patch of [{ title: 'Unreviewed members meeting' }, { location: 'Unreviewed branch' }, { description: event.description + ' This event is private.' }, { description: event.description + ' This event is online-only.' }]) {
    expect(a.normalize({ ...event, ...patch }, { now })).toBeNull();
  }
  expect(a.normalize({ ...event, title: 'Cancelled: ' + event.title }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  expect(a.normalize({ ...event, description: event.description + ' Adults only, ages 18+.' }, { now })).toMatchObject({ rating: 'mature' });
});

it('applies the price gate in the real fetch path with publisher pacing and does not retire missing rows', async () => {
  const a = adapter(), requests = [];
  const politeFetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => body.pages[0] };
  };
  const result = await fetchSourceRecords(a, { now, overrides: {}, politeFetch });
  expect(result.records).toEqual(readSourceFixture(a, undefined, { now }).records);
  expect(requests).toHaveLength(1);
  expect(requests[0].options).toEqual({ minIntervalMs: 10000, timeoutMs: 20000 });
  expect(new URL(requests[0].url).searchParams.get('page')).toBe('1');
  const changed = { ...body.pages[0], events: body.pages[0].events.map((event) => ({ ...event, cost: '$20' })) };
  const paid = await fetchSourceRecords(a, { now, overrides: {}, politeFetch: async () => ({ ok: true, json: async () => changed }) });
  expect(paid.records).toEqual([]);
  expect(paid.diagnostics).toEqual({ 'unverified free admission': 21 });
  expect(paid.retireMissing).toBe(false);
  await expect(fetchSourceRecords(a, { now, overrides: {}, politeFetch: async () => ({ ok: false, status: 403 }) })).rejects.toThrow('403');
});

it('registers this opt-in only for the new publisher and rejects invalid option contracts', () => {
  const feeds = require('../../../data/feeds.json'), allVenues = require('../../../data/venues.json');
  expect(validateRegistries(feeds, allVenues)).toEqual([]);
  expect(feeds.find((f) => f.id === feed.id)).toEqual(feed);
  expect(feeds.filter((f) => f.requireFreeAdmission).map((f) => f.id)).toEqual([feed.id]);
  for (const patch of [{ requireFreeAdmission: false }, { requireFreeAdmission: 'true' }, { kind: 'ics' }]) {
    expect(validateRegistries([{ ...feed, ...patch }], venues)).toContain(`Invalid feed: ${feed.id}`);
  }
  expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain(`- '${feed.name}'`);
});
