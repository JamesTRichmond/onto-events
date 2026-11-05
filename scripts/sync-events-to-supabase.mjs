import { createClient } from '@supabase/supabase-js';
import registry from './pipeline/sources.js';
import sync from './pipeline/sync-sources.js';
import core from './refresh-core.js';
import supply from './pipeline/supply-report.js';

// Secret names belong to adapters; values only exist in this process.
const names = new Set(['SUPABASE_SERVICE_ROLE_KEY', ...registry.SOURCES.flatMap((source) => source.requiredSecrets)]);
const secrets = Object.fromEntries([...names].map((name) => [name, process.env[name]?.trim() ?? '']));

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

try {
  const options = registry.parseArgs(process.argv.slice(2));
  const now = Date.now();
  const result = await sync.syncSources({
    ...options, now, sources: registry.selectSources(options.source), secrets,
    // Workflow timeout is 10 minutes; reserve headroom so completed sources
    // can still upsert and finish before the job deadline.
    fetchPhaseDeadlineMs: optionalPositiveIntEnv('ONTO_SYNC_FETCH_PHASE_DEADLINE_MS', 420000),
    clientFactory: () => createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      db: { schema: 'onto' }, auth: { persistSession: false, autoRefreshToken: false },
    }),
  });
  if (process.env.ONTO_SUPPLY_SNAPSHOT) {
    supply.saveSyncSnapshot(process.env.ONTO_SUPPLY_SNAPSHOT, result, {
      now, evidence: options.fixture ? 'fixture' : 'live',
      redact: (value) => sync.redactAll(value, secrets),
    });
  }
  if (result.totals.failedSources) process.exitCode = 1;
} catch (error) {
  console.error(sync.redactAll(core.formatError(error), secrets));
  process.exitCode = 1;
}
