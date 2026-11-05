import fs from 'node:fs';
import path from 'node:path';

import type { AccountModule, BackendModules } from '../backend/contracts';
import { STORAGE_KEYS, STORAGE_PREFIXES } from '../storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

/**
 * App-side guards for the future presence contract (James, Q6:B,
 * 2026-09-14 — see SAFETY.md). Legacy backend/schema presence is incompatible
 * and dormant, not absent. These guards do not certify its SQL policies.
 */

// Scan from the root so new runtime directories are included automatically.
const EXCLUDED_DIRS = new Set([
  'node_modules', '__tests__', 'docs', 'scripts', 'supabase', 'dist', 'coverage',
  'GitHub - onto', 'onto-deploy', 'onto-foundation', 'onto.events', 'onto - All Local Files',
  '.scratch', 'City_Expansion_Loop_Plans',
]);

function sourceFiles(dir: string): string[] {
  const root = path.join(process.cwd(), dir);
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|d)\.ts(x)?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

const ALL_SOURCE = sourceFiles('.');
const relative = (file: string) => path.relative(process.cwd(), file);
const readSource = (file: string) => fs.readFileSync(file, 'utf8');
const LEGACY_PRESENCE_FILES = new Set([
  'lib/backend/contracts.ts', 'lib/backend/supabase-backend.ts',
]);

describe('the data ledger stays complete', () => {
  it('has app source to scan (guards against a silently empty sweep)', () => {
    expect(ALL_SOURCE.length).toBeGreaterThan(20);
    expect(ALL_SOURCE.map(relative)).toEqual(expect.arrayContaining([
      'constants/theme.ts', 'assets/fonts/license.ts',
    ]));
  });

  // eraseOntoData() sweeps the 'onto.' prefix rather than a hand-kept list, so
  // a key added tomorrow is erased too — but only if it carries the prefix.
  it('prefixes app-owned manifest keys with onto. (SDK auth storage is separate)', () => {
    const values = [...Object.values(STORAGE_KEYS), ...Object.values(STORAGE_PREFIXES)];
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value.startsWith('onto.')).toBe(true);
  });

  it('lists every app-owned static key and dynamic family in the ledger', () => {
    const ledger = fs.readFileSync(path.join(process.cwd(), 'SAFETY.md'), 'utf8');
    for (const key of Object.values(STORAGE_KEYS)) expect(ledger).toContain(`\`${key}\``);
    for (const prefix of Object.values(STORAGE_PREFIXES)) expect(ledger).toContain(`\`${prefix}*\``);
    expect(ledger).toContain('sb-<project-ref>-auth-token');
  });

  it('allows raw persistence only in the wrapper and the documented SDK auth adapter', () => {
    const allowed = new Set(['lib/storage.ts', 'lib/backend/supabase-client.ts']);
    const rawStorage = /@react-native-async-storage\/async-storage|\b(?:localStorage|sessionStorage)\s*(?:\.|\[)/;
    expect(ALL_SOURCE.filter((file) =>
      !allowed.has(relative(file)) && rawStorage.test(readSource(file))).map(relative)).toEqual([]);
  });

  it('holds no key for presence, a friend list, or a last-seen time', () => {
    const names = [...Object.keys(STORAGE_KEYS), ...Object.keys(STORAGE_PREFIXES)];
    const values = [...Object.values(STORAGE_KEYS), ...Object.values(STORAGE_PREFIXES)];
    const forbidden = /presence|friend|lastseen|last_seen|checkin|check_in|nearby|whereabouts/i;
    expect(names.filter((n) => forbidden.test(n))).toEqual([]);
    expect(values.filter((v) => forbidden.test(v))).toEqual([]);
  });

  // The location writer's payload is tested in use-location-choice.test.tsx;
  // key names alone cannot establish that coordinates are never persisted.
});

describe('no continuous or retrospective presence is consumed by the app', () => {
  // A share is sharer-initiated, event-scoped and expiring. These identifiers
  // are the shapes that quietly turn it into something else.
  it.each([
    ['last-seen timestamps', /\blastSeen\b|\blast_seen\b/],
    ['friend lists', /\bfriendList\b|\bfriendIds\b|\bfriends\s*:/],
    ['check-ins', /\bcheckIn\b|\bcheckedInAt\b/],
    ['continuous presence feeds', /\bpresenceFeed\b|\bsubscribeToPresence\b/],
  ])('declares no %s anywhere in app source', (_label, pattern) => {
    const offenders = ALL_SOURCE.filter((file) => pattern.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps the legacy presence APIs and table references inside their existing backend files', () => {
    const legacy = /\b(?:PresenceBackend|UserPresence|SetPresenceInput|PresenceVisibility|validatePresence|mapPresence|getMyPresence|setMyPresence|clearMyPresence|getPublicPresence|user_presence)\b/;
    expect(ALL_SOURCE.filter((file) =>
      !LEGACY_PRESENCE_FILES.has(relative(file)) && legacy.test(readSource(file))).map(relative)).toEqual([]);
  });

  it('exposes catalog, accounts and explicitly approved moderation capabilities, with no presence port', () => {
    const modules: Record<keyof BackendModules, true> = { catalog: true, account: true, publicReviews: true };
    const account: Record<keyof AccountModule, true> = { auth: true, rsvp: true, start: true, hosting: true, reviews: true, reviewer: true, profile: true, communityForAccount: true, privateForAccount: true };
    expect(Object.keys(modules)).toEqual(['catalog', 'account', 'publicReviews']);
    expect(Object.keys(account)).toEqual(['auth', 'rsvp', 'start', 'hosting', 'reviews', 'reviewer', 'profile', 'communityForAccount', 'privateForAccount']);
  });
});
