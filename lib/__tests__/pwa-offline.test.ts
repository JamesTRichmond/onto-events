/**
 * W1/W2 gap tests: root SW registration, offline cached-shell boot, routing.
 * Complements pwa-shell.test.ts (install detection) and pwa-sw.test.ts (generator).
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const root = path.join(__dirname, '..', '..');
const ORIGIN = 'https://onto.events';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
const swSource = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

// ---------- registration ----------

function loadRegister(os: string) {
  let mod: typeof import('../../hooks/use-offline-catalog');
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Platform: { OS: os },
      AppState: { addEventListener: () => ({ remove() {} }) },
    }));
    jest.doMock('@/lib/storage', () => ({
      getItem: async () => null,
      onOntoDataErased: () => () => {},
      STORAGE_KEYS: { catalog: 'onto.catalog.v1' },
    }));
    mod = require('../../hooks/use-offline-catalog');
  });
  return mod!.registerOntoServiceWorker;
}

describe('registerOntoServiceWorker', () => {
  const realNavigator = (globalThis as any).navigator;
  const setNavigator = (nav: any) =>
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  afterEach(() => setNavigator(realNavigator));

  it('registers /sw.js once on web (idempotent)', async () => {
    const register = jest.fn(() => Promise.resolve({ scope: '/' }));
    setNavigator({ serviceWorker: { register } });
    const reg = loadRegister('web');
    const a = reg();
    const b = reg();
    expect(a).toBe(b);
    await a;
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('returns null without throwing when serviceWorker is unsupported', () => {
    setNavigator({ userAgent: 'old-browser' });
    expect(loadRegister('web')()).toBeNull();
  });

  it('is a no-op on native platforms', () => {
    const register = jest.fn(() => Promise.resolve());
    setNavigator({ serviceWorker: { register } });
    expect(loadRegister('ios')()).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('swallows a registration failure and allows a later retry', async () => {
    const register = jest
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('SecurityError')))
      .mockImplementation(() => Promise.resolve({}));
    setNavigator({ serviceWorker: { register } });
    const reg = loadRegister('web');
    await expect(reg()).resolves.toBeUndefined();
    await reg();
    expect(register).toHaveBeenCalledTimes(2);
  });
});

// ---------- minimal SW global ----------

type Res = { ok: boolean; body: string; clone(): Res; text(): Promise<string> };
const mkRes = (body: string, ok = true): Res =>
  ({ ok, body, clone: () => mkRes(body, ok), text: async () => body });
const mkReq = (p: string, mode = 'navigate') => ({ url: ORIGIN + p, method: 'GET', mode });
const keyOf = (r: any) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);

function bootSW(opts: { online: boolean; source?: string; stores?: Map<string, Map<string, Res>> }) {
  const stores = opts.stores ?? new Map<string, Map<string, Res>>();
  const listeners: Record<string, (e: any) => void> = {};
  const net = { online: opts.online };
  const fetchMock = jest.fn(async (r: any) => {
    if (!net.online) throw new TypeError('Failed to fetch');
    return mkRes('net:' + new URL(keyOf(r)).pathname);
  });
  const openStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const s = stores.get(name)!;
    return {
      add: async (r: any) => { s.set(keyOf(r), await fetchMock(r)); },
      put: async (r: any, res: Res) => { s.set(keyOf(r), res); },
      // Real Cache.match compares the full URL incl. query unless ignoreSearch.
      match: async (r: any, o?: { ignoreSearch?: boolean }) => {
        const k = keyOf(r);
        if (s.has(k)) return s.get(k);
        if (o?.ignoreSearch) {
          const bare = k.split('?')[0];
          for (const [kk, v] of s) if (kk.split('?')[0] === bare) return v;
        }
        return undefined;
      },
    };
  };
  const caches = {
    open: async (n: string) => openStore(n),
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (r: any, o?: any) => {
      if (o?.cacheName) return stores.has(o.cacheName) ? openStore(o.cacheName).match(r, o) : undefined;
      for (const n of stores.keys()) { const hit = await openStore(n).match(r, o); if (hit) return hit; }
      return undefined;
    },
  };
  const self: any = {
    addEventListener: (t: string, fn: any) => { listeners[t] = fn; },
    skipWaiting: jest.fn(async () => {}),
    clients: { claim: jest.fn(async () => {}) },
  };
  self.location = { origin: ORIGIN };
  vm.runInNewContext(opts.source ?? swSource, {
    self, caches, fetch: fetchMock, URL, Promise, console, JSON,
    Response: function (body: string) { return mkRes(body); },
  });

  const lifecycle = async (type: string) => {
    let p: Promise<any> = Promise.resolve();
    listeners[type]({ waitUntil: (x: Promise<any>) => { p = x; } });
    await p;
  };
  const request = async (req: any): Promise<Res | undefined> => {
    let p: Promise<Res> | undefined;
    listeners.fetch({ request: req, respondWith: (x: Promise<Res>) => { p = Promise.resolve(x); } });
    return p;
  };
  return { stores, net, self, lifecycle, request, fetchMock };
}

describe('offline shell boot (public/sw.js)', () => {
  it('install precaches "/" and /index.html, then skipWaiting', async () => {
    const sw = bootSW({ online: true });
    await sw.lifecycle('install');
    const [name, store] = [...sw.stores.entries()][0];
    expect(name).toMatch(/^onto-shell-[0-9a-f]+$/);
    expect(store.has(ORIGIN + '/')).toBe(true);
    expect(store.has(ORIGIN + '/index.html')).toBe(true);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it('serves the cached shell for "/" when the network is off', async () => {
    const sw = bootSW({ online: true });
    await sw.lifecycle('install');
    sw.net.online = false;
    const res = await sw.request(mkReq('/'));
    expect(res?.body).toBe('net:/');
  });

  it('activate keeps exactly one previous onto-shell-* cache and claims clients', async () => {
    const sw = bootSW({ online: true });
    sw.stores.set('onto-shell-old', new Map());
    sw.stores.set('unrelated', new Map());
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect(sw.stores.has('onto-shell-old')).toBe(true);
    expect(sw.stores.has('unrelated')).toBe(true);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  // BUG (W2): cache.match without ignoreSearch misses '/?source=pwa'. it.failing flips red once fixed.
  it('boots offline from the manifest start_url (/?source=pwa)', async () => {
    const sw = bootSW({ online: true });
    await sw.lifecycle('install');
    sw.net.online = false;
    await expect(sw.request(mkReq(manifest.start_url))).resolves.toBeDefined();
  });

  // BUG (W2): navigations to non-shell paths are network-only; no index.html fallback offline.
  it('boots offline on an SPA deep link (navigation falls back to cached shell)', async () => {
    const sw = bootSW({ online: true });
    await sw.lifecycle('install');
    sw.net.online = false;
    await expect(sw.request(mkReq('/privacy'))).resolves.toBeDefined();
  });
});

describe('auth / Supabase requests are network-only', () => {
  const urls = [
    'https://abc.supabase.co/auth/v1/token?grant_type=refresh_token',
    'https://abc.supabase.co/rest/v1/events?select=*',
    'https://abc.supabase.co/functions/v1/sync',
    ORIGIN + '/auth/v1/user',
  ];
  it.each(urls)('never served from cache, even if a copy exists and offline: %s', async (u) => {
    const sw = bootSW({ online: true });
    await sw.lifecycle('install');
    const shell = [...sw.stores.values()][0];
    shell.set(u, mkRes('POISONED'));
    sw.net.online = false;
    await expect(sw.request({ url: u, method: 'GET', mode: 'cors' })).rejects.toThrow('Failed to fetch');
    sw.net.online = true;
    const before = shell.size;
    const res = await sw.request({ url: u, method: 'GET', mode: 'cors' });
    expect(res?.body).not.toBe('POISONED');
    expect(shell.size).toBe(before);
  });
});

// ---------- routing ----------

describe('routing', () => {
  it('_redirects SPA fallback is the only rule and is a 200 rewrite (not 301/302)', () => {
    const lines = fs.readFileSync(path.join(root, 'public/_redirects'), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lines).toEqual(['/* /index.html 200']);
  });

  it('manifest start_url lies inside scope and id', () => {
    expect(manifest.scope).toBe('/');
    const start = new URL(manifest.start_url, ORIGIN);
    expect(start.origin).toBe(ORIGIN);
    expect(start.pathname.startsWith(manifest.scope)).toBe(true);
    expect(start.searchParams.get('source')).toBe('pwa');
  });
});

// ---------- shell generations: keep current + one previous ----------

describe('activate keeps the previous shell for one generation', () => {
  const gen = (h: string) => swSource.replace(/onto-shell-[0-9a-f]+/g, 'onto-shell-' + h);
  const shells = (st: Map<string, unknown>) => [...st.keys()].filter((k) => k.startsWith('onto-shell-')).sort();
  async function deploy(stores: Map<string, Map<string, Res>>, h: string) {
    const sw = bootSW({ online: true, source: gen(h), stores });
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    return sw;
  }

  it('keeps cur+prev and deletes anything older; next generation evicts the oldest', async () => {
    const stores = new Map<string, Map<string, Res>>();
    await deploy(stores, 'a');
    expect(shells(stores)).toEqual(['onto-shell-a']);
    await deploy(stores, 'b');
    expect(shells(stores)).toEqual(['onto-shell-a', 'onto-shell-b']);
    await deploy(stores, 'c');
    expect(shells(stores)).toEqual(['onto-shell-b', 'onto-shell-c']);
    stores.set('onto-shell-stray', new Map());
    await deploy(stores, 'd');
    expect(shells(stores)).toEqual(['onto-shell-c', 'onto-shell-d']);
  });

  it('re-activating the same build keeps its recorded prev', async () => {
    const stores = new Map<string, Map<string, Res>>();
    await deploy(stores, 'a');
    await deploy(stores, 'b');
    await deploy(stores, 'b');
    expect(shells(stores)).toEqual(['onto-shell-a', 'onto-shell-b']);
  });

  it('a kill mid-activate never leaves meta naming a deleted shell', async () => {
    const stores = new Map<string, Map<string, Res>>();
    await deploy(stores, 'a');
    await deploy(stores, 'b');
    const del = stores.delete.bind(stores);
    stores.delete = () => { throw new Error('killed'); };
    const sw = bootSW({ online: true, source: gen('c'), stores });
    await sw.lifecycle('install');
    await expect(sw.lifecycle('activate')).rejects.toThrow('killed');
    stores.delete = del;
    await deploy(stores, 'd');
    expect(shells(stores)).toEqual(['onto-shell-c', 'onto-shell-d']);
  });

  it('a hashed chunk missing from cur is served from prev before network', async () => {
    const stores = new Map<string, Map<string, Res>>();
    await deploy(stores, 'a');
    const chunk = ORIGIN + '/_expo/static/js/web/entry-old.js';
    stores.get('onto-shell-a')!.set(chunk, mkRes('old-chunk'));
    const sw = await deploy(stores, 'b');
    sw.net.online = false;
    const res = await sw.request({ url: chunk, method: 'GET', mode: 'no-cors' });
    expect(res?.body).toBe('old-chunk');
    expect(stores.get('onto-shell-b')!.has(chunk)).toBe(false);
  });

  it('non-hashed shell paths skip prev and go to network', async () => {
    const stores = new Map<string, Map<string, Res>>();
    await deploy(stores, 'a');
    stores.get('onto-shell-a')!.set(ORIGIN + '/icons/x.png', mkRes('old-icon'));
    const sw = await deploy(stores, 'b');
    const res = await sw.request({ url: ORIGIN + '/icons/x.png', method: 'GET', mode: 'no-cors' });
    expect(res?.body).toBe('net:/icons/x.png');
  });
});
