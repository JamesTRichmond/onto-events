import fs from 'node:fs';
import registry from './pipeline/sources.js';
import sync from './pipeline/sync-sources.js';
import supply from './pipeline/supply-report.js';
import audit from './pipeline/rating-audit.js';
import venues from '../data/venues.json' with { type: 'json' };

try {
  const args = process.argv.slice(2);
  let records, evidence, failedSources = 0, skippedSources = [];
  if (args.length === 1 && args[0] === '--fixtures') {
    const result = await sync.syncSources({ sources: registry.SOURCES, fixture: true, dryRun: true,
      now: Date.parse(supply.FIXTURE_NOW), log: () => {}, logError: () => {} });
    records = result.records; evidence = 'fixture'; failedSources = result.totals.failedSources;
    skippedSources = result.summaries.filter((s) => s.status === 'skipped');
  } else if (args.length === 2 && args[0] === '--input') {
    const input = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    records = Array.isArray(input) ? input : input.records;
    evidence = Array.isArray(input) ? 'provided' : input.evidence ?? 'provided';
    failedSources = input.summaries?.filter((s) => s.status === 'failed').length ?? 0;
    skippedSources = input.summaries?.filter((s) => s.status === 'skipped') ?? [];
  } else throw new Error('Choose --fixtures or --input <records-or-sync-snapshot.json>');
  if (!Array.isArray(records)) throw new Error('Audit input requires canonical records');
  const report = audit.ratingAudit(records, venues);
  const sourcesComplete = !failedSources && !skippedSources.length;
  console.log(JSON.stringify({ evidence, failedSources, skippedSources, sourcesComplete,
    complete: sourcesComplete && report.venueMetadataComplete && !report.invalidRecords, ...report }, null, 2));
  if (!sourcesComplete || report.invalidRecords) process.exitCode = 1;
} catch (error) { console.error(`Rating audit failed: ${error.message}`); process.exitCode = 1; }
