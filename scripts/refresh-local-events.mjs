// Refresh the bundled offline local listings (data/local-events.ts) from the
// public calendars the event sync reads: npm run events:refresh:local
// Live fetch through the same pipeline as `npm run events:sync`, run without
// writing to the database, so it needs no keys. --force allows a large shrink.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import registry from './pipeline/sources.js';
import sync from './pipeline/sync-sources.js';
import snapshot from './pipeline/local-snapshot.js';
import core from './refresh-core.js';
import regions from './pipeline/service-regions.js';

const arguments_ = process.argv.slice(2);
const regionIndex = arguments_.indexOf('--region');
const REGION = regionIndex === -1 ? null : arguments_[regionIndex + 1];
const TARGET = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  REGION && /^[a-z0-9-]+$/.test(REGION) ? `${REGION}-events.ts` : 'local-events.ts',
);
const FORCE = process.argv.includes('--force');

try {
  if (regionIndex !== -1 && (!REGION || regions.getServiceRegion(REGION)?.offlineBundle !== `${REGION}-events.ts`)) {
    throw new Error('Unknown or unconfigured independent offline region');
  }
  for (let i = 0; i < arguments_.length; i++) {
    if (arguments_[i] === '--region') { i++; continue; }
    if (arguments_[i] !== '--force') throw new Error(`Unknown argument: ${arguments_[i]}`);
  }
  const now = Date.now();
  const feeds = JSON.parse(fs.readFileSync(new URL('../data/feeds.json', import.meta.url), 'utf8'));
  const regionalNames = new Set(feeds.filter(feed => feed.serviceRegion === REGION).map(feed => feed.name));
  const independentRegions = new Set(regions.SERVICE_REGIONS.filter(region => region.offlineBundle).map(region => region.id));
  const independentNames = new Set(feeds.filter(feed => independentRegions.has(feed.serviceRegion)).map(feed => feed.name));
  const sources = registry.SOURCES.filter((source) => source.sourceKind !== 'ticketing'
    && (REGION ? regionalNames.has(source.sourceName) : !independentNames.has(source.sourceName)));
  if (!sources.length) throw new Error('No calendars registered for this offline region');
  const result = await sync.syncSources({ sources, dryRun: true, now, log: () => {}, ...(REGION ? { maxRetries: 1, fetchPhaseDeadlineMs: 120000 } : {}) });
  const failed = result.summaries.filter((summary) => summary.status === 'failed').map((summary) => summary.sourceName);
  const skipped = result.summaries.filter((summary) => summary.status === 'skipped').length;
  if (REGION && failed.length) throw new Error(`Regional snapshot incomplete: ${failed.join(', ')}`);
  const records = snapshot.localSnapshot(result.records, now);
  const previous = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
  const { count: previousCount } = core.parseGenerated(previous);
  if (core.shouldRefuseWrite(previousCount, records.length, FORCE)) {
    throw new Error(`Refusing to replace ${previousCount} local events with ${records.length}`);
  }
  fs.writeFileSync(TARGET + '.tmp', core.buildLocalGenerated(records, new Date(now).toISOString(), REGION));
  fs.renameSync(TARGET + '.tmp', TARGET);
  console.log(`Local snapshot: ${result.records.length} records from ${sources.length - failed.length - skipped} of ${sources.length} calendars -> ${records.length} upcoming`);
  if (skipped) console.log(`Skipped ${skipped} calendars; skipped sources do not establish verified coverage.`);
  if (failed.length) console.log(`Not refreshed (kept out of this snapshot): ${failed.join(', ')}`);
} catch (error) {
  console.error(core.formatError(error));
  process.exitCode = 1;
}
