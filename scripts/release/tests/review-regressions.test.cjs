'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { inspectReleaseEnvironment, assertReleaseEnvironment } = require('../environment.cjs');

const URL_KEY = 'EXPO_PUBLIC_SUPABASE_URL';
const EMAIL_KEY = 'EXPO_PUBLIC_SUPPORT_EMAIL';
const valid = {
  [URL_KEY]: 'https://fixture.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_only_not_a_real_key',
  [EMAIL_KEY]: 'support@example.com',
  EXPO_PUBLIC_ENABLE_MATURE: 'false',
};

// Exercise the public contract rather than importing private validators.
function rejected(name, value) {
  const env = Object.freeze({ ...valid, [name]: value });
  assert.ok(inspectReleaseEnvironment(env).some(issue => issue.includes(name)));
  assert.throws(() => assertReleaseEnvironment(env), { name: 'ReleaseEnvironmentError' });
}

const unsafeMailboxes = [
  'support?bcc=attacker@example.com',
  'support#fragment@example.com',
  'support%3F@example.com',
  'support%23@example.com',
  'support%0d%0aBcc=other@example.com',
  'support%253F@example.com',
  'support&bcc=other@example.com',
  'support=other@example.com',
  'support/other@example.com',
  'support\\other@example.com',
  'support[other]@example.com',
  'support\u0000@example.com',
  'support\u007f@example.com',
  'support\u0009@example.com',
  'support\r\n@example.com',
  'support\u00e9@example.com',
  '.support@example.com',
  'support.@example.com',
  'support..team@example.com',
  `${'a'.repeat(65)}@example.com`,
  `support@${'a'.repeat(64)}.com`,
];
for (const [index, mailbox] of unsafeMailboxes.entries()) {
  test(`rejects unsafe support mailbox case ${index + 1}`, () => rejected(EMAIL_KEY, mailbox));
}

const safeMailboxes = [
  'support@onto.events', 'help+onto@example.com', 'SUPPORT@EXAMPLE.COM',
  'first.last+help@example.com', 'support_team-1@help.example.com',
  `${'a'.repeat(64)}@example.com`,
];
for (const mailbox of safeMailboxes) {
  test(`a supported mailbox remains exactly one mailto recipient: ${mailbox}`, () => {
    assert.deepEqual(inspectReleaseEnvironment({ ...valid, [EMAIL_KEY]: mailbox }), []);
    const link = new URL(`mailto:${mailbox}`);
    assert.equal(link.pathname, mailbox);
    assert.equal(link.search, '');
    assert.equal(link.hash, '');
  });
}

const invalidHosts = [
  'foo..supabase.co', '-bad.supabase.co', 'bad-.supabase.co',
  'bad_name.supabase.co', '.supabase.co', 'supabase.co.',
  `${'a'.repeat(64)}.supabase.co`,
  `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,
  'api.test', 'api.example', 'api.invalid', 'api.local', 'api.localhost',
  'nested.api.test', 'nested.api.example', 'api.home.arpa', 'api.onion', 'api.alt',
  'API.TEST', 'API.EXAMPLE', 'api.test.', '127.0.0.1', '[::1]',
];
for (const [index, host] of invalidHosts.entries()) {
  test(`rejects malformed or non-public hostname case ${index + 1}`, () => rejected(URL_KEY, `https://${host}`));
}

const validHosts = [
  'fixture.supabase.co', 'api.example.com', 'api.test.com', 'api.example.co',
  'my-backend.example.org', '1-api.example.net', 'API.EXAMPLE.COM',
  'xn--bcher-kva.example.com', `${'a'.repeat(63)}.example.com`,
  `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`,
];
for (const [index, host] of validHosts.entries()) {
  test(`accepts well-formed hostname case ${index + 1} without DNS lookup`, () => {
    assert.deepEqual(inspectReleaseEnvironment({ ...valid, [URL_KEY]: `https://${host}` }), []);
  });
}

for (const value of [
  'https://fix\tture.supabase.co', 'https://fix\nture.supabase.co',
  'https:\\fixture.supabase.co',
]) {
  test(`does not silently repair control characters or backslashes: ${JSON.stringify(value)}`, () => rejected(URL_KEY, value));
}

test('support and origin errors remain redacted and do not mutate the input', () => {
  const env = Object.freeze({ ...valid,
    [URL_KEY]: 'https://SENTINEL_HOST..supabase.co',
    [EMAIL_KEY]: 'SENTINEL_MAIL?bcc=other@example.com',
  });
  assert.equal(inspectReleaseEnvironment(env).length, 2);
  assert.throws(() => assertReleaseEnvironment(env), error => {
    assert.doesNotMatch(error.stack, /SENTINEL_HOST|SENTINEL_MAIL/);
    assert.equal(error.cause, undefined);
    return true;
  });
});

// The real app.config.js is invoked in a fresh process, not a copied validator.
for (const [name, value] of [[URL_KEY, 'https://foo..supabase.co'], [EMAIL_KEY, unsafeMailboxes[0]]]) {
  for (const trigger of [{ ONTO_RELEASE_BUILD: '1' }, { EAS_BUILD_PROFILE: 'production' }]) {
    test(`production configuration refuses review regression ${name} via ${Object.keys(trigger)[0]}`, () => {
      const base = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        !/^(EXPO_|EAS_|ONTO_|NODE_OPTIONS$|NODE_PATH$)/.test(key)));
      const configPath = path.resolve(__dirname, '../../../app.config.js');
      const child = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})({config:{}})`], {
        env: { ...base, ...valid, ...trigger, [name]: value }, encoding: 'utf8',
      });
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /onto production build blocked/);
      assert.ok(!(child.stdout + child.stderr).includes(value));
    });
  }
}
