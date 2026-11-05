/**
 * @jest-environment jsdom
 * @jest-environment-options {"url":"https://app.example.test/"}
 */

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
// A browser supplies URL itself; the native polyfill requires native modules.
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { SupabaseAuthBackend } from '../supabase-auth';
import { createOntoSupabaseClient, type OntoSupabaseClient } from '../supabase-client';

// jsdom does not provide Response; use the browser fetch polyfill already in Expo.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Headers, Response } = require('whatwg-fetch') as {
  Headers: typeof globalThis.Headers;
  Response: typeof globalThis.Response;
};

const PUBLIC_KEY = 'sb_publishable_fake_test_key';
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'apple-user@example.test',
  app_metadata: { provider: 'apple', providers: ['apple'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};

function fakeAccessToken(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: USER.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    aud: 'authenticated',
  })}.fake-signature`;
}

describe('web OAuth with the installed Supabase SDK', () => {
  const originalFetch = globalThis.fetch;
  const clients: OntoSupabaseClient[] = [];
  let sequence = 0;
  let projectUrl: string;
  let callbackToken: string;
  let userResponseStatus: number;
  let requests: { path: string; apiKey: string | null; bearer: string | null }[];

  function createClient(): OntoSupabaseClient {
    const client = createOntoSupabaseClient({ url: projectUrl, publishableKey: PUBLIC_KEY });
    clients.push(client);
    return client;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    projectUrl = `https://oauth-test-${++sequence}.supabase.co`;
    callbackToken = fakeAccessToken();
    userResponseStatus = 200;
    requests = [];
    const hash = new URLSearchParams({
      access_token: callbackToken,
      refresh_token: 'fake-refresh-token',
      expires_in: '3600',
      token_type: 'bearer',
    });
    window.history.replaceState(null, '', `/#${hash}`);
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== projectUrl) {
        throw new Error(`Unexpected request in offline OAuth test: ${url.origin}${url.pathname}`);
      }
      const headers = new Headers(init?.headers);
      requests.push({
        path: url.pathname,
        apiKey: headers.get('apikey'),
        bearer: headers.get('authorization'),
      });
      if (url.pathname === '/functions/v1/apple-account') {
        return new Response(JSON.stringify({ ready: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.pathname !== '/auth/v1/user') {
        throw new Error(`Unexpected request in offline OAuth test: ${url.origin}${url.pathname}`);
      }
      return new Response(JSON.stringify(userResponseStatus === 200 ? USER : { message: 'Invalid API key' }), {
        status: userResponseStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) await client.auth.dispose();
    globalThis.fetch = originalFetch;
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('accepts the callback once and restores the signed-in account after a remount', async () => {
    const client = createClient();
    const backend = new SupabaseAuthBackend(client);

    await expect(backend.getState()).resolves.toMatchObject({
      kind: 'signed-in',
      user: { id: USER.id, email: 'apple-user@example.test' },
      session: { accessToken: callbackToken },
    });
    expect(window.location.hash).toBe('');
    expect(requests.some(r => r.path === '/auth/v1/user')).toBe(true);

    await client.auth.dispose();
    const restored = new SupabaseAuthBackend(createClient());
    await expect(restored.getState()).resolves.toMatchObject({
      kind: 'signed-in',
      user: { id: USER.id },
      session: { accessToken: callbackToken },
    });
  });

  it('stays signed out when the callback user check is rejected', async () => {
    userResponseStatus = 401;
    const backend = new SupabaseAuthBackend(createClient());

    await expect(backend.getState()).resolves.toEqual({ kind: 'signed-out' });
    expect(requests.some(r => r.path === '/auth/v1/user')).toBe(true);
  });

  it('accepts a later valid session after a rejected callback', async () => {
    userResponseStatus = 401;
    const client = createClient();
    const backend = new SupabaseAuthBackend(client);
    await expect(backend.getState()).resolves.toEqual({ kind: 'signed-out' });

    userResponseStatus = 200;
    const result = await client.auth.setSession({
      access_token: callbackToken,
      refresh_token: 'fake-refresh-token',
    });
    expect(result.error).toBeNull();
    await expect(backend.getState()).resolves.toMatchObject({
      kind: 'signed-in',
      user: { id: USER.id },
    });
  });
});
