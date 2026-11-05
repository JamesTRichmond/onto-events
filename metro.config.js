const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const fs = require('node:fs');

const config = getDefaultConfig(__dirname);

const nmPath = path.resolve(__dirname, 'node_modules');
if (fs.existsSync(nmPath)) {
  const realNm = fs.realpathSync(nmPath);
  if (realNm !== nmPath) {
    config.watchFolders = [...(config.watchFolders || []), path.dirname(realNm), realNm];
    config.resolver = config.resolver || {};
    config.resolver.nodeModulesPaths = [
      ...(config.resolver.nodeModulesPaths || []),
      nmPath,
      realNm,
    ];
  }
}

// Web export only: native bundles and the dev server keep Metro's own
// /assets/node_modules/ URLs, which the dev server resolves to disk.
const argv = process.argv;
const p = argv.indexOf('--platform');
// Matches only `--platform web` as two argv slots (what npm run build /
// build-web-release pass). Does not match `-p web` or `--platform=web`;
// those forms are unused here, and findNodeModulesLeaks would fail the
// export loudly if the plugin were skipped by mistake.
const isWebExport = argv.includes('export') && p !== -1 && argv[p + 1] === 'web';
if (isWebExport) {
  config.transformer.assetPlugins = [
    ...(config.transformer.assetPlugins ?? []),
    require.resolve('./scripts/metro/pkg-asset-plugin.js'),
  ];
}

// Belt and braces: if a /assets/pkg/ URL ever reaches the dev server, map it
// back to the node_modules path Metro resolves on disk.
const rewrite = config.server.rewriteRequestUrl;
config.server.rewriteRequestUrl = (url) => {
  const u = url.replace(/(^|\/)assets\/pkg\//, '$1assets/node_modules/');
  return rewrite ? rewrite(u) : u;
};

module.exports = config;
