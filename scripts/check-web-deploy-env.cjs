'use strict';

// Runs between build:release and Wrangler in `npm run deploy:web`. The web
// build reads EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN and quietly hides the Apple
// button when it is missing, so a deploy must make that choice explicitly.
// Same .env files and precedence as build-web-release.cjs (shell wins;
// EXPO_NO_DOTENV turns files off). Only the variable name is ever printed.
const path = require('node:path');

const NAME = 'EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN';
const projectRoot = path.resolve(__dirname, '..');

let fileEnv;
try {
  const expoDir = path.dirname(require.resolve('expo/package.json'));
  const expoEnv = require(require.resolve('@expo/env', { paths: [expoDir] }));
  fileEnv = expoEnv.parseProjectEnv(projectRoot, {
    mode: 'production',
    silent: true,
    systemEnv: { ...process.env, NODE_ENV: 'production' },
  }).env;
} catch {
  console.error('onto web deploy check cannot start. Install the locked dependencies with npm ci first; nothing was deployed.');
  process.exit(1);
}

const value = { ...fileEnv, ...process.env }[NAME];
if (value !== 'true' && value !== 'false') {
  console.error(
    `onto web deploy stopped: ${NAME} must be set explicitly to true or false ` +
      '(a shell value overrides .env files, even an empty one). Unset, the web build silently hides the Apple sign-in button. Nothing was deployed.',
  );
  process.exit(1);
}
