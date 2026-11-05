const { localSnapshot, MAX_DESCRIPTION, PIPELINE_ONLY } = require('../local-snapshot');
const { buildLocalGenerated, parseGenerated } = require('../../refresh-core');
const { syncSources } = require('../sync-sources');
const { SOURCES } = require('../sources');

const now = Date.parse('2026-10-08T00:00:00Z');
const record = (id, startsAtIso, extra = {}) => ({
  id, startsAtIso, title: id, source: 'live', sourceName: 'Venue calendar', sourceKind: 'community',
  venueKind: 'indoor', isCancelled: false, description: 'Short.', ...extra,
});

it('keeps upcoming local listings in start order, without ticket sellers, cancellations or ended events', () => {
  const kept = localSnapshot([
    record('later', '2026-10-10T18:00:00Z'),
    record('tm', '2026-10-09T18:00:00Z', { sourceKind: 'ticketing', sourceName: 'Ticketmaster' }),
    record('cancelled', '2026-10-09T18:00:00Z', { isCancelled: true }),
    record('ended', '2026-10-07T18:00:00Z', { endsAtIso: '2026-10-07T20:00:00Z' }),
    record('underway', '2026-10-07T23:00:00Z', { endsAtIso: '2026-10-08T01:00:00Z' }),
    record('sooner', '2026-10-09T18:00:00Z'),
  ], now);
  expect(kept.map((r) => r.id)).toEqual(['underway', 'sooner', 'later']);
});

it('carries only app fields and a card-length description', () => {
  const long = 'x'.repeat(MAX_DESCRIPTION + 50);
  const [trimmed, short] = localSnapshot([
    record('long', '2026-10-09T18:00:00Z', { description: long, ratingBasis: 'explicit-all-ages', rating: 'general' }),
    record('short', '2026-10-10T18:00:00Z'),
  ], now);
  for (const key of PIPELINE_ONLY) expect(trimmed).not.toHaveProperty(key);
  expect(trimmed).not.toHaveProperty('ratingBasis');
  expect(trimmed.rating).toBe('general');
  expect(Array.from(trimmed.description)).toHaveLength(MAX_DESCRIPTION);
  expect(trimmed.description.endsWith('…')).toBe(true);
  expect(short.description).toBe('Short.');
});

it('bakes the registered calendar fixtures through the sync pipeline into a parseable file', async () => {
  const fixtureNow = Date.parse('2026-09-10T00:00:00Z');
  const sources = SOURCES.filter((source) => source.sourceKind !== 'ticketing');
  const result = await syncSources({ sources, fixture: true, dryRun: true, now: fixtureNow, log: () => {}, logError: () => {} });
  const records = localSnapshot(result.records, fixtureNow);
  expect(records.length).toBeGreaterThan(0);
  expect(records.every((r) => r.source === 'live' && r.sourceName && Number.isFinite(Date.parse(r.startsAtIso)))).toBe(true);
  const file = buildLocalGenerated(records, '2026-09-10T00:00:00.000Z');
  expect(parseGenerated(file)).toEqual({ generatedAt: '2026-09-10T00:00:00.000Z', count: records.length });
  expect(file).toContain('export const LOCAL_ACTIVITIES: Activity[] = ');
});
