/* eslint-disable import/first, @typescript-eslint/no-require-imports -- jest.mock must precede hook import. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  catalogAgeMinutes,
  parseCatalogUpdatedAt,
} from '@/hooks/use-offline-catalog';

const root = path.join(__dirname, '..', '..');
const buildSw = path.join(root, 'scripts', 'pwa', 'build-sw.mjs');
const swOut = path.join(root, 'public', 'sw.js');

type BuildSwProbe = {
  h1: string;
  h2: string;
  h3: string;
  auth: boolean;
  rest: boolean;
  realtime: boolean;
  functions: boolean;
  shellHome: boolean;
  shellManifest: boolean;
  shellStatic: boolean;
  shellIcon: boolean;
  notShellApi: boolean;
  crossOriginStatic: boolean;
  precache: string[];
};

function probeBuildSw(): BuildSwProbe {
  const script = `
    import * as m from ${JSON.stringify(pathToFileURL(buildSw).href)};
    process.stdout.write(JSON.stringify({
      h1: m.computeBuildHash(['onto', 'a']),
      h2: m.computeBuildHash(['onto', 'a']),
      h3: m.computeBuildHash(['onto', 'b']),
      auth: m.isNetworkOnlyUrl('https://abc.supabase.co/auth/v1/token'),
      rest: m.isNetworkOnlyUrl('https://abc.supabase.co/rest/v1/onto.events?select=*'),
      realtime: m.isNetworkOnlyUrl('https://abc.supabase.co/realtime/v1/websocket'),
      functions: m.isNetworkOnlyUrl('https://abc.supabase.co/functions/v1/ingest'),
      shellHome: m.isNetworkOnlyUrl('https://onto.events/'),
      shellManifest: m.isNetworkOnlyUrl('https://onto.events/manifest.json'),
      shellStatic: m.isShellAssetUrl('https://onto.events/_expo/static/js/index-abc.js'),
      shellIcon: m.isShellAssetUrl('https://onto.events/icons/icon-192.png'),
      notShellApi: m.isShellAssetUrl('https://onto.events/api/catalog'),
      crossOriginStatic: m.isShellAssetUrl('https://evil.example/_expo/static/js/x.js'),
      precache: m.PRECACHE_URLS,
    }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    cwd: root,
  });
  if (result.status !== 0) {
    throw new Error(`build-sw import failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout) as BuildSwProbe;
}

describe('scripts/pwa/build-sw.mjs', () => {
  const seed = probeBuildSw();

  it('computes a deterministic content hash', () => {
    expect(seed.h1).toBe(seed.h2);
    expect(seed.h1).not.toBe(seed.h3);
    expect(seed.h1).toMatch(/^[a-f0-9]{16}$/);
  });

  it('marks Supabase auth/rest/realtime/functions as Network-Only', () => {
    expect(seed.auth).toBe(true);
    expect(seed.rest).toBe(true);
    expect(seed.realtime).toBe(true);
    expect(seed.functions).toBe(true);
  });

  it('does not Network-Only the app shell', () => {
    expect(seed.shellHome).toBe(false);
    expect(seed.shellManifest).toBe(false);
  });

  it('classifies shell static assets for Cache-First', () => {
    expect(seed.shellStatic).toBe(true);
    expect(seed.shellIcon).toBe(true);
    expect(seed.notShellApi).toBe(false);
    expect(seed.crossOriginStatic).toBe(false);
  });

  it('precache list covers shell entrypoints (not /sw.js)', () => {
    expect(seed.precache).toEqual(
      expect.arrayContaining(['/', '/index.html', '/manifest.json']),
    );
    expect(seed.precache).not.toContain('/sw.js');
  });

  it('emits real JavaScript at public/sw.js (not SPA HTML)', () => {
    expect(fs.existsSync(swOut)).toBe(true);
    const body = fs.readFileSync(swOut, 'utf8');
    const head = body.slice(0, 200).toLowerCase();
    expect(head.includes('<!doctype')).toBe(false);
    expect(head.includes('<html')).toBe(false);
    expect(body).toMatch(/BUILD_HASH=[a-f0-9]{16}/);
    expect(body).toContain('onto-shell-');
    expect(body).toContain('/auth/v1');
    expect(body).toContain('/rest/v1');
    expect(body).toContain("path === '/sw.js'");
  });

  it('rebuild is byte-stable for the same generator', () => {
    const before = fs.readFileSync(swOut);
    const run = spawnSync(process.execPath, [buildSw], { encoding: 'utf8', cwd: root });
    expect(run.status).toBe(0);
    const after = fs.readFileSync(swOut);
    expect(Buffer.compare(before, after)).toBe(0);
  });

  it('keeps stdout empty so release JSON stdout stays parseable', () => {
    const run = spawnSync(process.execPath, [buildSw], { encoding: 'utf8', cwd: root });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/wrote public\/sw\.js/);
  });
});

describe('offline catalog age helpers', () => {
  const now = Date.parse('2026-10-15T22:00:00.000Z');

  it('parseCatalogUpdatedAt reads onto.catalog.v1 shape', () => {
    expect(parseCatalogUpdatedAt(null)).toBeNull();
    expect(parseCatalogUpdatedAt('{')).toBeNull();
    expect(parseCatalogUpdatedAt(JSON.stringify({ items: [] }))).toBeNull();
    expect(
      parseCatalogUpdatedAt(
        JSON.stringify({ items: [], updatedAt: '2026-10-15T20:00:00.000Z' }),
      ),
    ).toBe('2026-10-15T20:00:00.000Z');
  });

  it('catalogAgeMinutes floors elapsed minutes', () => {
    expect(catalogAgeMinutes(null, now)).toBeNull();
    expect(catalogAgeMinutes('not-a-date', now)).toBeNull();
    expect(catalogAgeMinutes('2026-10-15T20:00:00.000Z', now)).toBe(120);
    expect(catalogAgeMinutes('2026-10-15T21:59:30.000Z', now)).toBe(0);
    expect(catalogAgeMinutes('2026-10-15T23:00:00.000Z', now)).toBe(0);
  });
});

describe('sw offline navigation', () => {
  it('uses ignoreSearch and falls back to cached /index.html for navigations', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../public/sw.js'), 'utf8');
    expect(src).toContain("req.mode === 'navigate'");
    expect(src).toContain('ignoreSearch: true');
    expect(src).toContain("cache.match('/index.html'");
  });

  it('navigations are network-first; shell checks same-origin; critical precache fails install', () => {
    const src = fs.readFileSync(swOut, 'utf8');
    const nav = src.slice(src.indexOf("req.mode === 'navigate'"));
    expect(nav.indexOf('fetch(req).catch')).toBeLessThan(nav.indexOf('caches.open'));
    expect(src).toContain('u.origin !== self.location.origin');
    expect(src).toContain("Promise.all([cache.add('/'), cache.add('/index.html')])");
  });
});

describe('build-sw dist hashing', () => {
  const os = require('os') as typeof import('os');
  function runWithDist(index: string) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-sw-'));
    const dist = path.join(tmp, 'dist');
    fs.mkdirSync(path.join(dist, '_expo', 'static', 'js', 'web'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), index);
    fs.writeFileSync(path.join(dist, '_expo', 'static', 'js', 'web', 'entry-abc.js'), 'x');
    fs.mkdirSync(path.join(tmp, 'public'));
    const script = `
      import * as m from ${JSON.stringify(pathToFileURL(buildSw).href)};
      const r = m.build(${JSON.stringify(tmp)}, ${JSON.stringify(dist)});
      process.stdout.write(JSON.stringify(r));
    `;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(run.stderr);
    const r = JSON.parse(run.stdout) as { buildHash: string };
    const distSw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
    const publicSwWritten = fs.existsSync(path.join(tmp, 'public', 'sw.js'));
    fs.rmSync(tmp, { recursive: true, force: true });
    return { hash: r.buildHash, distSw, publicSwWritten };
  }

  it('hash changes when dist/index.html changes and only dist/sw.js is written', () => {
    const a = runWithDist('<html>a</html>');
    const a2 = runWithDist('<html>a</html>');
    const b = runWithDist('<html>b</html>');
    expect(a.hash).toBe(a2.hash);
    expect(a.hash).not.toBe(b.hash);
    expect(a.publicSwWritten).toBe(false);
    expect(a.distSw).toContain('/_expo/static/js/web/entry-abc.js');
  });
});
