'use strict';

// Use Expo's installed CLI, never an unpinned download.
//
// Why this script loads .env files itself (2026-09-28): SDK 54's `expo export`
// evaluates app.config.js (resolveOptionsAsync) BEFORE it loads .env files
// (exportAppAsync), so the release guard used to see none of the production
// values kept in .env.local and blocked every deploy unless the shell exported
// them first. The guard stays fail-closed; this script hands it the same
// values the export will inline, read by Expo's own loader in production mode,
// with the shell's own variables still taking precedence. Nothing is printed.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');

let cli;
let expoEnv;
try {
  const packagePath = require.resolve('expo/package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.expo;
  if (!bin) throw new Error('missing executable');
  cli = path.resolve(path.dirname(packagePath), bin);
  // Expo's own .env loader, resolved from the installed Expo package (a
  // dependency of expo itself), so the files and their precedence match the
  // export exactly. No new dependency.
  expoEnv = require(require.resolve('@expo/env', { paths: [path.dirname(packagePath)] }));
} catch {
  console.error('onto release export cannot start. Install the locked dependencies with npm ci first.');
  process.exit(1);
}

// Files fill gaps only: a variable already set in the shell wins, as it does
// inside Expo. EXPO_NO_DOTENV still turns file loading off. Expansion runs
// against NODE_ENV=production, because the export forces that before it loads
// these files, so `${NODE_ENV}` in a value means the same thing here.
const parsed = expoEnv.parseProjectEnv(projectRoot, {
  mode: 'production',
  silent: true,
  systemEnv: { ...process.env, NODE_ENV: 'production' },
}).env;
// Only the public build settings the guard reads cross into the new process.
// Everything else in the files (NODE_OPTIONS, server-side keys) is left for
// Expo to load itself after Node has started, exactly as before this script
// loaded anything, so a file can never change how the process boots.
const fromFiles = Object.fromEntries(
  Object.entries(parsed).filter(([name]) => name.startsWith('EXPO_PUBLIC_')),
);

const result = spawnSync(process.execPath, [
  cli, 'export', '--platform', 'web', '--output-dir', 'dist',
], {
  cwd: projectRoot,
  env: { ...fromFiles, ...process.env, ONTO_RELEASE_BUILD: '1' },
  stdio: 'inherit',
});

if (result.error) {
  console.error('onto release export could not start; nothing was deployed.');
  process.exit(1);
}
// Failure or signal must stop npm's && chain before Wrangler is reached.
if (result.status !== 0) process.exit(result.status ?? 1);

// Stamp the service worker from the exported tree so dist/sw.js (and the
// committed public/sw.js) carry this deploy's hash.
const sw = spawnSync(process.execPath, [
  path.join(projectRoot, 'scripts', 'pwa', 'build-sw.mjs'), '--dist', 'dist',
], { cwd: projectRoot, stdio: 'inherit' });
process.exit(sw.error ? 1 : (sw.status ?? 1));
