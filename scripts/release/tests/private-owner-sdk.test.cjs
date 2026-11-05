// Real SDK transports, synthetic sessions and intercepted HTTP only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '../../..');
const privateSource = path.join(root, 'lib/backend/supabase-backend.ts');
const loaded = new Map();
function loadSource(file) {
  file = ['', '.ts', '.tsx', '.js', '.json'].map((ext) => file + ext).find((item) => fs.existsSync(item) && fs.statSync(item).isFile());
  if (!file) throw new Error('Missing local source');
  if (!/\.tsx?$/.test(file)) return require(file);
  if (loaded.has(file)) return loaded.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  loaded.set(file, mod);
  const nativeRequire = mod.require.bind(mod);
  mod.require = (id) => id.startsWith('@/') ? loadSource(path.join(root, id.slice(2)))
    : id.startsWith('.') ? loadSource(path.resolve(path.dirname(file), id)) : nativeRequire(id);
  // Local RED replay can supply the pre-fix source while imports and the SDK
  // still come from this checkout. Normal CI always loads current source.
  const source = file === privateSource && process.env.ONTO_PRIVATE_OWNER_BASELINE
    ? process.env.ONTO_PRIVATE_OWNER_BASELINE : file;
  mod._compile(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, file);
  return mod.exports;
}
const { SupabaseOntoBackend } = loadSource(path.join(root, 'lib/backend/supabase-backend.ts'));
const { createAccountTokenVerifier } = loadSource(path.join(root, 'lib/backend/account-token-verifier.ts'));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const token = (id) => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  Buffer.from('synthetic-not-a-signature').toString('base64url')].join('.');
const subject = (bearer) => JSON.parse(Buffer.from(bearer.split(' ')[1].split('.')[1], 'base64url').toString()).sub;
const user = (id) => ({ id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid',
  app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-10-09T00:00:00Z' });
const raceError = (error) => ['conflict', 'forbidden', 'not-authenticated'].includes(error?.code);

function fixture() {
  const values = new Map();
  const sent = [];
  let heldWrite = null;
  let heldVerification = null;
  let visibleOwner = null;
  let rejectedToken = null;
  let missingSession = false;
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
      if (heldWrite && JSON.parse(value).user?.id === B) {
        heldWrite.entered.resolve();
        await heldWrite.release.promise;
      }
    },
    removeItem: async (key) => { values.delete(key); },
  };
  const requestFetch = async (url, init) => {
      const headers = new Headers(init.headers);
      const authorization = headers.get('Authorization');
      if (String(url).includes('/auth/v1/user')) {
        const owner = subject(authorization);
        if (heldVerification && owner === A) {
          heldVerification.entered.resolve();
          await heldVerification.release.promise;
        }
        return new Response(JSON.stringify(owner === rejectedToken ? { message: 'Session revoked',
          ...(missingSession ? { error_code: 'session_not_found' } : {}) } : user(owner)), {
          status: owner === rejectedToken ? 401 : 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!String(url).includes('/rest/v1/')) throw new Error('Unexpected endpoint; no live network is allowed');
      const owner = authorization?.startsWith('Bearer ey') ? subject(authorization) : null;
      const rpc = String(url).split('/rpc/')[1] ?? null;
      sent.push({ owner, rpc, method: init.method, url: String(url), body: init.body ? JSON.parse(init.body) : null });
      const body = init.body ? JSON.parse(init.body) : null;
      const response = String(url).includes('/profiles') ? {
        user_id: owner, display_name: body?.display_name ?? 'Existing name', age_gate_confirmed: false,
        is_discoverable: false, created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
      } : String(url).includes('/event_rsvps') && init.method === 'POST' ? {
        ...body, created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
      } : init.method === 'GET' ? [] : null;
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = createClient('https://onto-sdk-fixture.invalid', 'sb_publishable_synthetic_fixture_only', {
    db: { schema: 'onto' }, auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, storage },
    global: { fetch: requestFetch },
  });
  const subscription = client.auth.onAuthStateChange((_event, session) => { visibleOwner = session?.user?.id ?? null; }).data.subscription;
  return {
    client, values, sent, verifyToken: createAccountTokenVerifier({
      url: 'https://onto-sdk-fixture.invalid', publishableKey: 'sb_publishable_synthetic_fixture_only',
    }, requestFetch),
    visibleOwner: () => visibleOwner,
    install: async (id) => {
      const result = await client.auth.setSession({ access_token: token(id), refresh_token: 'synthetic-refresh' });
      assert.equal(result.error, null);
      assert.equal(result.data.session.user.id, id);
    },
    holdWrite: () => { heldWrite = { entered: deferred(), release: deferred() }; return heldWrite; },
    holdVerification: () => { heldVerification = { entered: deferred(), release: deferred() }; return heldVerification; },
    rejectToken: (id, missing = false) => { rejectedToken = id; missingSession = missing; },
    close: async () => {
      heldWrite?.release.resolve(); heldVerification?.release.resolve();
      subscription.unsubscribe();
      await client.auth.stopAutoRefresh();
    },
  };
}

const mutations = [
  ['profile update', (b) => b.updateMyProfile({ displayName: 'Name entered on A' })],
  ['Going set', (b) => b.setRsvp({ eventId: ID, status: 'going' })],
  ['Going remove', (b) => b.removeRsvp(ID)],
];
const privateActions = [
  ...mutations,
  ['profile read', (b) => b.getMyProfile()],
  ['Going list', (b) => b.listMyRsvps()],
  ['Going history', (b) => b.listMyRsvpHistory()],
];
const bound = (f, owner = A) => new SupabaseOntoBackend(f.client, undefined, owner, f.verifyToken);
for (const [name, operation] of mutations) {
  test(`real SDK: ${name} cannot dispatch as B while its initiating screen displays A`, { timeout: 10000 }, async () => {
    const f = fixture();
    try {
      await f.install(A);
      const backend = bound(f);
      const hold = f.holdWrite();
      const switching = f.install(B);
      await hold.entered.promise;
      assert.equal(f.visibleOwner(), A);
      await assert.rejects(operation(backend), raceError);
      assert.deepEqual(f.sent, []);
      assert.equal(f.visibleOwner(), A);
      hold.release.resolve();
      await switching;
    } finally { await f.close(); }
  });
}
for (const [name, operation] of [...privateActions, ['empty profile edit', (b) => b.updateMyProfile({})]]) {
  test(`real SDK: ${name} retains the verified A bearer and target after the SDK changes to B`, { timeout: 10000 }, async () => {
    const f = fixture();
    try {
      await f.install(A);
      const backend = bound(f);
      const hold = f.holdVerification();
      const action = operation(backend);
      const phase = await Promise.race([hold.entered.promise.then(() => 'verifying'), action.then(() => 'already-dispatched')]);
      assert.equal(phase, 'verifying');
      await f.install(B);
      hold.release.resolve();
      await action;
      assert.equal(f.sent.length, 1);
      const request = f.sent[0];
      assert.equal(request.owner, A);
      if (request.body?.user_id) assert.equal(request.body.user_id, A);
      const filter = new URL(request.url).searchParams.get('user_id');
      if (filter) assert.equal(filter, 'eq.' + A);
      assert.equal((await f.client.auth.getSession()).data.session.user.id, B);
    } finally { await f.close(); }
  });
}
for (const [name, operation] of privateActions) {
  test(`private ${name} rejects switched and unbound owners before database dispatch`, async () => {
    const f = fixture();
    try {
      await f.install(B);
      await assert.rejects(operation(bound(f)), raceError);
      await assert.rejects(operation(new SupabaseOntoBackend(f.client)), raceError);
      assert.deepEqual(f.sent, []);
    } finally { await f.close(); }
  });
}
test('a cached profile owner label cannot replace server verification of the captured token', async () => {
  const f = fixture();
  try {
    await f.install(A);
    const [key, raw] = [...f.values.entries()].find(([, value]) => JSON.parse(value).access_token);
    f.values.set(key, JSON.stringify({ ...JSON.parse(raw), access_token: token(B), user: user(A) }));
    await assert.rejects(bound(f).updateMyProfile({ displayName: 'Name entered on A' }), raceError);
    assert.deepEqual(f.sent, []);
  } finally { await f.close(); }
});
test('a revoked token cannot modify private Going data', async () => {
  const f = fixture();
  try {
    await f.install(A);
    f.rejectToken(A);
    await assert.rejects(bound(f).setRsvp({ eventId: ID, status: 'going' }));
    assert.deepEqual(f.sent, []);
  } finally { await f.close(); }
});
test('public catalog remains available on an unbound transport without a session', async () => {
  const f = fixture();
  try {
    assert.deepEqual((await new SupabaseOntoBackend(f.client).listEvents()).items, []);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].owner, null);
    assert.match(f.sent[0].url, /events/);
  } finally { await f.close(); }
});

test('late missing-session verification for A cannot clear the newly installed B session', { timeout: 10000 }, async () => {
  const f = fixture();
  try {
    await f.install(A);
    const hold = f.holdVerification();
    const action = bound(f).setRsvp({ eventId: ID, status: 'going' });
    await hold.entered.promise;
    await f.install(B);
    f.rejectToken(A, true);
    hold.release.resolve();
    await assert.rejects(action, (error) => error?.code === 'not-authenticated');
    assert.deepEqual(f.sent, []);
    assert.equal((await f.client.auth.getSession()).data.session?.user.id, B);
    assert.equal(f.visibleOwner(), B);
  } finally { await f.close(); }
});

test('a bound private port without its isolated verifier fails closed', async () => {
  const f = fixture();
  try {
    await f.install(A);
    await assert.rejects(new SupabaseOntoBackend(f.client, undefined, A).setRsvp({ eventId: ID, status: 'going' }),
      (error) => error?.code === 'server');
    assert.deepEqual(f.sent, []);
  } finally { await f.close(); }
});


test('actual SDK catalog requests keep Asheville/Vermont geography on every page', async () => {
  const sent = [];
  const client = createClient('https://catalog-fixture.invalid', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url) => {
      sent.push(new URL(String(url)));
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const catalog = new SupabaseOntoBackend(client);
  for (const serviceRegion of ['asheville', 'vermont-corridor']) {
    for (const cursor of [null, '200']) await catalog.listEvents({ serviceRegion, limit: 200, cursor });
  }
  assert.equal(sent.length, 4);
  for (const url of sent.slice(0, 2)) {
    assert.equal(url.pathname, '/rest/v1/active_events');
    assert.equal(url.searchParams.get('region'), 'eq.NC');
    assert.equal(url.searchParams.get('country_code'), 'eq.US');
    assert.match(url.searchParams.get('locality'), /Black Mountain/);
    assert.match(url.searchParams.get('locality'), /Weaverville/);
    assert.doesNotMatch(url.searchParams.get('locality'), /Arden/);
    assert.deepEqual(url.searchParams.getAll('latitude'), ['gte.35.39', 'lte.35.83']);
    assert.deepEqual(url.searchParams.getAll('longitude'), ['gte.-82.89', 'lte.-82.16']);
  }
  assert.equal(sent[1].searchParams.get('offset'), '200');
  for (const url of sent.slice(2)) {
    assert.equal(url.searchParams.get('region'), 'eq.VT');
    assert.equal(url.searchParams.get('country_code'), 'eq.US');
    assert.match(url.searchParams.get('locality'), /White River Junction/);
    assert.deepEqual(url.searchParams.getAll('latitude'), ['gte.43.4', 'lte.44.7']);
  }
});
