// Refresh the bundled offline fallback from the production ingestion pipeline.
// Run (Node >=20.6): node --env-file=.env scripts/refresh-events.mjs
// On older Node versions, use: TM_KEY=... node scripts/refresh-events.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import runner from './pipeline/run-ticketmaster.js';
import core from './refresh-core.js';

const TARGET = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'live-events.ts',
);
const FORCE = process.argv.includes('--force');
const REBANNER = process.argv.includes('--rebanner');

function writeAtomic(content) {
  fs.writeFileSync(TARGET + '.tmp', content);
  fs.renameSync(TARGET + '.tmp', TARGET);
}

if (REBANNER) {
  const source = fs.readFileSync(TARGET, 'utf8');
  const records = core.extractRecords(source);
  if (!records) throw new Error('Could not parse data/live-events.ts');
  const { generatedAt } = core.parseGenerated(source);
  writeAtomic(core.buildGenerated(records, generatedAt ?? new Date().toISOString()));
  console.log(`Re-emitted data/live-events.ts with ${records.length} events`);
} else {
  const key = process.env.TM_KEY;
  if (!key) {
    throw new Error(
      'TM_KEY is required; store it in .env or inject it through CI',
    );
  }

  try {
    const result = await runner.fetchTicketmasterRecords({ key });
    const previous = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
    const { count: previousCount } = core.parseGenerated(previous);

    if (core.shouldRefuseWrite(previousCount, result.records.length, FORCE)) {
      throw new Error(
        `Refusing to replace ${previousCount} good events with ${result.records.length}`,
      );
    }

    writeAtomic(core.buildGenerated(result.records, new Date().toISOString()));
    console.log(
      `Pipeline: ${result.rawCount} raw -> ${result.validCount} valid -> ${result.records.length} published`,
    );
  } catch (error) {
    throw new Error(core.redactSecret(core.formatError(error), key));
  }
}
