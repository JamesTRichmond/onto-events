'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { inspectReleaseEnvironment, assertReleaseEnvironment, isReleaseBuild } = require('../environment.cjs');

function token(payload) {
  return `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture_signature`;
}

function valid(overrides = {}) {
  return {
    EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_only_not_a_real_key',
    EXPO_PUBLIC_SUPPORT_EMAIL: 'support@example.com',
    EXPO_PUBLIC_ENABLE_MATURE: 'false',
    ...overrides,
  };
}

const required = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
];

test('accepts a public release configuration without changing it', () => {
  const env = Object.freeze(valid());
  assert.deepEqual(inspectReleaseEnvironment(env), []);
  assert.equal(assertReleaseEnvironment(env), undefined);
});

test('supports a legacy anon key during incremental key migration', () => {
  assert.deepEqual(inspectReleaseEnvironment(valid({
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: token({ role: 'anon', iss: 'supabase' }),
  })), []);
});

for (const name of required) {
  for (const value of [undefined, '', '   ', 123]) {
    test(`rejects missing or non-string ${name}: ${String(value)}`, () => {
      assert.ok(inspectReleaseEnvironment(valid({ [name]: value })).some(issue => issue.includes(name)));
    });
  }
}

test('reports all missing settings together rather than one login loop per variable', () => {
  const issues = inspectReleaseEnvironment();
  assert.equal(issues.length, 3);
  for (const name of required) assert.ok(issues.some(issue => issue.includes(name)));
});

for (const value of [
  'http://fixture.supabase.co',
  'not-a-url',
  'https://user:password@fixture.supabase.co',
  'https://fixture.supabase.co/rest/v1',
  'https://fixture.supabase.co?apikey=private',
  'https://fixture.supabase.co#private',
  'https://localhost',
  'https://api.localhost',
  'https://api.local',
  'https://missing.invalid',
  'https://127.0.0.1',
  'https://[::1]',
  'https://10.0.0.1',
  'https://fixture.supabase.co:8443',
]) {
  test(`rejects an unsuitable production endpoint: ${value.split('?')[0]}`, () => {
    assert.ok(inspectReleaseEnvironment(valid({ EXPO_PUBLIC_SUPABASE_URL: value })).length);
  });
}

for (const value of ['https://fixture.supabase.co/', 'https://api.example.com']) {
  test(`accepts a HTTPS origin, including custom domains: ${value}`, () => {
    assert.deepEqual(inspectReleaseEnvironment(valid({ EXPO_PUBLIC_SUPABASE_URL: value })), []);
  });
}

for (const value of [
  'sb_secret_fixture_only',
  token({ role: 'service_role' }),
  token({ role: 'authenticated' }),
  token({ role: 'admin' }),
  token(null),
  token([]),
  'e30.not_json.signature',
  'sb_publishable_',
  'sb_publishable_bad key',
  'sb_publishable_bad\nkey',
  'some-random-token',
]) {
  test(`rejects non-public key class ${value.slice(0, 18)}`, () => {
    const issues = inspectReleaseEnvironment(valid({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value }));
    assert.ok(issues.some(issue => issue.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')));
    assert.ok(!issues.join('\n').includes(value));
  });
}

for (const value of [
  'Name <support@example.com>',
  'support@example.com,second@example.com',
  'mailto:support@example.com',
  'support@example.com?subject=untrusted',
  'support@example.com\r\nBcc:other@example.com',
  'support@localhost',
  'support@-invalid.com',
  'support@example-.com',
  `${'a'.repeat(250)}@example.com`,
]) {
  test(`rejects an invalid or injectable support mailbox of length ${value.length}`, () => {
    assert.ok(inspectReleaseEnvironment(valid({ EXPO_PUBLIC_SUPPORT_EMAIL: value })).length);
  });
}

for (const value of ['help+onto@example.com', 'SUPPORT@EXAMPLE.COM']) {
  test(`allows a simple working mailbox shape: ${value}`, () => {
    assert.deepEqual(inspectReleaseEnvironment(valid({ EXPO_PUBLIC_SUPPORT_EMAIL: value })), []);
  });
}

for (const value of ['true', 'TRUE', 'False', ' false ', '', '0', false]) {
  test(`rejects an explicit non-v1 mature setting: ${String(value)}`, () => {
    assert.ok(inspectReleaseEnvironment(valid({ EXPO_PUBLIC_ENABLE_MATURE: value }))
      .some(issue => issue.includes('EXPO_PUBLIC_ENABLE_MATURE')));
  });
}

test('keeps the unset mature flag consistent with the app fail-closed default', () => {
  assert.deepEqual(inspectReleaseEnvironment(valid({ EXPO_PUBLIC_ENABLE_MATURE: undefined })), []);
});

for (const name of [
  'EXPO_PUBLIC_SERVICE_ROLE_KEY',
  'EXPO_PUBLIC_SUPABASE_SECRET_KEY',
  'EXPO_PUBLIC_TM_KEY',
  'EXPO_PUBLIC_TICKETMASTER_API_KEY',
  'EXPO_PUBLIC_EXPO_TOKEN',
  'EXPO_PUBLIC_PRIVATE_KEY',
  'EXPO_PUBLIC_PASSWORD',
  'EXPO_PUBLIC_ACCESS_TOKEN',
]) {
  test(`rejects a privileged variable in public configuration: ${name}`, () => {
    assert.ok(inspectReleaseEnvironment(valid({ [name]: 'fixture-secret' }))
      .some(issue => issue.includes('Remove privileged credentials')));
  });
}

for (const secret of ['sb_secret_fixture_only', token({ role: 'service_role' })]) {
  test(`detects a privileged value even behind an innocent public variable name: ${secret.slice(0, 10)}`, () => {
    assert.ok(inspectReleaseEnvironment(valid({ EXPO_PUBLIC_UNRELATED: secret }))
      .some(issue => issue.includes('Remove privileged credentials')));
  });
}

test('ignores private server variables; the check is not a server secret ban', () => {
  assert.deepEqual(inspectReleaseEnvironment(valid({
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture_only',
    TM_KEY: 'fixture-server-only',
  })), []);
});

test('never includes raw configuration, values, or provider causes in failures', () => {
  const secret = 'sb_secret_SENTINEL_NEVER_LOG';
  const env = valid({
    EXPO_PUBLIC_SUPABASE_URL: 'https://user:SENTINEL_URL@fixture.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
    EXPO_PUBLIC_SUPPORT_EMAIL: 'SENTINEL_EMAIL',
  });
  assert.throws(() => assertReleaseEnvironment(env), error => {
    assert.equal(error.name, 'ReleaseEnvironmentError');
    assert.equal(error.cause, undefined);
    assert.equal(error.env, undefined);
    for (const sentinel of ['SENTINEL_NEVER_LOG', 'SENTINEL_URL', 'SENTINEL_EMAIL']) {
      assert.ok(!`${error.stack}${JSON.stringify(error)}`.includes(sentinel));
    }
    return true;
  });
});

test('release detection cannot be defeated by clearing one of the two signals', () => {
  assert.equal(isReleaseBuild({ ONTO_RELEASE_BUILD: '1' }), true);
  assert.equal(isReleaseBuild({ EAS_BUILD_PROFILE: 'production', ONTO_RELEASE_BUILD: '0' }), true);
  for (const env of [{}, { EAS_BUILD_PROFILE: 'preview' }, { NODE_ENV: 'production' }]) {
    assert.equal(isReleaseBuild(env), false);
  }
});
