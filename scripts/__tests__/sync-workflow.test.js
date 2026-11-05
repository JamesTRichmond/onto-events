const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '..', '.github', 'workflows', 'sync-events.yml'),
  'utf8',
);

describe('scheduled event synchronization', () => {
  it('runs every other day at 2:00 a.m. Eastern with read-only repository permissions', () => {
    expect(workflow).toContain('cron: "0 6 * * *"');
    expect(workflow).toContain('cron: "0 7 * * *"');
    expect(workflow).toContain('node scripts/pipeline/sync-schedule-gate.js --github-output "$GITHUB_OUTPUT"');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('environment: production');
  });

  it('keeps provider and database admin keys in GitHub secrets', () => {
    expect(workflow).toContain('secrets.TM_KEY');
    expect(workflow).toContain('secrets.SUPABASE_SERVICE_ROLE_KEY');
    expect(workflow).toContain('vars.SUPABASE_URL');
    expect(workflow).not.toMatch(/EXPO_PUBLIC_.*(?:TM_KEY|SERVICE_ROLE)/);
  });

  it('pins production sync to the Otter Creek self-hosted runner', () => {
    expect(workflow).toContain('runs-on: [self-hosted, otter-creek]');
    expect(workflow).not.toMatch(/runs-on:\s*ubuntu-latest/);
  });

  it('offers distinct targeted refreshes that each resolve to one registered source', () => {
    const { SOURCES } = require('../pipeline/sources');
    const optionBlock = workflow.slice(workflow.indexOf('        options:'), workflow.indexOf('\nconcurrency:'));
    const options = [...optionBlock.matchAll(/^\s+- '([^']+)'$/gm)].map((match) => match[1]);
    expect(options[0]).toBe('All sources');
    expect(new Set(options).size).toBe(options.length);
    for (const sourceName of options.slice(1)) {
      expect(SOURCES.filter((source) => source.sourceName === sourceName)).toHaveLength(1);
    }
    expect(workflow).toContain('--source "$ONTO_SYNC_SOURCE"');
    expect(workflow).toContain('cancel-in-progress: false');
  });
});

// The sync entrypoint is an ES module that runs on import, so it is exercised
// as a child process against a local stand-in for the Supabase REST API.
const http = require('node:http');
const { spawn } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'sync-events-to-supabase.mjs');
const FIXTURE = path.join(__dirname, '..', 'pipeline', 'fixtures', 'tm-page.json');
const SERVICE_KEY = 'service-role-secret';

function readBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body === '' ? null : JSON.parse(body)));
  });
}

function fakeSupabase({ rejectRowId, finishError } = {}) {
  const calls = { requests: [], upserts: [], rpc: [] };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const body = await readBody(request);
    // PostgREST reads the schema from accept-profile on reads and
    // content-profile on writes; prefer carries the count and conflict modes.
    const seen = {
      method: request.method,
      path: url.pathname,
      onConflict: url.searchParams.get('on_conflict'),
      acceptProfile: request.headers['accept-profile'] ?? null,
      contentProfile: request.headers['content-profile'] ?? null,
      prefer: request.headers.prefer ?? null,
    };
    calls.requests.push(seen);
    response.setHeader('Connection', 'close');
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && url.pathname === '/rest/v1/events') {
      // Stored ratings of the other sources: none in this stand-in.
      response.writeHead(seen.acceptProfile === 'onto' ? 200 : 400).end('[]');
      return;
    }
    if (request.method === 'HEAD' && url.pathname === '/rest/v1/events') {
      if (seen.acceptProfile !== 'onto' || !seen.prefer?.includes('count=exact')) {
        response.writeHead(400).end();
        return;
      }
      response.setHeader('Content-Range', '*/4');
      response.writeHead(200).end();
      return;
    }
    if (request.method === 'POST' && url.pathname === '/rest/v1/events') {
      calls.upserts.push(body);
      if (
        seen.onConflict !== 'id' ||
        seen.contentProfile !== 'onto' ||
        !seen.prefer?.includes('resolution=merge-duplicates')
      ) {
        response.writeHead(400).end(JSON.stringify({ message: 'bad upsert request shape' }));
        return;
      }
      const rejected = body.length > 1 || body[0].id === rejectRowId;
      if (rejectRowId && rejected) {
        response.writeHead(400).end(
          JSON.stringify({
            code: '23514',
            message: `new row violates check constraint "events_end_after_start" (${SERVICE_KEY})`,
            details: null,
            hint: null,
          }),
        );
        return;
      }
      response.writeHead(201).end();
      return;
    }
    if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/finish_catalog_sync') {
      calls.rpc.push(body);
      if (finishError) {
        response.writeHead(400).end(JSON.stringify(finishError));
        return;
      }
      response.writeHead(200).end('2');
      return;
    }
    response.writeHead(404).end(JSON.stringify({ message: 'unexpected request' }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        calls,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// The child talks to a loopback stand-in, so no proxy inherited from the
// surrounding environment may reroute that traffic.
function loopbackEnv() {
  const env = { ...process.env };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
    delete env[name];
  }
  return { ...env, NO_PROXY: '127.0.0.1,localhost' };
}

function runSync(args, env, fixture = FIXTURE) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, '--source', 'Ticketmaster', '--fixture', fixture, ...args], {
      env: { ...loopbackEnv(), TM_KEY: 'tm-secret', ...env },
    });
    // A hung child must not outlive the test that spawned it.
    const killer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    killer.unref();
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr });
    });
  });
}

describe('sync entrypoint', () => {
  jest.setTimeout(30000);

  it('reports the dry-run summary without touching the database', async () => {
    const { code, stdout } = await runSync(['--dry-run'], {});
    expect(code).toBe(0);
    expect(JSON.parse(stdout.trim().split('\n')[0])).toMatchObject({
      dryRun: true,
      recordCount: 4,
      rejectedCount: 1,
    });
  });

  it('finishes the sync with the latest fetched start time as the horizon', async () => {
    const backend = await fakeSupabase();
    try {
      const { code, stdout } = await runSync([], {
        SUPABASE_URL: backend.url,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      });
      expect(code).toBe(0);
      expect(JSON.parse(stdout.trim().split('\n')[0])).toMatchObject({ sourceName: 'Ticketmaster', status: 'synced', recordCount: 4, rejectedCount: 1, retiredCount: 2 });
      expect(backend.calls.requests).toEqual([
        {
          method: 'GET',
          path: '/rest/v1/events',
          onConflict: null,
          acceptProfile: 'onto',
          contentProfile: null,
          prefer: null,
        },
        {
          method: 'HEAD',
          path: '/rest/v1/events',
          onConflict: null,
          acceptProfile: 'onto',
          contentProfile: null,
          prefer: 'count=exact',
        },
        {
          method: 'POST',
          path: '/rest/v1/events',
          onConflict: 'id',
          acceptProfile: null,
          contentProfile: 'onto',
          prefer: 'resolution=merge-duplicates',
        },
        {
          method: 'POST',
          path: '/rest/v1/rpc/finish_catalog_sync',
          onConflict: null,
          acceptProfile: null,
          contentProfile: 'onto',
          prefer: null,
        },
      ]);
      expect(backend.calls.upserts).toHaveLength(1);
      const latest = backend.calls.upserts[0]
        .map((row) => Date.parse(row.starts_at))
        .reduce((a, b) => Math.max(a, b));
      expect(backend.calls.rpc).toEqual([
        expect.objectContaining({
          p_source_name: 'Ticketmaster',
          p_record_count: 4,
          p_rejected_count: 1,
          p_horizon: new Date(latest).toISOString(),
        }),
      ]);
    } finally {
      await backend.close();
    }
  });

  it('surfaces structured PostgREST errors and redacts secrets', async () => {
    const backend = await fakeSupabase({
      finishError: {
        code: '42501',
        message: `permission denied (${SERVICE_KEY})`,
        details: 'events is not accessible',
        hint: 'Check the service role key',
      },
    });
    try {
      const { code, stderr } = await runSync([], {
        SUPABASE_URL: backend.url,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      });
      expect(code).toBe(1);
      expect(stderr).toContain(
        'permission denied ([SUPABASE_SERVICE_ROLE_KEY]) | events is not accessible | Check the service role key',
      );
      expect(stderr).not.toContain('[object Object]');
      expect(stderr).not.toContain(SERVICE_KEY);
    } finally {
      await backend.close();
    }
  });

  it('finishes a complete snapshot with no horizon so stale listings past it still retire', async () => {
    const completeFixture = path.join(os.tmpdir(), `tm-page-complete-${process.pid}.json`);
    const backend = await fakeSupabase();
    try {
      const complete = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
      complete.page.totalElements = complete._embedded.events.length;
      fs.writeFileSync(completeFixture, JSON.stringify(complete));

      const { code, stdout } = await runSync(
        [],
        { SUPABASE_URL: backend.url, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY },
        completeFixture,
      );
      expect(code).toBe(0);
      expect(JSON.parse(stdout.trim().split('\n')[0])).toMatchObject({ sourceName: 'Ticketmaster', status: 'synced', recordCount: 4, rejectedCount: 1, retiredCount: 2 });
      expect(backend.calls.rpc).toEqual([
        expect.objectContaining({ p_record_count: 4, p_horizon: null }),
      ]);
    } finally {
      await backend.close();
      fs.rmSync(completeFixture, { force: true });
    }
  });

  it('retries a failed batch row by row, skips finish, and fails the run', async () => {
    const backend = await fakeSupabase({ rejectRowId: 'tm-killers-1' });
    try {
      const { code, stdout, stderr } = await runSync([], {
        SUPABASE_URL: backend.url,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      });
      expect(code).toBe(1);
      // One batch of four, then each row on its own.
      expect(backend.calls.upserts.map((rows) => rows.length)).toEqual([4, 1, 1, 1, 1]);
      expect(backend.calls.rpc).toEqual([]);
      const summary = JSON.parse(stdout.trim().split('\n')[0]);
      expect(summary).toMatchObject({
        synced: false,
        recordCount: 4,
        rejectedCount: 1,
        upsertedCount: 3,
        failedCount: 1,
      });
      expect(summary.failures).toEqual([
        { id: 'tm-killers-1', message: expect.stringContaining('events_end_after_start') },
      ]);
      expect(summary.failures[0].message).toContain(
        '"events_end_after_start" ([SUPABASE_SERVICE_ROLE_KEY])',
      );
      expect(summary.failures[0]).not.toHaveProperty('title');
      expect(stdout + stderr).not.toContain(SERVICE_KEY);
      expect(stdout + stderr).not.toContain('tm-secret');
    } finally {
      await backend.close();
    }
  });
});
