'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../../..');
const publicEnv = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_only_not_a_real_key',
  EXPO_PUBLIC_SUPPORT_EMAIL: 'support@example.com',
  EXPO_PUBLIC_ENABLE_MATURE: 'false',
  // Release builds must choose Apple sign-in explicitly. Unset is the defect.
  EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN: 'false',
};

function isolatedEnv(overrides = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(EXPO_|EAS_|ONTO_|NODE_PATH$)/.test(name)));
  return { ...env, ...overrides };
}

function evaluateConfig(env) {
  return spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const configure = require(${JSON.stringify(path.join(root, 'app.config.js'))});
    const config = Object.freeze({
      name: 'onto', slug: 'onto', version: '1.0.0',
      ios: Object.freeze({ bundleIdentifier: 'events.onto.app' }),
      extra: Object.freeze({ eas: { projectId: 'fixture-project' } }),
    });
    assert.strictEqual(configure({ config }), config);
    console.log('CONFIG_UNCHANGED');
  `], { env: isolatedEnv(env), encoding: 'utf8' });
}

test('normal development and ordinary static export remain accountless/offline', () => {
  for (const env of [{}, { NODE_ENV: 'production' }, { EAS_BUILD_PROFILE: 'preview' }]) {
    const result = evaluateConfig(env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CONFIG_UNCHANGED/);
  }
});

test('EAS production and explicit web releases enforce the same guard', () => {
  for (const trigger of [{ ONTO_RELEASE_BUILD: '1' }, { EAS_BUILD_PROFILE: 'production' }]) {
    const rejected = evaluateConfig(trigger);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /onto production build blocked/);
    assert.doesNotMatch(rejected.stdout, /CONFIG_UNCHANGED/);
    const accepted = evaluateConfig({ ...publicEnv, ...trigger });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /CONFIG_UNCHANGED/);
  }
});

test('app configuration rejects server keys without copying them into its error', () => {
  const secret = 'sb_secret_NEVER_SERIALIZE_THIS';
  const result = evaluateConfig({
    ...publicEnv, ONTO_RELEASE_BUILD: '1',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /onto production build blocked/);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
});

function buildFixture(t, installExpo = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-release-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of [
    'app.config.js',
    'scripts/build-web-release.cjs',
    'scripts/release/environment.cjs',
    'scripts/pwa/build-sw.mjs',
  ]) {
    const destination = path.join(dir, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  if (installExpo) {
    const expoDir = path.join(dir, 'node_modules', 'expo');
    fs.mkdirSync(expoDir, { recursive: true });
    fs.writeFileSync(path.join(expoDir, 'package.json'), JSON.stringify({
      name: 'expo', bin: { expo: 'cli.cjs' },
    }));
    // Deliberate process-boundary fixture, NOT a real Expo export. CI separately
    // exercises the installed Expo SDK's config resolution and static export.
    // Expo's real .env loader, linked from this checkout's install, so the
    // tests below exercise the same file order and precedence as the export.
    const envDir = path.join(dir, 'node_modules', '@expo', 'env');
    fs.mkdirSync(path.dirname(envDir), { recursive: true });
    fs.symlinkSync(fs.realpathSync(path.join(root, 'node_modules', '@expo', 'env')), envDir, 'dir');
    fs.writeFileSync(path.join(expoDir, 'cli.cjs'), `
      const fs = require('node:fs');
      require('../../app.config.js')({ config: {} });
      console.log(JSON.stringify({ args: process.argv.slice(2), gate: process.env.ONTO_RELEASE_BUILD }));
      // Opt-in: report named variables as the export process received them.
      if (process.env.FIXTURE_ECHO) {
        console.log(JSON.stringify(Object.fromEntries(process.env.FIXTURE_ECHO.split(',')
          .map(name => [name, process.env[name] ?? null]))));
      }
      if (process.env.FIXTURE_EXIT) process.exit(Number(process.env.FIXTURE_EXIT));
      fs.mkdirSync('dist');
      fs.writeFileSync('dist/index.html', 'fixture export, not a real application');
    `);
  }
  return dir;
}

function runBuild(dir, env) {
  return spawnSync(process.execPath, [path.join(dir, 'scripts/build-web-release.cjs')], {
    // Starting elsewhere must not put dist/ in the caller's directory.
    cwd: os.tmpdir(), env: isolatedEnv(env), encoding: 'utf8',
  });
}

test('web-release command always enables the guard before the export', t => {
  const dir = buildFixture(t);
  const result = runBuild(dir, { ONTO_RELEASE_BUILD: '0' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /onto production build blocked/);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

test('web-release command uses the installed CLI and expected project directory', t => {
  const dir = buildFixture(t);
  const result = runBuild(dir, publicEnv);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ['export', '--platform', 'web', '--output-dir', 'dist'], gate: '1',
  });
  assert.equal(fs.existsSync(path.join(dir, 'dist/index.html')), true);
});

test('failed export keeps its failure code so the deployment chain stops', t => {
  const dir = buildFixture(t);
  const result = runBuild(dir, { ...publicEnv, FIXTURE_EXIT: '23' });
  assert.equal(result.status, 23);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

test('missing dependencies fail locally instead of downloading a new Expo version', t => {
  const dir = buildFixture(t, false);
  const result = runBuild(dir, publicEnv);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm ci/);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

test('a privileged public credential cannot make it through the web command', t => {
  const dir = buildFixture(t);
  const secret = 'sb_secret_DONT_PRINT_THIS';
  const result = runBuild(dir, {
    ...publicEnv, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /onto production build blocked/);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

function writeEnvFile(dir, name, values) {
  fs.writeFileSync(path.join(dir, name),
    Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
}

test('production values kept in .env.local reach the guard with nothing exported in the shell', t => {
  // The 2026-09-28 deploy wall: Expo evaluates app.config.js before it loads
  // .env files, so this used to be blocked unless the shell sourced the file.
  const dir = buildFixture(t);
  writeEnvFile(dir, '.env.local', publicEnv);
  const result = runBuild(dir, {});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).gate, '1');
  assert.equal(fs.existsSync(path.join(dir, 'dist/index.html')), true);
});

test('the shell outranks .env files, both ways', t => {
  const dir = buildFixture(t);
  const secret = 'sb_secret_FILE_VALUE_NEVER_PRINTED';
  writeEnvFile(dir, '.env.local', { ...publicEnv, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret });
  const fixedByShell = runBuild(dir, {
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  assert.equal(fixedByShell.status, 0, fixedByShell.stderr);

  fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
  writeEnvFile(dir, '.env.local', publicEnv);
  const brokenByShell = runBuild(dir, { EXPO_PUBLIC_ENABLE_MATURE: 'true' });
  assert.notEqual(brokenByShell.status, 0);
  assert.match(brokenByShell.stderr, /onto production build blocked/);
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

test('a privileged key in an .env file is still refused and never printed', t => {
  const dir = buildFixture(t);
  const secret = 'sb_secret_IN_ENV_LOCAL_DONT_PRINT';
  writeEnvFile(dir, '.env.local', { ...publicEnv, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret });
  const result = runBuild(dir, {});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /onto production build blocked/);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
  assert.equal(fs.existsSync(path.join(dir, 'dist')), false);
});

test('production files follow Expo order and EXPO_NO_DOTENV turns them off', t => {
  const dir = buildFixture(t);
  writeEnvFile(dir, '.env', { ...publicEnv, EXPO_PUBLIC_SUPPORT_EMAIL: 'not an address' });
  writeEnvFile(dir, '.env.production.local', { EXPO_PUBLIC_SUPPORT_EMAIL: publicEnv.EXPO_PUBLIC_SUPPORT_EMAIL });
  const ordered = runBuild(dir, {});
  assert.equal(ordered.status, 0, ordered.stderr);

  fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
  const disabled = runBuild(dir, { EXPO_NO_DOTENV: '1' });
  assert.notEqual(disabled.status, 0);
  assert.match(disabled.stderr, /onto production build blocked/);
});

test('values expand against NODE_ENV=production, as inside the export', t => {
  const dir = buildFixture(t);
  writeEnvFile(dir, '.env.local', {
    ...publicEnv, EXPO_PUBLIC_SUPPORT_EMAIL: 'support+${NODE_ENV}@example.com',
  });
  const result = runBuild(dir, { NODE_ENV: 'development', FIXTURE_ECHO: 'EXPO_PUBLIC_SUPPORT_EMAIL' });
  assert.equal(result.status, 0, result.stderr);
  const echoed = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.equal(echoed.EXPO_PUBLIC_SUPPORT_EMAIL, 'support+production@example.com');
});

test('only EXPO_PUBLIC_ values from files reach the new process; Node startup options never do', t => {
  const dir = buildFixture(t);
  fs.writeFileSync(path.join(dir, 'boot-marker.cjs'),
    `require('node:fs').writeFileSync(${JSON.stringify(path.join(dir, 'booted'))}, 'x');`);
  writeEnvFile(dir, '.env.local', {
    ...publicEnv,
    NODE_OPTIONS: `--require ${path.join(dir, 'boot-marker.cjs')}`,
    TM_KEY: 'server_side_fixture_value',
  });
  const result = runBuild(dir, { FIXTURE_ECHO: 'NODE_OPTIONS,TM_KEY' });
  assert.equal(result.status, 0, result.stderr);
  const echoed = JSON.parse(result.stdout.trim().split('\n').pop());
  // The runner may carry its own NODE_OPTIONS; the file's value must not appear.
  assert.ok(!String(echoed.NODE_OPTIONS ?? '').includes('boot-marker'));
  assert.equal(echoed.TM_KEY, null);
  assert.equal(fs.existsSync(path.join(dir, 'booted')), false);
});

test('production scripts preserve existing destinations and enforce the guard', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(pkg.scripts.build, /^expo export --platform web/);
  assert.equal(pkg.scripts['build:release'], 'node scripts/build-web-release.cjs');
  assert.match(pkg.scripts['deploy:web'], /^npm run build:release && /);
  assert.match(pkg.scripts['deploy:web'], /wrangler@4\.128\.0 pages deploy dist --project-name onto --branch main$/);
  assert.equal(eas.build.production.env.ONTO_RELEASE_BUILD, '1');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_ENABLE_MATURE, 'false');
  assert.match(ci, /npm run test:release/);
  assert.match(ci, /npx expo config --type public/);
});
