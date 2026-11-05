const { buildSupplyReport, compareSupplySnapshots } = require('../supply-report');
const { readSourceFixture } = require('../run-source');
const tm = require('../adapters/ticketmaster');
const { isRestrictedListing } = require('../calendar-record');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const now = Date.parse('2026-09-01T00:00:00Z');
const base = readSourceFixture(tm, undefined, { now }).records.find((r) => r.id === 'tm-killers-1');
const record = (id, rating = 'general') => ({ ...base, id, title: id, rating, startsAtIso: '2026-09-02T20:00:00Z' });

it('measures visible modes, venues, regions and cancelled records without counting hidden adults', () => {
  const report = buildSupplyReport({ records: [record('general'), record('family', 'family'), record('adult', 'mature'), { ...record('cancelled'), isCancelled: true }], now });
  expect(report.windows[30]).toMatchObject({ total: 3, v2Visible: 2, byVisibleMode: { family: 1, everyone: 1 }, byServiceRegion: { utah: 3 } });
  expect(report.cancelledRecords).toBe(1);
  expect(report.windows[30].confirmedIncludesFood).toBe(0);
});

it('compares a fixed window and does not credit source renames or hidden adult additions', () => {
  const baseline = { now, records: [record('same'), record('removed')], evidence: 'live' };
  const current = { now: now + 86400000, records: [{ ...record('same'), id: 'new-provider-id', sourceName: 'Other source' }, record('added'), record('adult', 'mature')], evidence: 'live' };
  expect(compareSupplySnapshots(baseline, current, now)).toMatchObject({ baselineVisible: 2, currentVisible: 2, added: 1, removed: 1, netIncrease: 0, liveTargetEvaluable: true });
  expect(compareSupplySnapshots({ ...baseline, evidence: 'fixture' }, current, now).liveTargetEvaluable).toBe(false);
  expect(compareSupplySnapshots(baseline, { ...current, summaries: [{ status: 'skipped', sourceName: 'No key' }] }, now).liveTargetEvaluable).toBe(false);
});

it('claims the proposed net target only for complete live comparisons', () => {
  const records = Array.from({ length: 50 }, (_, index) => record(`candidate-${index}`));
  const baseline = { now, records: [], evidence: 'live' };
  const current = { now, records, evidence: 'live' };
  expect(compareSupplySnapshots(baseline, current, now)).toMatchObject({ liveTargetEvaluable: true, added: 50, proposedNet50Met: true });
  expect(compareSupplySnapshots(baseline, { ...current, evidence: 'fixture' }, now))
    .toMatchObject({ liveTargetEvaluable: false, added: 50, proposedNet50Met: false });
  expect(compareSupplySnapshots(baseline, { ...current, summaries: [{ status: 'skipped', sourceName: 'No key' }] }, now))
    .toMatchObject({ liveTargetEvaluable: false, added: 50, proposedNet50Met: false });
});

it('does not count already-hosted private listings as public supply or growth', () => {
  const records = [{ ...record('private'), title: 'Private party' }, { ...record('rental'), title: 'Room rental' }, record('public')];
  expect(buildSupplyReport({ records, now })).toMatchObject({ inputRecords: 3, restrictedRecords: 2, windows: { 30: { total: 1, v2Visible: 1 } } });
  expect(compareSupplySnapshots({ now, records: [], evidence: 'live' }, { now, records, evidence: 'live' }, now)).toMatchObject({ added: 1, netIncrease: 1 });
});

it('never calls a dry-run capture a successful production refresh', () => {
  const snapshot = { now, records: [record('show')], summaries: [{ sourceName: 'Ticketmaster', status: 'ok' }] };
  expect(buildSupplyReport(snapshot).sources[0].lastSuccessfulRefresh).toBeNull();
  expect(buildSupplyReport({ ...snapshot, freshness: [{ sourceName: 'Ticketmaster', completedAt: '2026-09-01T00:00:00Z' }] }).sources[0].lastSuccessfulRefresh).toBe('2026-09-01T00:00:00Z');
});

it('the CLI keeps both capture timestamps while evaluating the same comparison window', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-v2-compare-'));
  try {
    const baseline = path.join(directory, 'before.json'), current = path.join(directory, 'after.json');
    fs.writeFileSync(baseline, JSON.stringify({ now, records: [record('show')], evidence: 'live' }));
    fs.writeFileSync(current, JSON.stringify({ now: now + 86400000, records: [record('show')], evidence: 'live' }));
    const report = JSON.parse(execFileSync(process.execPath, ['scripts/supply-report.mjs', '--input', current, '--baseline', baseline, '--now', new Date(now).toISOString()], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' }));
    expect(report.comparison).toMatchObject({ now: new Date(now).toISOString(), baselineCapturedAt: new Date(now).toISOString(), currentCapturedAt: new Date(now + 86400000).toISOString(), netIncrease: 0 });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('does not equate a public calendar with permission to attend private events or room bookings', () => {
  expect(isRestrictedListing('Car show', 'Private party. Ask us about invitations.')).toBe(true);
  expect(isRestrictedListing('Eliot Hall Rental: Reception', '')).toBe(true);
  expect(isRestrictedListing('Members-only meeting', '')).toBe(true);
  expect(isRestrictedListing('Public art workshop', 'Meet our staff. All are welcome.')).toBe(false);
  expect(isRestrictedListing('Public zoo day', 'All welcome. Book a private party at our venue.')).toBe(false);
  expect(isRestrictedListing('Car show', 'This event is private.')).toBe(true);
});
