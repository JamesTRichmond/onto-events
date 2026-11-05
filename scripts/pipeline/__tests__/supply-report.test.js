const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { buildSupplyReport, saveSyncSnapshot, FIXTURE_NOW } = require('../supply-report');
const { readSourceFixture } = require('../run-source');
const { oneNightPhrase, boundDescription } = require('../event-signals');
const tm = require('../adapters/ticketmaster');
const now = Date.parse(FIXTURE_NOW);
const fixture = readSourceFixture(tm, undefined, { now });
const base = fixture.records.find((r) => r.id === 'tm-killers-1');
const root = path.resolve(__dirname, '../../..');

it('reports deterministic 7/30-day fixture counts across every requested dimension and dedupe/reject rules', () => {
  const report = buildSupplyReport({ ...fixture, results: [fixture], now, evidence: 'fixture' });
  expect(report.windows[7].total).toBe(2);
  expect(report.windows[30]).toMatchObject({ total: 4, nonTicketmaster: 0,
    byRating: { family: 1, general: 1, mature: 2 }, bySource: { Ticketmaster: 4 }, byVenueKind: { unknown: 4 } });
  expect(Object.keys(report.windows[30].byCategory)).toHaveLength(14);
  expect(report.dedupeMergesByRule).toEqual({ exact: 0, strong: 1, weak: 0 });
  expect(Object.values(report.rejectsByReason).reduce((a, b) => a + b, 0)).toBe(1);
  expect(report.advisory).toMatchObject({ blocking: false, met: false, acceptedByJames: false });
});

it('keeps ongoing supply and excludes cancellations, ended events and the exclusive window boundary', () => {
  const event = (id, start, end, cancelled = false) => ({ ...base, id, startsAtIso: start, endsAtIso: end, isCancelled: cancelled });
  const report = buildSupplyReport({ now, records: [
    event('underway', '2026-08-31T20:00:00Z', '2026-09-01T01:00:00Z'),
    event('ended', '2026-08-31T20:00:00Z', '2026-09-01T00:00:00Z'),
    event('cancelled', '2026-09-02T20:00:00Z', undefined, true),
    event('boundary', '2026-09-08T00:00:00Z'),
  ] });
  expect(report.windows[7].total).toBe(1);
  expect(report.windows[30].total).toBe(2);
});

it('counts unmapped venues and source skips/failures without claiming a complete successful catalog', () => {
  const report = buildSupplyReport({ now, records: [base], results: [{ skipped: { 'unmapped venue': 3 }, diagnostics: { 'recurrence cap': 2 }, rejects: [], dropped: [] }],
    summaries: [{ sourceName: 'bad', status: 'failed' }, { sourceName: 'locked', status: 'skipped', reason: 'no key' }] });
  expect(report).toMatchObject({ complete: false, failedSources: ['bad'], unmappedVenues: 3, diagnostics: { 'recurrence cap': 2 } });
  expect(report.windows[30].bySource.locked).toBe(0);
});

it('lists the ten soonest one-night-only hits with the actual source phrase and preserves long descriptions', () => {
  const records = Array.from({ length: 12 }, (_, index) => ({ ...base, id: `hit-${index}`, title: `One night only ${index}`, startsAtIso: new Date(now + index * 86400000).toISOString() })).reverse();
  const report = buildSupplyReport({ records, now });
  expect(report.oneNightOnly.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `hit-${i}`));
  for (const phrase of ['one-night-only', 'one show only', 'Farewell', 'final performance']) expect(oneNightPhrase({ description: phrase })).toBe(phrase);
  const long = boundDescription('x'.repeat(8200) + ' One show only.');
  expect(Array.from(long).length).toBe(8000);
  expect(long).toContain('One show only.');
});

it('maps curated venue aliases and surfaces invalid input rather than counting it as supply', () => {
  const report = buildSupplyReport({ now, records: [base, { ...base, id: 'bad', rating: 'invalid' }] }, [{ name: 'Venue', aliases: ['Delta Center'], kind: 'hall' }]);
  expect(report.windows[30].byVenueKind.hall).toBe(1);
  expect(report.invalidInputRecords).toBe(1);
  expect(report.rejectsByReason).toHaveProperty('bad rating: invalid', 1);
});

it('saves only processed data with redaction, then reads the same snapshot without another fetch', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-supply-'));
  try {
    const file = path.join(directory, 'snapshot.json');
    saveSyncSnapshot(file, { records: [base], summaries: [{ sourceName: 'secret-value' }], results: [fixture] },
      { now, evidence: 'live', redact: (value) => value.replaceAll('secret-value', '[redacted]') });
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(snapshot.summaries[0].sourceName).toBe('[redacted]');
    expect(snapshot.results[0].records).toBeUndefined();
    const report = JSON.parse(execFileSync(process.execPath, ['scripts/supply-report.mjs', '--input', file], { cwd: root, encoding: 'utf8' }));
    expect(report).toMatchObject({ evidence: 'live', inputRecords: 1 });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('runs fixture advisory targets without credentials or network, and rejects invalid CLI usage', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/supply-report.mjs', '--fixtures'], { cwd: root, encoding: 'utf8' }));
  expect(report).toMatchObject({ evidence: 'fixture', now: FIXTURE_NOW });
  expect(report.windows[30].total).toBeGreaterThanOrEqual(4);
  expect(report.windows[30].nonTicketmaster).toBeGreaterThanOrEqual(0);
  const result = spawnSync(process.execPath, ['scripts/supply-report.mjs', '--fixtures', '--now', 'invalid'], { cwd: root, encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('valid clock');
});

it('counts cross-source overlap once and never credits a richer TM duplicate as new supply', () => {
  const copy = { ...base, id: 'venue-copy', sourceName: 'Venue', description: 'Richer organizer copy. '.repeat(10), rating: 'mature' };
  for (const records of [[base, copy], [copy, base]]) {
    const report = buildSupplyReport({ records, now });
    expect(report).toMatchObject({ inputRecords: 2, uniqueRecords: 1, aggregateDedupeMerges: 1 });
    expect(report.windows[30]).toMatchObject({ total: 1, nonTicketmaster: 0, bySource: { Venue: 1 }, byRating: { mature: 1 } });
    expect(report.dedupeMergesByRule.strong).toBe(1);
  }
  const distinct = { ...copy, id: 'new-show', title: 'Different performance' };
  expect(buildSupplyReport({ records: [base, copy, distinct], now }).windows[30].nonTicketmaster).toBe(1);
  expect(buildSupplyReport({ records: [{ ...distinct, source: 'seed' }], now }).windows[30].nonTicketmaster).toBe(0);
});
