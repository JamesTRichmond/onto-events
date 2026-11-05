import fs from 'node:fs';
import registry from './pipeline/sources.js';
import sync from './pipeline/sync-sources.js';
import supply from './pipeline/supply-report.js';
import venues from '../data/venues.json' with { type: 'json' };

try {
  let fixture = false, input, clock, baseline;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fixtures') fixture = true;
    else if (['--input', '--now', '--baseline'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const flag = args[i++];
      if (flag === '--input') input = args[i]; else if (flag === '--baseline') baseline = args[i]; else clock = args[i];
    } else throw new Error(`Invalid argument: ${args[i]}`);
  }
  if (fixture === Boolean(input)) throw new Error('Choose --fixtures or --input <canonical-records.json>');
  let snapshot;
  if (fixture) {
    const now = Date.parse(clock ?? supply.FIXTURE_NOW);
    snapshot = { ...await sync.syncSources({ sources: registry.SOURCES, fixture: true, dryRun: true, now, log: () => {}, logError: () => {} }), now, evidence: 'fixture' };
  } else {
    const value = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (baseline && (Array.isArray(value) || !Number.isFinite(value.now))) {
      throw new Error('Comparison requires a timestamped current snapshot envelope');
    }
    snapshot = Array.isArray(value) ? { records: value, evidence: 'provided', now: Date.now() } : value;
  }
  const report = supply.buildSupplyReport({ ...snapshot, now: clock ? Date.parse(clock) : snapshot.now }, venues);
  if (baseline) {
    if (!input || !clock) throw new Error('--baseline requires --input and --now to fix the comparison window');
    const before = JSON.parse(fs.readFileSync(baseline, 'utf8'));
    if (!Array.isArray(before.records) || !Number.isFinite(before.now)) throw new Error('Baseline requires a timestamped snapshot envelope');
    report.comparison = supply.compareSupplySnapshots(before, snapshot, Date.parse(clock));
  }
  console.log(JSON.stringify(report, null, 2));
  // Advisory supply targets never fail CI. A broken fixture/parser or input
  // remains a real error and cannot masquerade as a valid low-supply report.
  if (report.failedSources.length || report.invalidInputRecords) process.exitCode = 1;
} catch (error) {
  console.error(`Supply report failed: ${error.message}`);
  process.exitCode = 1;
}
