const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../../../supabase/functions/apple-account/handler.mjs');
const request = (body, token = 'verified-user') => new Request('https://fixture.test', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ expectedUserId: 'account-a', ...body }) });
function fixture() {
  const calls = [];
  return { calls, authenticate: async () => ({ id: 'account-a', identities: [{ provider: 'apple', identity_data: { sub: 'subject-a' } }] }), exchange: async () => ({ subject: 'subject-a', refreshToken: 'private-refresh' }), encrypt: async (token, owner) => { calls.push(['encrypt', owner]); return { cipher: 'encrypted' }; }, store: async (owner, value) => { calls.push(['store', owner, value]); }, load: async owner => { calls.push(['load', owner]); return { cipher: 'encrypted' }; }, decrypt: async () => 'private-refresh', revoke: async token => { calls.push(['revoke', token]); }, deleteUser: async owner => { calls.push(['delete', owner]); } };
}
test('only the verified account can store revocation material; secrets never return', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture();
 const response = await appleAccountHandler(ports)(request({ action: 'register', authorizationCode: 'fresh-code', userId: 'forged-other-account' }));
 assert.equal(response.status,200); assert.deepEqual(await response.json(), { ok: true });
 assert.deepEqual(ports.calls, [['encrypt','account-a'],['store','account-a',{ cipher:'encrypted' }]]);
});
test('a code belonging to a different Apple identity cannot link credentials', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture(); ports.exchange = async () => ({ subject: 'other', refreshToken: 'private' });
 assert.equal((await appleAccountHandler(ports)(request({ action: 'register', authorizationCode: 'code' }))).status,403); assert.deepEqual(ports.calls,[]);
});
test('deletion revokes first and deletes only the verified account', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture();
 const response = await appleAccountHandler(ports)(request({ action: 'delete', userId: 'forged' }));
 assert.deepEqual(await response.json(),{ deleted:true }); assert.deepEqual(ports.calls,[['load','account-a'],['revoke','private-refresh'],['delete','account-a']]);
});
test('provider failure preserves account and hides token-bearing errors', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture(); ports.revoke = async () => { throw new Error('private-refresh secret failure'); };
 const response = await appleAccountHandler(ports)(request({ action: 'delete' })); assert.equal(response.status,503); assert.doesNotMatch(await response.text(),/private-refresh/); assert.equal(ports.calls.some(call => call[0]==='delete'),false);
});
test('missing stored credential asks for Apple reauthorization before deletion', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture(); ports.load = async () => null;
 assert.equal((await appleAccountHandler(ports)(request({ action: 'delete' }))).status,409); assert.deepEqual(ports.calls,[]);
});
test('unauthenticated and invalid sessions cannot perform a privileged action', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture();
 assert.equal((await appleAccountHandler(ports)(request({ action: 'delete' },null))).status,401);
 ports.authenticate = async () => null; assert.equal((await appleAccountHandler(ports)(request({ action: 'delete' }))).status,401); assert.deepEqual(ports.calls,[]);
});

test('every action fails before writes when the verified token belongs to a switched account', async () => {
 const { appleAccountHandler } = await load();
 for (const action of ['register', 'delete', 'status']) {
  const ports = fixture(); ports.authenticate = async () => ({ id: 'account-b', identities: [{ provider: 'apple', identity_data: { sub: 'subject-b' } }] });
  const response = await appleAccountHandler(ports)(request({ action, authorizationCode: 'code', expectedUserId: 'account-a' }));
  assert.equal(response.status,409); assert.deepEqual(ports.calls,[]);
 }
});
test('readiness only confirms server-held deletion material without returning it', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture();
 const response = await appleAccountHandler(ports)(request({ action: 'status' }));
 assert.equal(response.status,200); assert.deepEqual(await response.json(),{ ready:true }); assert.deepEqual(ports.calls,[['load','account-a']]);
 ports.load = async () => null;
 assert.deepEqual(await (await appleAccountHandler(ports)(request({ action:'status' }))).json(), { ready:false });
});
test('missing expected owner never permits implicit-current deletion', async () => {
 const { appleAccountHandler } = await load(); const ports = fixture();
 assert.equal((await appleAccountHandler(ports)(request({ action:'delete', expectedUserId:null }))).status,409);
 assert.deepEqual(ports.calls,[]);
});
