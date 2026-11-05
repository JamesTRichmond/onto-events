'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { inspectReleaseEnvironment, assertReleaseEnvironment } = require('../environment.cjs');
const configure = require('../../../app.config.js');

const APPLE = 'EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN';

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

function appleIssues(env) {
  return inspectReleaseEnvironment(env).filter(issue => issue.includes(APPLE));
}

test('development builds still allow the Apple flag to be unset', () => {
  assert.deepEqual(appleIssues(valid()), []);
  assert.equal(assertReleaseEnvironment(valid()), undefined);
});

test('development builds do not reject an unused invalid Apple flag', () => {
  assert.deepEqual(appleIssues(valid({ [APPLE]: 'yes' })), []);
});

for (const value of ['true', 'false', ' false']) {
  test(`a production release accepts explicit Apple flag ${JSON.stringify(value)}`, () => {
    const env = valid({ ONTO_RELEASE_BUILD: '1', [APPLE]: value });
    assert.deepEqual(appleIssues(env), []);
    assert.equal(assertReleaseEnvironment(env), undefined);
  });
}

test('a production release rejects a missing Apple flag', () => {
  const env = valid({ ONTO_RELEASE_BUILD: '1' });
  assert.ok(appleIssues(env).length, 'missing flag must be reported');
});

for (const value of ['1', 'yes', 'TRUE', 'on', '']) {
  test(`a production release rejects invalid Apple flag ${JSON.stringify(value)}`, () => {
    assert.ok(appleIssues(valid({ ONTO_RELEASE_BUILD: '1', [APPLE]: value })).length);
  });
}

test('EAS production profile rejects a missing Apple flag', () => {
  assert.ok(appleIssues(valid({ EAS_BUILD_PROFILE: 'production' })).length);
});

test('app.config release path throws when the Apple flag is omitted', () => {
  const previous = {
    ONTO_RELEASE_BUILD: process.env.ONTO_RELEASE_BUILD,
    EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_SUPPORT_EMAIL: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
    EXPO_PUBLIC_ENABLE_MATURE: process.env.EXPO_PUBLIC_ENABLE_MATURE,
    [APPLE]: process.env[APPLE],
  };
  Object.assign(process.env, valid({ ONTO_RELEASE_BUILD: '1' }));
  delete process.env[APPLE];
  try {
    assert.throws(() => configure({ config: { name: 'onto' } }), { name: 'ReleaseEnvironmentError' });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('app.config release path accepts an explicit false Apple flag', () => {
  const previous = {
    ONTO_RELEASE_BUILD: process.env.ONTO_RELEASE_BUILD,
    [APPLE]: process.env[APPLE],
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_SUPPORT_EMAIL: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
    EXPO_PUBLIC_ENABLE_MATURE: process.env.EXPO_PUBLIC_ENABLE_MATURE,
  };
  Object.assign(process.env, valid({ ONTO_RELEASE_BUILD: '1', [APPLE]: 'false' }));
  try {
    assert.deepEqual(configure({ config: { name: 'onto' } }), { name: 'onto' });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
