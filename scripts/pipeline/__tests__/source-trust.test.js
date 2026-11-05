const fs = require('node:fs');
const { sourceProfile, kindBySourceName, TICKETING, AGGREGATORS } = require('../source-trust');
const { toSupabaseRow } = require('../to-supabase-row');
const { readSourceFixture, processSourceItems } = require('../run-source');
const { validateRecord } = require('../schema');
const { SOURCES } = require('../sources');
const feeds = require('../../../data/feeds.json');
const tm = require('../adapters/ticketmaster');
const wrapper = require('../run-ticketmaster');
// Match the fixture inventory clock. A wall-clock horizon eventually asks a
// bounded captured calendar for detail pages that did not exist in its export.
const fixtureNow = Date.parse('2026-09-05T00:00:00Z');
function capturedClock(adapter) {
  // New captures carry their own evaluation clock. A September horizon must
  // not turn a real November public programme into an empty passing source.
  try {
    const fixture = JSON.parse(fs.readFileSync(adapter.fixturePath, 'utf8'));
    const clock = Date.parse(fixture.capture?.evaluationClock ?? fixture.evaluationClock);
    if (Number.isFinite(clock)) return clock;
  } catch { /* Non-JSON fixtures retain their established historical clock. */ }
  if (['Pioneer Works', 'Coney Island USA'].includes(adapter.sourceName)) {
    return Date.parse('2026-10-31T00:00:00Z');
  }
  return adapter.sourceName === 'Asheville Museum of History' ? Date.parse('2026-10-08T00:00:00Z') : fixtureNow;
}
const base = readSourceFixture(tm, undefined, { now: fixtureNow }).records[0];

it('records every trust tier in provenance without changing rating, cancellation or source credit', () => {
  for (const [sourceKind, trust] of [['community', 3], ['aggregator', 2], ['ticketing', 1]]) {
    const row = toSupabaseRow({ ...base, sourceKind, rating: 'mature', isCancelled: true });
    expect(row.provenance).toMatchObject({ kind: sourceKind, trust, source: 'Ticketmaster' });
    expect(row).toMatchObject({ rating: 'mature', is_cancelled: true });
  }
});

it('mirrors the app name mapping for platforms, aggregators and curated/community sources', () => {
  for (const sourceName of TICKETING) expect(sourceProfile({ source: 'live', sourceName: sourceName.toUpperCase() })).toEqual({ kind: 'ticketing', trust: 1 });
  for (const sourceName of AGGREGATORS) expect(sourceProfile({ source: 'live', sourceName })).toEqual({ kind: 'aggregator', trust: 2 });
  expect(kindBySourceName('Public venue calendar')).toBe('community');
  expect(sourceProfile({ source: 'seed', sourceName: 'Ticketmaster' })).toEqual({ kind: 'community', trust: 3 });
});

it('requires registered adapters and their canonical records to agree on source kind', () => {
  // Active readers must yield records at the fixture clock. Explicitly paused
  // registrations must prove that even fixture-mode sync cannot import them.
  for (const adapter of SOURCES) {
    expect(['ticketing', 'community', 'aggregator']).toContain(adapter.sourceKind);
    if (adapter.idPrefix === 'socrata-nyc-parks-queens-') {
      expect(readSourceFixture(adapter, undefined, { now: fixtureNow })).toMatchObject({
        records: [], rawCount: 0, truncated: true, retireMissing: false,
        skipReason: expect.stringContaining('Socrata reader not implemented'),
      });
      continue;
    }
    const pausedFeed = feeds.find((feed) => feed.name === adapter.sourceName && feed.pausedReason);
    if (pausedFeed) {
      expect(readSourceFixture(adapter, undefined, { now: capturedClock(adapter) })).toMatchObject({
        records: [], rawCount: 0, truncated: true, retireMissing: false,
        skipReason: `paused: ${pausedFeed.pausedReason}`,
      });
      continue;
    }
    const kinds = new Set(readSourceFixture(adapter, undefined, { now: capturedClock(adapter) }).records.map((r) => r.sourceKind));
    expect([adapter.sourceName, ...kinds]).toEqual([adapter.sourceName, adapter.sourceKind]);
  }
  expect(() => processSourceItems({ ...tm, normalize: () => ({ ...base, sourceKind: 'community' }) }, [base])).toThrow('kind');
  expect(validateRecord({ ...base, sourceKind: 'unknown' }).ok).toBe(false);
});

it('keeps catalog trust metadata out of the frozen Ticketmaster-only bake contract', () => {
  const page = JSON.parse(fs.readFileSync(tm.fixturePath, 'utf8'));
  const catalog = readSourceFixture(tm, undefined, { now: fixtureNow }).records;
  const offline = wrapper.processTicketmasterPages([page]).records;
  expect(catalog.every((r) => r.sourceKind === 'ticketing')).toBe(true);
  expect(offline).toEqual(catalog.map(({ sourceKind, ...record }) => record));
  expect(offline.every((r) => r.sourceName === 'Ticketmaster')).toBe(true);
});
