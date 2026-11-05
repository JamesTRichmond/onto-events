const rows = require('./to-supabase-row');
const core = require('../refresh-core');
const runner = require('./run-source');
const { createPoliteFetch, defaultSleep } = require('./polite-fetch');
const { createSourceRegistry } = require('./source-contract');
const { groupRatings } = require('./dedupe');

function redactAll(message, secrets) {
  return Object.entries(secrets).sort((a, b) => b[1].length - a[1].length).reduce(
    (safe, [name, value]) => {
      for (const form of new Set([value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)])) {
        if (form) safe = core.redactSecret(safe, form, `[${name}]`);
      }
      return safe;
    }, String(message),
  );
}

// Latest starts_at fetched in this run: when the Ticketmaster snapshot was
// capped (see MAX_PAGES) the retire step must not reach past it. A complete
// snapshot passes no horizon so vanished listings past it still retire.
function syncHorizon(eventRows) {
  let latest = null;
  for (const row of eventRows) {
    const startsAt = Date.parse(row.starts_at);
    if (Number.isFinite(startsAt) && (latest === null || startsAt > latest)) {
      latest = startsAt;
    }
  }
  return latest === null ? null : new Date(latest).toISOString();
}

// Transient gateway / transport failures on PostgREST upserts (seen as
// "Gateway Timeout" on Gallivan writes in #97). Constraint and auth errors
// stay non-retryable so one bad row still falls through to row-by-row.
function isRetryableUpsertError(error) {
  const message = String(error?.message ?? error ?? '');
  const code = String(error?.code ?? error?.status ?? error?.statusCode ?? '');
  if (/gateway\s*timeout/i.test(message)) return true;
  if (/service\s*unavailable/i.test(message)) return true;
  if (/\b504\b/.test(message) || code === '504') return true;
  if (/\b503\b/.test(message) || code === '503') return true;
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(message)) return true;
  return false;
}

async function upsertOnce(supabase, batch) {
  const { error } = await supabase.from('events').upsert(batch, { onConflict: 'id' });
  return error ?? null;
}

// Retry only retryable write failures. Permanent errors return on the first
// attempt so the batch→row fallback still isolates a single bad constraint.
async function upsertWithRetry(supabase, batch, {
  sleep = defaultSleep, maxWriteRetries = 3, retryCapMs = 10000,
} = {}) {
  let lastError = null;
  for (let attempt = 0; ; attempt++) {
    lastError = await upsertOnce(supabase, batch);
    if (!lastError) return null;
    if (!isRetryableUpsertError(lastError) || attempt >= maxWriteRetries) return lastError;
    await sleep(Math.min(retryCapMs, 1000 * 2 ** attempt));
  }
}

// Upsert in batches; when a batch fails, retry it row by row so one bad row
// cannot sink the other 99. Transient Gateway Timeout / 5xx writes get a
// bounded backoff before they count as failures. Returns the rows that still
// failed (id and message only, never the payload).
async function upsertRows(supabase, eventRows, options = {}) {
  const failures = [];
  for (let index = 0; index < eventRows.length; index += 100) {
    const batch = eventRows.slice(index, index + 100);
    const batchError = await upsertWithRetry(supabase, batch, options);
    if (!batchError) continue;
    for (const row of batch) {
      const rowError = await upsertWithRetry(supabase, [row], options);
      if (rowError) {
        failures.push({ id: row.id, message: String(rowError.message ?? rowError) });
      }
    }
  }
  return failures;
}

// Current rows of every source, as rating evidence (id, title, start, place,
// rating). Paged: PostgREST caps one response at 1000 rows.
async function storedRatingEvidence(supabase, now) {
  const from = new Date(now - 24 * 3_600_000).toISOString();
  const found = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('events')
      .select('id,source_name,title,venue_name,starts_at,latitude,longitude,rating')
      .eq('is_cancelled', false).gte('starts_at', from)
      .order('id').range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      found.push({ id: row.id, sourceName: row.source_name, title: row.title, venue: row.venue_name ?? undefined,
        startsAtIso: row.starts_at, lat: row.latitude, lng: row.longitude, rating: row.rating });
    }
    if (!data || data.length < 1000) return found;
  }
}

// Keep all mutable state source-local. A partial write must not mark the
// source complete; the next good run can repair it without expiring rows.
async function syncSources({
  sources, secrets = {}, dryRun = false, fixture = false, fixturePath,
  clientFactory, now = Date.now(), log = console.log, logError = console.error,
  maxWriteRetries, fetchPhaseDeadlineMs, ...fetchOptions
}) {
  sources = createSourceRegistry(sources);
  if (fixturePath && sources.length !== 1) throw new Error('A custom fixture requires --source when multiple sources are registered');
  const fetchImpl = createPoliteFetch(fetchOptions);
  const writeOptions = {
    sleep: fetchOptions.sleep,
    maxWriteRetries,
    retryCapMs: fetchOptions.retryCapMs,
  };
  let supabase;
  const summaries = [];
  const records = [];
  const results = [];
  // Fetch every source first, concurrently (politeFetch still queues each
  // host), so a happening two sources list can carry the strictest rating
  // any of them gave it before any row is written.
  const entries = sources.map((adapter) => ({
    adapter, result: null, error: null, skip: null, settled: false, sealed: false,
  }));
  const pending = new Set();
  for (const entry of entries) {
    const task = (async () => {
      try {
        const missing = entry.adapter.requiredSecrets.filter((name) => !secrets[name]);
        if (!fixture && missing.length) {
          if (!entry.sealed) entry.skip = `skipped: no key (${missing.join(', ')})`;
        } else if (!entry.sealed) {
          entry.result = fixture
            ? runner.readSourceFixture(entry.adapter, fixturePath ?? entry.adapter.fixturePath, { now })
            : await runner.fetchSourceRecords(entry.adapter, {
              ...fetchOptions, now,
              secrets: Object.freeze(Object.fromEntries(entry.adapter.requiredSecrets.map((name) => [name, secrets[name]]))),
              politeFetch: fetchImpl,
            });
        }
      } catch (error) {
        if (!entry.sealed) entry.error = error;
      } finally {
        if (!entry.sealed) entry.settled = true;
      }
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  }
  if (Number.isFinite(fetchPhaseDeadlineMs) && fetchPhaseDeadlineMs > 0) {
    const deadlineAt = Date.now() + fetchPhaseDeadlineMs;
    while (pending.size && Date.now() < deadlineAt) {
      const remainingMs = deadlineAt - Date.now();
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(resolve, Math.max(1, remainingMs));
      });
      await Promise.race([Promise.race([...pending]), timeout]);
      clearTimeout(timer);
    }
    if (pending.size) {
      const finished = entries.filter((entry) => entry.settled).length;
      for (const entry of entries) {
        if (entry.settled) continue;
        entry.sealed = true;
        entry.settled = true;
        entry.error = new Error(
          `Fetch phase deadline reached after ${Math.round(fetchPhaseDeadlineMs / 1000)}s; writing ${finished} completed sources before timeout`,
        );
      }
    }
  } else {
    await Promise.all([...pending]);
  }
  const fetched = entries.filter((e) => e.result && !e.result.skipReason);
  const evidence = fetched.flatMap((e) => e.result.ratingEvidence ?? e.result.records);
  const writing = !dryRun && fetched.length > 0;
  if (writing) {
    // A run that fetched only some sources (--source, a failed feed) still
    // honours the ratings the other sources' stored rows carry, so a partial
    // sync never lowers what a full sync raised. When only one source fetched,
    // keep that source's stored rows for rewritten ids as a rating floor too.
    // No evidence, no writes.
    try {
      supabase ??= clientFactory();
      const mine = new Set(fetched.map((e) => e.adapter.sourceName.toLowerCase()));
      const stored = await storedRatingEvidence(supabase, now);
      evidence.push(...stored.filter((r) => !mine.has(String(r.sourceName ?? '').toLowerCase())));
      if (fetched.length === 1) {
        const rewritten = new Set((fetched[0].result.records ?? []).map((r) => r.id));
        evidence.push(...stored.filter((r) => mine.has(String(r.sourceName ?? '').toLowerCase()) && rewritten.has(r.id)));
      }
    } catch (error) {
      for (const entry of fetched) { entry.error = error; entry.result = null; }
    }
  }
  // Every copy in a linked group takes the group's rating, including a copy
  // that this source's own dedupe merged after the evidence was read.
  const carried = groupRatings(evidence);
  const severity = { family: 0, general: 1, mature: 2 };
  for (const entry of entries) {
    if (!entry.result || carried.size === 0) continue;
    let raisedCount = 0;
    let allAgesCount = 0;
    const recs = entry.result.records.map((r) => {
      const rating = carried.get(r.id);
      // Evidence is read before dedupe; a merged copy may already agree.
      if (!rating || rating === r.rating) return r;
      if (severity[rating] > severity[r.rating]) raisedCount += 1;
      else allAgesCount += 1;
      return { ...r, rating };
    });
    if (raisedCount || allAgesCount) entry.result = { ...entry.result, records: recs,
      diagnostics: { ...(entry.result.diagnostics ?? {}),
        ...(raisedCount ? { 'rating raised by another source': raisedCount } : {}),
        ...(allAgesCount ? { "venue's All Ages over a default": allAgesCount } : {}) } };
  }
  for (const { adapter, result, error, skip } of entries) {
    const summary = { sourceName: adapter.sourceName, dryRun, recordCount: 0, rejectedCount: 0 };
    try {
      if (error) throw error;
      if (skip) {
        summary.status = 'skipped';
        summary.reason = skip;
      } else {
        const { ratingEvidence: _evidence, ...kept } = result;
        results.push({ sourceName: adapter.sourceName, ...kept });
        records.push(...result.records);
        const completedAt = new Date(now).toISOString();
        const eventRows = result.records.map((record) => rows.toSupabaseRow(record, completedAt));
        summary.recordCount = eventRows.length;
        summary.rejectedCount = result.rejectedCount;
        summary.skipped = result.skipped;
        summary.unmapped = result.unmapped;
        summary.diagnostics = result.diagnostics ?? {};
        summary.status = 'dry-run';
        if (result.skipReason) {
          summary.status = 'skipped';
          summary.reason = result.skipReason;
        } else if (!dryRun) {
          supabase ??= clientFactory();
          const { count: previousCount, error: countError } = await supabase
            .from('events').select('id', { count: 'exact', head: true })
            .eq('source_name', adapter.sourceName).eq('is_cancelled', false).gte('starts_at', completedAt);
          if (countError) throw countError;
          // Retained rows and a rolling recent-post window are not comparable
          // counts, so retirement-free sources waive the ratio test only. An
          // empty fetch is still refused whenever the source has rows to lose.
          if (core.shouldRefuseWrite(previousCount ?? 0, eventRows.length, false, { ratio: result.retireMissing !== false })) {
            throw new Error(`Refusing suspicious catalog shrink from ${previousCount ?? 0} to ${eventRows.length}`);
          }
          const failures = await upsertRows(supabase, eventRows, writeOptions);
          Object.assign(summary, { synced: false, upsertedCount: eventRows.length - failures.length, failedCount: failures.length });
          if (failures.length) {
            summary.status = 'failed';
            summary.failures = failures.slice(0, 10);
          } else {
            const { data: retiredCount, error: finishError } = await supabase.rpc('finish_catalog_sync', {
              p_source_name: adapter.sourceName, p_completed_at: completedAt,
              p_record_count: eventRows.length, p_rejected_count: result.rejectedCount,
              // PostgreSQL's -infinity makes starts_at < horizon false even
              // for ongoing events. Rolling feeds cannot prove deletion.
              p_horizon: result.retireMissing === false ? '-infinity'
                : result.truncated ? (result.horizon ?? syncHorizon(eventRows)) : null,
            });
            if (finishError) throw finishError;
            Object.assign(summary, { status: 'synced', synced: true, retiredCount: retiredCount ?? 0 });
          }
        }
      }
    } catch (error) {
      Object.assign(summary, { status: 'failed', synced: false });
      summary.error = core.formatError(error);
      logError(redactAll(`${adapter.sourceName}: ${summary.error}`, secrets));
    }
    // Sanitize before returning too, so callers cannot accidentally re-log a key.
    const safe = JSON.parse(redactAll(JSON.stringify(summary), secrets));
    summaries.push(safe);
    log(JSON.stringify(safe));
  }
  const totals = {
    total: true, dryRun, sourceCount: sources.length,
    syncedSources: summaries.filter((s) => s.status === 'synced').length,
    failedSources: summaries.filter((s) => s.status === 'failed').length,
    skippedSources: summaries.filter((s) => s.status === 'skipped').length,
    recordCount: summaries.reduce((n, s) => n + s.recordCount, 0),
    rejectedCount: summaries.reduce((n, s) => n + s.rejectedCount, 0),
    upsertedCount: summaries.reduce((n, s) => n + (s.upsertedCount ?? 0), 0),
  };
  log(JSON.stringify(totals));
  return { summaries, totals, records, results };
}

module.exports = {
  syncSources, upsertRows, upsertWithRetry, syncHorizon, redactAll, isRetryableUpsertError,
};
