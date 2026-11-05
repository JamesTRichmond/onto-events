// Real SDK transports, synthetic sessions and intercepted HTTP only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '../../..');
const communitySource = path.join(root, 'lib/backend/supabase-community.ts');
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
  const source = file === communitySource && process.env.ONTO_COMMUNITY_OWNER_BASELINE
    ? process.env.ONTO_COMMUNITY_OWNER_BASELINE : file;
  mod._compile(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, file);
  return mod.exports;
}
const { SupabaseCommunity } = loadSource(communitySource);
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
const hostInput = () => ({ venueId: ID, title: 'Public library meetup', description: 'A public reading meetup.',
  meetingInstructions: 'Meet beside the public library desk.', startsAt: new Date(Date.now() + 86400000).toISOString(),
  endsAt: new Date(Date.now() + 90000000).toISOString(), category: 'community', newcomersWelcome: true });
const reviewInput = () => ({ eventId: 'fixture-occurrence', score: 5, text: 'The meeting instructions were clear.' });
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
        return new Response(JSON.stringify(owner === rejectedToken ? { message: 'Session revoked', ...(missingSession ? { error_code: 'session_not_found' } : {}) } : user(owner)), {
          status: owner === rejectedToken ? 401 : 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!String(url).includes('/rest/v1/')) throw new Error('Unexpected endpoint; no live network is allowed');
      const owner = authorization?.startsWith('Bearer ey') ? subject(authorization) : null;
      const rpc = String(url).split('/rpc/')[1] ?? null;
      sent.push({ owner, rpc, url: String(url), body: init.body ? JSON.parse(init.body) : null });
      const response = rpc === 'community_pilot_state' ? { hosting: true, reviews: true, reviewer: false }
        : rpc?.startsWith('my_') || !rpc ? [] : ID;
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
  ['hosting', (backend) => backend.saveHosted(hostInput(), undefined, true)],
  ['review', (backend) => backend.saveReview(reviewInput())],
  ['report', (backend) => backend.reportContent('review', ID, 'Safety or accuracy review requested')],
];
for (const [name, operation] of mutations) {
  test(`real SDK: ${name} never dispatches as B while the displayed account is still A`, { timeout: 10000 }, async () => {
    const f = fixture();
    try {
      await f.install(A);
      const backend = new SupabaseCommunity(f.client, A, f.verifyToken);
      const hold = f.holdWrite();
      const switching = f.install(B);
      await hold.entered.promise;
      assert.equal(f.visibleOwner(), A);
      const action = operation(backend);
      await assert.rejects(action, raceError);
      assert.deepEqual(f.sent, []);
      assert.equal(f.visibleOwner(), A);
      hold.release.resolve();
      await switching;
    } finally { await f.close(); }
  });
}

for (const [name, operation] of mutations) {
  test(`real SDK: ${name} uses its captured A bearer even if the session changes after verification starts`, { timeout: 10000 }, async () => {
    const f = fixture();
    try {
      await f.install(A);
      const backend = new SupabaseCommunity(f.client, A, f.verifyToken);
      const hold = f.holdVerification();
      const action = operation(backend);
      const phase = await Promise.race([hold.entered.promise.then(() => 'verifying'), action.then(() => 'already-dispatched')]);
      assert.equal(phase, 'verifying', 'Protected action must verify its captured token before sending');
      await f.install(B);
      assert.equal(f.visibleOwner(), B);
      hold.release.resolve();
      await action;
      assert.equal(f.sent.length, 1);
      assert.equal(f.sent[0].owner, A);
      assert.equal((await f.client.auth.getSession()).data.session.user.id, B);
    } finally { await f.close(); }
  });
}

test('a cached session user label cannot substitute for the captured token’s server-verified owner', async () => {
  const f = fixture();
  try {
    await f.install(A);
    const [key, raw] = [...f.values.entries()].find(([, value]) => JSON.parse(value).access_token);
    const forgedLabel = { ...JSON.parse(raw), access_token: token(B), user: user(A) };
    f.values.set(key, JSON.stringify(forgedLabel));
    await assert.rejects(new SupabaseCommunity(f.client, A, f.verifyToken).saveReview(reviewInput()), raceError);
    assert.deepEqual(f.sent, []);
  } finally { await f.close(); }
});

test('revoked sessions cannot publish even if the account label still matches', async () => {
  const f = fixture();
  try {
    await f.install(A);
    f.rejectToken(A);
    await assert.rejects(new SupabaseCommunity(f.client, A, f.verifyToken).saveReview(reviewInput()));
    assert.deepEqual(f.sent, []);
  } finally { await f.close(); }
});

const protectedActions = [
  ['pilot', (b) => b.getPilotState()], ['venues', (b) => b.listVenues()], ['own hosts', (b) => b.listMyHosted()],
  ...mutations, ['cancel host', (b) => b.cancelHosted(ID)], ['own reviews', (b) => b.listMyReviews()],
  ['delete review', (b) => b.deleteReview(ID)], ['pending hosts', (b) => b.listPendingHosts()],
  ['pending reviews', (b) => b.listPendingReviews()], ['reports', (b) => b.listReports()],
  ['resolve report', (b) => b.resolveReport(ID)], ['moderate', (b) => b.moderate('host', ID, 1, true, 'Approved')],
];
for (const [name, operation] of protectedActions) {
  test(`protected ${name} rejects a detached or switched owner before any database request`, async () => {
    const f = fixture();
    try {
      await f.install(B);
      await assert.rejects(operation(new SupabaseCommunity(f.client, A, f.verifyToken)), raceError);
      await assert.rejects(operation(new SupabaseCommunity(f.client)), raceError);
      assert.deepEqual(f.sent, []);
    } finally { await f.close(); }
  });
}

test('anonymous approved-review discovery still works with no account session', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await new SupabaseCommunity(f.client).listPublicReviews('fixture-occurrence'), []);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].owner, null);
    assert.match(f.sent[0].url, /public_event_reviews/);
  } finally { await f.close(); }
});

test('protected table reads keep the captured owner when the SDK session switches during verification', { timeout: 10000 }, async () => {
  const f = fixture();
  try {
    await f.install(A);
    const backend = new SupabaseCommunity(f.client, A, f.verifyToken);
    const hold = f.holdVerification();
    const reading = backend.listReports();
    await hold.entered.promise;
    await f.install(B);
    hold.release.resolve();
    assert.deepEqual(await reading, []);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].owner, A);
    assert.match(f.sent[0].url, /community_reports/);
  } finally { await f.close(); }
});

test('late missing-session verification for A cannot sign out B during a community action', { timeout: 10000 }, async () => {
  const f = fixture();
  try {
    await f.install(A);
    const hold = f.holdVerification();
    const action = new SupabaseCommunity(f.client, A, f.verifyToken).saveReview(reviewInput());
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

test('a bound community port without its isolated verifier fails closed', async () => {
  const f = fixture();
  try {
    await f.install(A);
    await assert.rejects(new SupabaseCommunity(f.client, A).saveReview(reviewInput()), (error) => error?.code === 'server');
    assert.deepEqual(f.sent, []);
  } finally { await f.close(); }
});
