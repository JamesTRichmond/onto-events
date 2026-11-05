// Metro asset plugin: serve package assets from /assets/pkg/ instead of
// /assets/node_modules/. Wrangler's Pages upload skips every path segment
// named node_modules, so fonts like @expo/vector-icons' MaterialIcons.ttf
// were never deployed and _redirects answered with the HTML shell.
// Rewriting httpServerLocation before bundling keeps the bundle URL and the
// written file in agreement, and the bundle hashes change with it.
// "pkg" (not "vendor") so it can never alias the repo's real vendor/ folder.
const SEGMENT = /(^|\/)node_modules(\/|$)/g;

function pkgAssetPlugin(asset) {
  asset.httpServerLocation = asset.httpServerLocation.replace(SEGMENT, '$1pkg$2');
  return asset;
}

module.exports = pkgAssetPlugin;
