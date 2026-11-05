jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const fs = require('node:fs');
const { calendarAdapters } = require('../sources');
const { readSourceFixture, processSourceItems, fetchSourceRecords } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const feeds = require('../../../docs/sources/vermont-round-two/batch-05-three-new-publishers/feeds.json');
const venues = require('../../../docs/sources/vermont-round-two/batch-05-three-new-publishers/venues.json');
const activeFeeds = require('../../../data/feeds.json');
const adapter = (id) => calendarAdapters([feeds.find((f) => f.id === id)], venues)[0];
const capture = (a) => JSON.parse(fs.readFileSync(a.fixturePath, 'utf8'));
const clock = (a) => Date.parse(capture(a).capture.evaluationClock);

it('keeps three distinct new publishers outside active registration until enrollment review', () => {
  expect(validateRegistries([...activeFeeds, ...feeds], [...require('../../../data/venues.json'), ...venues])).toEqual([]);
  expect(feeds).toHaveLength(3);
  expect(new Set(feeds.map((f) => new URL(f.url).hostname)).size).toBe(3);
  for (const feed of feeds) expect(activeFeeds.some((f) => f.id === feed.id || f.name === feed.name)).toBe(false);
});

it.each([
  ['essex-community-players', 8, 8],
  ['shelburne-vineyard', 9, 0],
  ['switchback-brewing-vermont', 11, 0],
])('replays original %s dates through the canonical catalog and PWA boundary', (id, count, publicCount) => {
  const a = adapter(id), now = clock(a);
  const result = readSourceFixture(a, undefined, { now });
  expect(result.records).toHaveLength(count);
  expect(result.records.filter((r) => r.rating !== 'mature')).toHaveLength(publicCount);
  expect(result.rejectedCount).toBe(0);
  expect(result.unmapped).toEqual({});
  expect(result.retireMissing).toBe(false);
  expect(new Set(result.records.map((r) => r.id)).size).toBe(count);
  for (const record of result.records) {
    expect(record).toMatchObject({ sourceName: a.sourceName, region: 'VT', timezone: 'America/New_York' });
    expect(record.description).toContain('See the publisher');
    expect(record.description).not.toMatch(/@|\[contact omitted\]/);
    expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).not.toBeNull();
  }
});

it('retains each Essex performance clock rather than expanding a run into invented dates', () => {
  const a = adapter('essex-community-players');
  const result = readSourceFixture(a, undefined, { now: clock(a) });
  expect(result.records.find((r) => r.startsAtIso.startsWith('2026-10-16'))).toMatchObject({ startsAtIso: '2026-10-16T23:30:00.000Z', endsAtIso: '2026-10-17T01:00:00.000Z', venue: 'Essex Memorial Hall' });
  expect(result.records.find((r) => r.startsAtIso.startsWith('2026-10-18'))).toMatchObject({ startsAtIso: '2026-10-18T18:00:00.000Z', endsAtIso: '2026-10-18T19:30:00.000Z' });
});

it('excludes actual vineyard series containers and brewery meal specials without weakening age policy', () => {
  const vineyard = adapter('shelburne-vineyard'), vnow = clock(vineyard);
  const raw = vineyard.parseFixture(JSON.stringify(capture(vineyard)), { now: vnow }).items;
  for (const title of ['Rusty K Boose October Thursday Residency', 'Blue Sundays']) {
    const event = raw.find((r) => r.title === title);
    expect(event).toBeDefined();
    expect(vineyard.normalize(event, { now: vnow })).toBeNull();
  }
  const brewery = adapter('switchback-brewing-vermont'), now = clock(brewery);
  const items = brewery.parseFixture(JSON.stringify(capture(brewery)), { now }).items;
  const meals = items.filter((r) => /wings|fried chicken|buns.*brew/i.test(r.title));
  expect(meals.length).toBeGreaterThan(10);
  expect(processSourceItems(brewery, { items: meals }, { now }).records).toEqual([]);
  for (const a of [vineyard, brewery]) expect(readSourceFixture(a, undefined, { now: clock(a) }).records.every((r) => r.rating === 'mature')).toBe(true);
});

it.each(feeds.map((f) => [f.id]))('fails closed for unknown venues and access restrictions, retaining %s cancellation ownership', (id) => {
  const a = adapter(id), now = clock(a);
  const items = a.parseFixture(JSON.stringify(capture(a)), { now }).items;
  const event = items.find((item) => a.normalize(item, { now }));
  const original = a.normalize(event, { now });
  expect(a.normalize({ ...event, location: 'Unreviewed Private Venue' }, { now })).toBeNull();
  for (const restriction of ['This event is private.', 'This event is online-only.']) {
    expect(a.normalize({ ...event, description: event.description + ' ' + restriction }, { now })).toBeNull();
  }
  expect(a.normalize({ ...event, title: 'Cancelled: ' + event.title }, { now })).toMatchObject({ id: original.id, isCancelled: true });
});

it('uses only allowed RSS and ordinary HTML requests and never retires absent rows after partial-page failure', async () => {
  const a = adapter('essex-community-players'), body = capture(a), now = clock(a), urls = [];
  const result = await fetchSourceRecords(a, { now, overrides: {}, politeFetch: async (url) => {
    urls.push(url);
    return { ok: true, text: async () => url === feeds[0].url ? body.rss : body.pages[url] };
  } });
  expect(result.records).toEqual(readSourceFixture(a, undefined, { now }).records);
  expect(urls).toHaveLength(9);
  expect(urls.some((url) => /format=(?:json|ical)/.test(url))).toBe(false);
  const missing = { ...body, pages: { ...body.pages } };
  delete missing.pages[Object.keys(missing.pages)[0]];
  const partial = a.parseFixture(JSON.stringify(missing), { now });
  expect(partial.retireMissing).toBe(false);
  expect(partial.diagnostics['event page fetch failed']).toBe(1);
});
