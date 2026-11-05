/* eslint-disable @typescript-eslint/no-require-imports */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.join(__dirname, '..', '..');
const pluginPath = path.join(root, 'scripts', 'metro', 'pkg-asset-plugin.js');
const plugin = require(pluginPath);
const buildSw = path.join(root, 'scripts', 'pwa', 'build-sw.mjs');

// Wrangler's Pages upload skips any node_modules path segment, so a package
// asset must never be served from /assets/node_modules/.
describe('metro pkg asset plugin', () => {
  it.each([
    ['/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts',
      '/assets/pkg/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts'],
    ['/assets/node_modules/expo-router/assets', '/assets/pkg/expo-router/assets'],
    ['/assets/node_modules/a/node_modules/b', '/assets/pkg/a/pkg/b'],
    ['/assets/assets/fonts', '/assets/assets/fonts'],
    ['/assets/my_node_modules_x', '/assets/my_node_modules_x'],
  ])('%s -> %s', (from, to) => {
    expect(plugin({ httpServerLocation: from }).httpServerLocation).toBe(to);
    expect(to).not.toMatch(/(^|\/)node_modules(\/|$)/);
  });

  // Load in a plain Node child: expo/metro-config is not jest-transformable.
  function metro(argv: string[]) {
    const out = spawnSync(process.execPath, ['-e', `
      const c = require('./metro.config.js');
      process.stdout.write(JSON.stringify({ plugins: c.transformer.assetPlugins ?? [],
        dev: c.server.rewriteRequestUrl('/assets/pkg/@expo/vector-icons/x.ttf?platform=web') }));`,
    ...argv], { cwd: root, encoding: 'utf8' });
    expect(out.status).toBe(0);
    return JSON.parse(out.stdout) as { plugins: string[]; dev: string };
  }

  it('registers only for web export; dev server maps /assets/pkg/ back to node_modules', () => {
    expect(metro(['export', '--platform', 'web']).plugins).toContain(pluginPath);
    expect(metro(['export', '--platform', 'ios']).plugins).not.toContain(pluginPath);
    const dev = metro(['start', '--web']);
    expect(dev.plugins).not.toContain(pluginPath);
    expect(dev.dev).toBe('/assets/node_modules/@expo/vector-icons/x.ttf?platform=web');
  });

  it('pkg assets are shell-cached and immutable', () => {
    const headers = fs.readFileSync(path.join(root, 'public', '_headers'), 'utf8');
    expect(headers).toMatch(/\/assets\/pkg\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
    expect(sw).toContain("p.indexOf('/assets/pkg/') === 0");
    expect(sw).not.toMatch(/_expo\/static\/js/); // committed worker carries no dist list
    const src = fs.readFileSync(buildSw, 'utf8');
    expect(src).toContain("walk('assets/pkg')");
    expect(src).toContain("p.startsWith('/assets/pkg/')");
  });

  it('build-sw --dist fails on node_modules paths or /assets/node_modules/ text', () => {
    const run = (setup: (d: string) => void) => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-nm-'));
      fs.mkdirSync(path.join(tmp, '_expo', 'static', 'js', 'web'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'index.html'), '<html></html>');
      setup(tmp);
      const r = spawnSync(process.execPath, ['--input-type=module', '-e',
        `import * as m from ${JSON.stringify(pathToFileURL(buildSw).href)};
         process.stdout.write(JSON.stringify(m.findNodeModulesLeaks(${JSON.stringify(tmp)})));`],
      { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      return JSON.parse(r.stdout) as string[];
    };
    expect(run(() => {})).toEqual([]);
    expect(run((d) => fs.mkdirSync(path.join(d, 'assets', 'node_modules', 'x'), { recursive: true })))
      .toEqual(['assets/node_modules/ (path)']);
    expect(run((d) => fs.writeFileSync(path.join(d, '_expo', 'static', 'js', 'web', 'e.js'),
      'u="/assets/node_modules/@expo/a.ttf"'))).toEqual(['_expo/static/js/web/e.js (references assets/node_modules/)']);
  });
});
