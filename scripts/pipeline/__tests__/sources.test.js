const fs = require('node:fs');
const path = require('node:path');
const tm = require('../adapters/ticketmaster');
const schema = require('../schema');
const { SOURCES, selectSources, parseArgs, calendarAdapters } = require('../sources');
const { validateRegistries } = require('../registry-validation');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const runner = require('../run-source');
const { syncSources, redactAll } = require('../sync-sources');
const { createSourceRegistry } = require('../source-contract');

const page = JSON.parse(fs.readFileSync(tm.fixturePath, 'utf8'));
const base = tm.normalize(page._embedded.events.find((item) => item.id === 'killers-1'));
const now = Date.parse('2026-09-01T00:00:00Z');

function source(name, options = {}) {
  return {
    sourceName: name, idPrefix: `${name}-`, requiredSecrets: [], fixturePath: tm.fixturePath,
    fetch: async () => ({ items: [base], truncated: false }),
    normalize: (raw) => ({ ...raw, id: `${name}-${raw.id}`, sourceName: name }),
    ...options,
  };
}

function database({ counts = {}, countError, reject, finishError, stored = [], storedError } = {}) {
  const calls = { counts: [], upserts: [], finishes: [], reads: 0 };
  const client = {
    from: () => ({
      select: (columns, options) => {
        if (!options?.head) {
          const read = { eq: () => read, gte: () => read, order: () => read, range: async (a, b) => {
            calls.reads += 1;
            return storedError ? { data: null, error: { message: 'read denied' } } : { data: stored.slice(a, b + 1), error: null };
          } };
          return read;
        }
        let sourceName;
        const filters = [];
        const query = {
          eq: (field, value) => {
            filters.push([field, value]);
            if (field === 'source_name') sourceName = value;
            return query;
          },
          gte: (field, value) => {
            calls.counts.push({ sourceName, filters, field, value });
            return Promise.resolve({ count: counts[sourceName] ?? 1, error: sourceName === countError ? { message: 'count denied' } : null });
          },
        };
        return query;
      },
      upsert: async (rows) => {
        calls.upserts.push(rows);
        return { error: reject?.(rows) ? { message: 'rejected secret-value' } : null };
      },
    }),
    rpc: async (name, args) => {
      calls.finishes.push({ name, args });
      return { data: 2, error: args.p_source_name === finishError ? { message: 'finish denied' } : null };
    },
  };
  return { calls, client };
}

async function run(sources, options = {}) {
  return syncSources({ sources, now, log: jest.fn(), logError: jest.fn(), fetchImpl: jest.fn(), ...options });
}

it('locks all fourteen categories to the applied database enum', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20260902000001_core.sql'), 'utf8');
  const definition = sql.match(/create type onto\.event_category as enum\s*\(([\s\S]*?)\)/i)[1];
  const categories = [...definition.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  expect(categories).toHaveLength(14);
  expect([...schema.CATEGORIES].sort()).toEqual(categories.sort());
});

it('registers an ordered adapter contract and selects one source without fallback', () => {
  for (const adapter of SOURCES) {
    expect(adapter.sourceName).toEqual(expect.any(String));
    expect(adapter.requiredSecrets).toEqual(expect.any(Array));
    expect(adapter.fetch).toEqual(expect.any(Function));
    expect(adapter.normalize).toEqual(expect.any(Function));
    expect(fs.existsSync(adapter.fixturePath)).toBe(true);
  }
  expect(selectSources('ticketmaster')).toEqual([tm]);
  expect(() => selectSources('typo')).toThrow('Unknown source');
  expect(parseArgs(['--source', 'Ticketmaster', '--fixture', '--dry-run'])).toEqual({ source: 'Ticketmaster', fixture: true, fixturePath: null, dryRun: true });
  expect(parseArgs(['--fixture', 'path.json']).fixturePath).toBe('path.json');
  expect(() => parseArgs(['--source'])).toThrow('Invalid argument');
  expect(() => parseArgs(['--force'])).toThrow('Invalid argument');
});

it('preserves Ticketmaster fixture rows, rejects, cap and pagination completeness', () => {
  const result = runner.readSourceFixture(tm);
  expect(result.records).toHaveLength(4);
  expect(result.rejectedCount).toBe(1);
  expect(result.truncated).toBe(true);
  expect(result.records.map((r) => r.id)).toEqual(['tm-comedy-1', 'tm-killers-1', 'tm-disney-ice-1', 'tm-wendover-casino-1']);
  expect(runner.processSourceItems(tm, tm.snapshotFromPages([page]), { overrides: { 'tm-killers-1': 'mature' } }).records.find((r) => r.id === 'tm-killers-1').rating).toBe('mature');
});

it('passes the injected clock and counts adapter skip reasons', () => {
  const adapter = source('calendar', { normalize: (raw, context) => {
    expect(context.now).toBe(now);
    context.skip('unmapped venue');
    return null;
  } });
  expect(runner.processSourceItems(adapter, [base], { now }).skipped).toEqual({ 'unmapped venue': 1 });
  expect(() => runner.processSourceItems(source('calendar', { normalize: (raw) => raw }), [base])).toThrow('identity');
});

it('skips absent secrets without fetching, initializing the database or failing', async () => {
  const fetch = jest.fn();
  const clientFactory = jest.fn();
  const result = await run([source('locked', { requiredSecrets: ['CAL_KEY'], fetch })], { clientFactory });
  expect(result.summaries[0]).toMatchObject({ status: 'skipped', reason: 'skipped: no key (CAL_KEY)' });
  expect(result.totals.failedSources).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(clientFactory).not.toHaveBeenCalled();
});

it('runs registered fixtures without provider keys, network or database access', async () => {
  const clientFactory = jest.fn();
  const result = await run([tm], { fixture: true, dryRun: true, clientFactory });
  expect(result.totals).toMatchObject({ recordCount: 4, failedSources: 0 });
  expect(clientFactory).not.toHaveBeenCalled();
  await expect(run([tm, source('other')], { fixture: true, fixturePath: tm.fixturePath })).rejects.toThrow('requires --source');
});

it.each(['fetch', 'normalize', 'count', 'shrink', 'upsert', 'finish'])('isolates a %s failure and still completes the next source', async (stage) => {
  const bad = source('bad');
  if (stage === 'fetch') bad.fetch = async () => { throw new Error('fetch denied'); };
  if (stage === 'normalize') bad.normalize = () => { throw new Error('parse denied'); };
  const db = database({
    countError: stage === 'count' ? 'bad' : null,
    counts: { bad: stage === 'shrink' ? 20 : 1 },
    reject: (rows) => stage === 'upsert' && rows[0].source_name === 'bad',
    finishError: stage === 'finish' ? 'bad' : null,
  });
  const result = await run([bad, source('good')], { clientFactory: () => db.client, secrets: { CAL_KEY: 'secret-value' } });
  expect(result.totals).toMatchObject({ failedSources: 1, syncedSources: 1 });
  expect(result.summaries[1]).toMatchObject({ sourceName: 'good', status: 'synced' });
  expect(db.calls.finishes.map((c) => c.args.p_source_name)).toEqual(stage === 'finish' ? ['bad', 'good'] : ['good']);
  expect(JSON.stringify(result.summaries)).not.toContain('secret-value');
});

it('counts and retires only the owning source, with separate snapshot horizons', async () => {
  const db = database();
  const result = await run([source('first', { fetch: async () => ({ items: [base], truncated: true }) }), source('second')], { clientFactory: () => db.client });
  expect(result.totals).toMatchObject({ syncedSources: 2, recordCount: 2, upsertedCount: 2 });
  expect(db.calls.counts.map((c) => c.filters)).toEqual([
    [['source_name', 'first'], ['is_cancelled', false]],
    [['source_name', 'second'], ['is_cancelled', false]],
  ]);
  expect(db.calls.finishes.map((c) => [c.args.p_source_name, c.args.p_horizon])).toEqual([
    ['first', new Date(base.startsAtIso).toISOString()], ['second', null],
  ]);
});

it('refuses zero snapshots without retiring existing supply', async () => {
  const db = database();
  const result = await run([source('empty', { fetch: async () => [] })], { clientFactory: () => db.client });
  expect(result.totals.failedSources).toBe(1);
  expect(db.calls.upserts).toEqual([]);
  expect(db.calls.finishes).toEqual([]);
});

it('never retires absent future or ongoing listings from a rolling feed', async () => {
  const db = database();
  await run([source('rolling', { fetch: async () => ({ items: [base], retireMissing: false }) })], { clientFactory: () => db.client });
  expect(db.calls.finishes[0].args.p_horizon).toBe('-infinity');
  // This is the existing RPC predicate: ongoing events may start before now,
  // so using now as the horizon would incorrectly retire a still-running show.
  const sql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20260903000001_sync_horizon.sql'), 'utf8');
  expect(sql).toContain('starts_at < p_horizon');
});

it('logs an ineligible feed as skipped without touching the database', async () => {
  const clientFactory = jest.fn();
  const result = await run([source('news', { fetch: async () => ({ items: [], skipReason: 'no structured event dates' }) })], { clientFactory });
  expect(result.summaries[0]).toMatchObject({ status: 'skipped', reason: 'no structured event dates' });
  expect(clientFactory).not.toHaveBeenCalled();
});

it('accepts a nonempty rolling window against a larger retained catalog while still refusing zero', async () => {
  const db = database({ counts: { rolling: 100 } });
  const rolling = source('rolling', { fetch: async () => ({ items: [base], retireMissing: false }) });
  const result = await run([rolling], { clientFactory: () => db.client });
  expect(result.summaries[0].status).toBe('synced');
  expect(db.calls.upserts).toHaveLength(1);
  expect(db.calls.finishes[0].args.p_horizon).toBe('-infinity');
  const empty = await run([{ ...rolling, fetch: async () => ({ items: [], retireMissing: false }) }], { clientFactory: () => db.client });
  expect(empty.summaries[0].status).toBe('failed');
});

it('syncs a source whose catalog is already empty and whose listings all skip', async () => {
  const db = database({ counts: { quiet: 0 } });
  const quiet = source('quiet', { fetch: async () => ({ items: [], truncated: true }) });
  const result = await run([quiet], { clientFactory: () => db.client });
  expect(result.summaries[0]).toMatchObject({ status: 'synced', recordCount: 0, upsertedCount: 0 });
  expect(result.totals.failedSources).toBe(0);
  // An empty fetch over rows that do exist is still the wipe the guard exists for.
  const stocked = await run([quiet], { clientFactory: () => database({ counts: { quiet: 40 } }).client });
  expect(stocked.summaries[0]).toMatchObject({ status: 'failed', error: 'Refusing suspicious catalog shrink from 40 to 0' });
});

it('writes completed sources when the fetch phase deadline expires on a stalled source', async () => {
  const db = database();
  const stalled = source('stalled', { fetch: async () => new Promise(() => {}) });
  const ready = source('ready');
  const result = await run([ready, stalled], { clientFactory: () => db.client, fetchPhaseDeadlineMs: 50 });
  expect(result.totals).toMatchObject({ syncedSources: 1, failedSources: 1 });
  expect(result.summaries.find((summary) => summary.sourceName === 'ready')).toMatchObject({ status: 'synced' });
  expect(result.summaries.find((summary) => summary.sourceName === 'stalled')).toMatchObject({ status: 'failed' });
  expect(result.summaries.find((summary) => summary.sourceName === 'stalled').error).toContain('Fetch phase deadline reached');
  expect(db.calls.upserts).toHaveLength(1);
  expect(db.calls.finishes).toHaveLength(1);
});

it('reports a paused feed as skipped with its reason and never fetches or writes', async () => {
  const clientFactory = jest.fn();
  const fetchImpl = jest.fn();
  // Pause contract is covered by a synthetic feed so production Gallivan can stay live.
  const pausedFeed = {
    id: 'synthetic-paused',
    name: 'Synthetic Paused Feed',
    kind: 'ics',
    sourceKind: 'community',
    timezone: 'America/Denver',
    url: 'https://example.test/events/?ical=1',
    defaultCategory: 'community',
    defaultRating: 'general',
    venueHint: null,
    termsUrl: 'https://example.test/',
    termsCheckedOn: '2026-09-09',
    notes: 'Synthetic pause-contract feed for tests only.',
    pausedReason: 'Export answered 403 to the onto sync agent on 2026-09-09 (test fixture).',
    fixturePath: 'scripts/pipeline/fixtures/ics/gallivan-center.ics',
  };
  const [paused] = calendarAdapters([pausedFeed], venues);
  const result = await run([paused], { clientFactory, fetchImpl });
  expect(result.summaries[0]).toMatchObject({
    status: 'skipped',
    reason: `paused: ${pausedFeed.pausedReason}`,
    recordCount: 0,
  });
  expect(result.totals.failedSources).toBe(0);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(clientFactory).not.toHaveBeenCalled();
});

it('keeps Gallivan live after verified ICS download and still registers it', () => {
  const gallivan = feeds.find((feed) => feed.id === 'gallivan-center');
  expect(gallivan.pausedReason).toBeUndefined();
  expect(SOURCES.some((s) => s.sourceName === gallivan.name)).toBe(true);
  expect(validateRegistries([{ ...gallivan, pausedReason: '  ' }], venues)).toContain('Invalid feed: gallivan-center');
});

it('keeps remaining Path A ICS live and registered', () => {
  for (const id of ['clark-planetarium', 'slco-parks-recreation']) {
    const feed = feeds.find((entry) => entry.id === id);
    expect(feed).toBeDefined();
    expect(feed.pausedReason).toBeUndefined();
    expect(SOURCES.some((source) => source.sourceName === feed.name)).toBe(true);
  }
});

it('validates and registers only fully specified Simple Calendar feeds', () => {
  const gallivan = feeds.find((feed) => feed.id === 'gallivan-center');
  const simcal = { ...gallivan, kind: 'simcal', calendarId: '1726', publicTitles: ['Public worship'] };
  expect(validateRegistries([simcal], venues)).toEqual([]);
  const [adapter] = calendarAdapters([simcal], venues);
  expect(adapter.idPrefix).toBe('simcal-gallivan-center-');
  expect(adapter.fixturePath).toBe(path.resolve(__dirname, '../../..', simcal.fixturePath));
  expect(validateRegistries([{ ...simcal, calendarId: '0' }], venues)).toContain('Invalid feed: gallivan-center');
  expect(validateRegistries([{ ...simcal, publicTitles: ['Public worship', 'Public worship'] }], venues)).toContain('Invalid feed: gallivan-center');
  expect(validateRegistries([{ ...simcal, kind: 'ics' }], venues)).toContain('Invalid feed: gallivan-center');
});

it('redacts registered secrets in raw, encoded and JSON-escaped errors', () => {
  const secret = 's/e"c';
  for (const form of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) {
    expect(redactAll(form, { NEW_KEY: secret })).toBe('[NEW_KEY]');
  }
});

it('snapshots registration without mutating adapters or sharing mutable secret declarations', () => {
  const adapter = source('example', { requiredSecrets: ['EXAMPLE_KEY'] });
  const registered = createSourceRegistry([adapter]);
  adapter.sourceName = 'changed';
  adapter.requiredSecrets.push('OTHER_KEY');
  expect(registered[0].sourceName).toBe('example');
  expect(registered[0].requiredSecrets).toEqual(['EXAMPLE_KEY']);
  expect(Object.isFrozen(registered)).toBe(true);
  expect(Object.isFrozen(registered[0])).toBe(true);
  expect(Object.isFrozen(registered[0].requiredSecrets)).toBe(true);
});

it.each([
  [source('same'), source('SAME', { idPrefix: 'different-' })],
  [source('first'), source('second', { idPrefix: 'first-child-' })],
  [source('first', { fetch: null })],
])('rejects ambiguous or invalid registration before any effects', async (...sources) => {
  const clientFactory = jest.fn();
  const fetchImpl = jest.fn();
  await expect(run(sources, { clientFactory, fetchImpl })).rejects.toThrow();
  expect(clientFactory).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('rejects a module emitting another namespace even with its own source name', async () => {
  const bad = source('bad', { normalize: (raw) => ({ ...raw, sourceName: 'bad' }) });
  const db = database();
  const result = await run([bad, source('good')], { clientFactory: () => db.client });
  expect(result.summaries[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('prefix') });
  expect(result.summaries[1].status).toBe('synced');
  expect(db.calls.upserts.flat().every((row) => row.source_name === 'good')).toBe(true);
  expect(db.calls.finishes.map((call) => call.args.p_source_name)).toEqual(['good']);
});

it('gives adapters only their declared secrets', async () => {
  const fetch = jest.fn(async () => [base]);
  await run([source('example', { requiredSecrets: ['EXAMPLE_KEY'], fetch })], {
    dryRun: true, secrets: { EXAMPLE_KEY: 'example-value', OTHER_KEY: 'unrelated-value' },
  });
  expect(fetch.mock.calls[0][0].secrets).toEqual({ EXAMPLE_KEY: 'example-value' });
  expect(Object.isFrozen(fetch.mock.calls[0][0].secrets)).toBe(true);
});

it('removes a source without fetching it, deleting its records or changing its neighbor', async () => {
  const removed = source('removed', { fetch: jest.fn(async () => [base]) });
  const kept = source('kept');
  const together = await run([removed, kept], { dryRun: true });
  removed.fetch.mockClear();
  const db = database();
  const alone = await run([kept], { clientFactory: () => db.client });
  expect(removed.fetch).not.toHaveBeenCalled();
  expect(alone.records).toEqual(together.records.filter((record) => record.sourceName === 'kept'));
  expect(db.calls.counts.map((call) => call.sourceName)).toEqual(['kept']);
  expect(db.calls.upserts.flat().every((row) => row.source_name === 'kept')).toBe(true);
  expect(db.calls.finishes.map((call) => call.args.p_source_name)).toEqual(['kept']);
});

it('never lowers a rating another source stored, even when syncing one source', async () => {
  const stored = [{ id: 'other-1', source_name: 'other', title: base.title, starts_at: base.startsAtIso,
    latitude: base.lat, longitude: base.lng, rating: 'mature' }];
  const db = database({ stored });
  await run([source('one')], { clientFactory: () => db.client });
  expect(db.calls.reads).toBe(1);
  expect(db.calls.upserts.flat().map((row) => row.rating)).toEqual(['mature']);
});

it('keeps a single-source write from lowering its own previously carried rating', async () => {
  const stored = [{ id: `one-${base.id}`, source_name: 'one', title: base.title, starts_at: base.startsAtIso,
    latitude: base.lat, longitude: base.lng, rating: 'mature' }];
  const db = database({ stored });
  await run([source('one')], { clientFactory: () => db.client });
  expect(db.calls.reads).toBe(1);
  expect(db.calls.upserts.flat().map((row) => row.rating)).toEqual(['mature']);
});

it('writes nothing when the stored ratings cannot be read', async () => {
  const db = database({ storedError: true });
  const result = await run([source('one')], { clientFactory: () => db.client });
  expect(db.calls.upserts).toEqual([]);
  expect(result.summaries[0].status).toBe('failed');
});

it("lets a venue's own All Ages set the aggregator's default copy and says so", async () => {
  const copy = (name, kind, rating, ratingBasis) => source(name, {
    sourceKind: kind,
    fetch: async () => ({ items: [{ ...base, sourceKind: kind, rating, ratingBasis }], truncated: false }),
  });
  const log = jest.fn();
  const result = await syncSources({ sources: [copy('venue', 'community', 'general', 'all-ages'), copy('agg', 'aggregator', 'mature', 'venue-default')],
    now, dryRun: true, log, logError: jest.fn(), fetchImpl: jest.fn() });
  expect(Object.fromEntries(result.records.map((record) => [record.sourceName, record.rating]))).toEqual({ venue: 'general', agg: 'general' });
  const summary = log.mock.calls.map(([line]) => (typeof line === 'string' ? JSON.parse(line) : line)).find((entry) => entry.sourceName === 'agg');
  expect(summary.diagnostics).toEqual({ "venue's All Ages over a default": 1 });
});

it('gives the group rating to a copy its own source merged after the evidence was read', async () => {
  const venueSource = source('venue', { sourceKind: 'community',
    fetch: async () => ({ items: [{ ...base, sourceKind: 'community', rating: 'general', ratingBasis: 'all-ages' }], truncated: false }) });
  // The aggregator lists the show twice; its dedupe keeps one copy and the merge makes it mature.
  const twice = source('agg', { sourceKind: 'aggregator',
    fetch: async () => ({ items: [
      { ...base, id: 'a', sourceKind: 'aggregator', rating: 'general', ratingBasis: 'all-ages', description: 'All ages, a longer description wins the merge.' },
      { ...base, id: 'b', sourceKind: 'aggregator', rating: 'mature', ratingBasis: 'venue-default' },
    ], truncated: false }) });
  const result = await syncSources({ sources: [venueSource, twice], now, dryRun: true, log: jest.fn(), logError: jest.fn(), fetchImpl: jest.fn() });
  expect(result.records.filter((record) => record.sourceName === 'agg').map((record) => record.rating)).toEqual(['general']);
});
