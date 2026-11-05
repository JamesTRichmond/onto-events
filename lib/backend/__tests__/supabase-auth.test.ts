import type { Session } from '@supabase/supabase-js';

import { BackendError, type AuthState } from '../contracts';
import {
  SupabaseAuthBackend,
  authStateFromSession,
  toBackendError,
} from '../supabase-auth';
import type { OntoSupabaseClient } from '../supabase-client';

function session(): Session {
  return {
    access_token: 'access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1_788_370_200,
    refresh_token: 'refresh-token',
    user: {
      id: 'user-1',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-09-02T20:00:00.000Z',
      email: 'james@example.com',
    },
  };
}

function appleSession(): Session {
  const current = session();
  current.user.identities = [{ id: 'identity', identity_id: 'identity', user_id: current.user.id, provider: 'apple', created_at: '', updated_at: '', identity_data: { sub: 'apple-subject' } }];
  return current;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

function authClient(overrides: Record<string, unknown> = {}) {
  const subscription = { unsubscribe: jest.fn() };
  const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
  const auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithOtp: jest.fn().mockResolvedValue({ data: {}, error: null }),
    verifyOtp: jest.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription } }),
    ...overrides,
  };

  return {
    auth,
    rpc,
    subscription,
    client: { auth, rpc, functions: { invoke: jest.fn().mockResolvedValue({ data: { ok: true, deleted: true }, error: null }) } } as unknown as OntoSupabaseClient,
  };
}

describe('authStateFromSession', () => {
  it('keeps accountless discovery signed out when no session exists', () => {
    expect(authStateFromSession(null)).toEqual({ kind: 'signed-out' });
  });

  it('maps the minimum safe user and session fields', () => {
    expect(authStateFromSession(session())).toEqual({
      kind: 'signed-in',
      user: {
        id: 'user-1',
        email: 'james@example.com',
        createdAt: '2026-09-02T20:00:00.000Z',
      },
      session: {
        userId: 'user-1',
        accessToken: 'access-token',
        expiresAt: '2026-09-02T17:30:00.000Z',
      },
    });
  });
});

describe('SupabaseAuthBackend', () => {
  it('reads the current session', async () => {
    const currentSession = session();
    const { client } = authClient({
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: currentSession }, error: null }),
    });

    await expect(new SupabaseAuthBackend(client).getState()).resolves.toEqual(
      authStateFromSession(currentSession),
    );
  });

  it('normalizes email and sends a magic link to the app redirect', async () => {
    const { client, auth } = authClient();
    const backend = new SupabaseAuthBackend(client, 'onto://auth/callback');

    await backend.signInWithEmail('  JAMES@EXAMPLE.COM  ');

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'james@example.com',
      options: { emailRedirectTo: 'onto://auth/callback' },
    });
  });

  it('rejects invalid email before making a network request', async () => {
    const { client, auth } = authClient();

    await expect(new SupabaseAuthBackend(client).signInWithEmail('not-email')).rejects.toMatchObject({
      code: 'invalid-input',
      message: 'Enter a valid email address',
    });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('verifies the email code without storing a password', async () => {
    const { client, auth } = authClient();
    const backend = new SupabaseAuthBackend(client);

    await backend.verifyEmailOtp(' JAMES@EXAMPLE.COM ', ' 123456 ');

    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'james@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('rejects a malformed email code before making a network request', async () => {
    const { client, auth } = authClient();

    await expect(
      new SupabaseAuthBackend(client).verifyEmailOtp('james@example.com', '12ab'),
    ).rejects.toMatchObject({
      code: 'invalid-input',
      message: 'Enter the 6-digit code from your email',
    });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('translates provider errors into the stable backend error contract', async () => {
    const { client } = authClient({
      signInWithOtp: jest.fn().mockResolvedValue({
        data: {},
        error: { status: 429, message: 'Too many requests' },
      }),
    });

    await expect(
      new SupabaseAuthBackend(client).signInWithEmail('james@example.com'),
    ).rejects.toMatchObject({
      code: 'rate-limited',
      message: 'Too many requests',
    });
  });

  it('signs out only this device and clears its persisted session', async () => {
    const { client, auth } = authClient();

    await new SupabaseAuthBackend(client).signOut();

    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('deletes the database account before clearing the local session', async () => {
    const { client, auth, rpc } = authClient({ getSession: jest.fn().mockResolvedValue({ data: { session: session() }, error: null }) });

    await new SupabaseAuthBackend(client).deleteAccount('user-1');

    expect(rpc).toHaveBeenCalledWith('delete_my_account', { expected_user_id: 'user-1' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not clear the local session when deletion is not confirmed', async () => {
    const { client, auth, rpc } = authClient({ getSession: jest.fn().mockResolvedValue({ data: { session: session() }, error: null }) });
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(new SupabaseAuthBackend(client).deleteAccount('user-1')).rejects.toMatchObject({
      code: 'server',
      message: 'Account deletion was not confirmed',
    });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('forwards auth changes and releases the subscription', () => {
    const { client, auth, subscription } = authClient();
    const listener = jest.fn<void, [AuthState]>();
    const unsubscribe = new SupabaseAuthBackend(client).onStateChange(listener);
    const callback = auth.onAuthStateChange.mock.calls[0][0];

    callback('SIGNED_IN', session());
    expect(listener).toHaveBeenCalledWith(authStateFromSession(session()));

    unsubscribe();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('toBackendError', () => {
  it('preserves an existing BackendError', () => {
    const error = new BackendError('forbidden', 'No access');
    expect(toBackendError(error, 'fallback')).toBe(error);
  });

  it('shows an actionable expired-code message before the provider status fallback', () => {
    expect(
      toBackendError(
        { code: 'otp_expired', status: 403, message: 'Token has expired' },
        'fallback',
      ),
    ).toMatchObject({
      code: 'invalid-input',
      message: 'That code expired. Request a new six-digit code.',
    });
  });

  it('turns auth send limits into a retry-later state', () => {
    expect(
      toBackendError(
        { code: 'over_email_send_rate_limit', status: 429 },
        'fallback',
      ),
    ).toMatchObject({
      code: 'rate-limited',
      message: 'Too many attempts. Wait a few minutes and try again.',
    });
  });

  it.each([
    ['42501', 'forbidden'],
    ['23505', 'conflict'],
    ['23503', 'invalid-input'],
    ['PGRST116', 'not-found'],
    ['PGRST301', 'not-authenticated'],
  ])('maps PostgREST code %s to %s', (providerCode, backendCode) => {
    expect(
      toBackendError({ code: providerCode, message: 'Provider error' }, 'fallback'),
    ).toMatchObject({ code: backendCode });
  });

  it('recognizes transport failures without exposing provider types', () => {
    expect(toBackendError(new Error('Failed to fetch'), 'fallback')).toMatchObject({
      code: 'network',
      message: 'Failed to fetch',
    });
  });
});

describe('Apple token sign-in', () => {
  it('uses the provider token and raw nonce without a name or email merge', async () => {
    const signInWithIdToken = jest.fn().mockResolvedValue({ data: { session: session() }, error: null });
    const { client } = authClient({ signInWithIdToken });
    await new SupabaseAuthBackend(client).signInWithApple({ token: 'apple-token', nonce: 'n'.repeat(32), authorizationCode: 'code' });
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-token', nonce: 'n'.repeat(32) });
  });
  it('rejects a missing nonce before contacting the provider', async () => {
    const signInWithIdToken = jest.fn();
    const { client } = authClient({ signInWithIdToken });
    await expect(new SupabaseAuthBackend(client).signInWithApple({ token: 'apple-token', nonce: '' })).rejects.toMatchObject({ code: 'invalid-input' });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });
});

it('revokes an Apple-linked account through the server before clearing the session', async () => {
  const appleSession = session(); appleSession.user.identities = [{ id: 'identity', identity_id: 'identity', user_id: appleSession.user.id, provider: 'apple', created_at: '', updated_at: '', identity_data: { sub: 'apple-subject' } }];
  const { client, rpc, auth } = authClient({ getSession: jest.fn().mockResolvedValue({ data: { session: appleSession }, error: null }) });
  await new SupabaseAuthBackend(client).deleteAccount('user-1');
  expect(client.functions.invoke).toHaveBeenCalledWith('apple-account', { headers: { Authorization: 'Bearer access-token' }, body: { action: 'delete', expectedUserId: 'user-1' } });
  expect(rpc).not.toHaveBeenCalled(); expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

describe('account setup and deletion isolation', () => {
  it.each([false, true])('hides callbacks and state reads until Apple registration completes (missing identities: %s)', async missingIdentities => {
    const apple = appleSession();
    if (missingIdentities) delete apple.user.identities;
    const registration = deferred<{ data: { ok: boolean }; error: null }>();
    let callback!: (_event: string, current: Session | null) => void;
    const { client } = authClient({
      getSession: jest.fn().mockResolvedValue({ data: { session: apple }, error: null }),
      onAuthStateChange: jest.fn(listener => { callback = listener; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
      signInWithIdToken: jest.fn(async () => { callback('SIGNED_IN', apple); return { data: { session: apple }, error: null }; }),
    });
    (client.functions.invoke as jest.Mock).mockReturnValue(registration.promise);
    const backend = new SupabaseAuthBackend(client);
    const listener = jest.fn();
    backend.onStateChange(listener);
    const operation = backend.signInWithApple({ token: 'apple-token', nonce: 'n'.repeat(32), authorizationCode: 'code' });
    await Promise.resolve(); await Promise.resolve();
    await expect(backend.getState()).resolves.toEqual({ kind: 'loading' });
    expect(listener.mock.calls.some(([state]) => state.kind === 'signed-in')).toBe(false);
    registration.resolve({ data: { ok: true }, error: null });
    await operation;
    expect(client.functions.invoke).toHaveBeenCalledWith('apple-account', {
      headers: { Authorization: 'Bearer access-token' },
      body: { action: 'register', expectedUserId: 'user-1', authorizationCode: 'code' },
    });
    expect(listener).toHaveBeenLastCalledWith(authStateFromSession(apple));
  });

  it('fails closed after registration failure even when local sign-out fails', async () => {
    const apple = appleSession();
    const { client, auth } = authClient({
      getSession: jest.fn().mockResolvedValue({ data: { session: apple }, error: null }),
      signInWithIdToken: jest.fn().mockResolvedValue({ data: { session: apple }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: { status: 503 } }),
    });
    (client.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: new Error('unavailable') });
    const backend = new SupabaseAuthBackend(client);
    const listener = jest.fn(); backend.onStateChange(listener);
    await expect(backend.signInWithApple({ token: 'apple-token', nonce: 'n'.repeat(32), authorizationCode: 'code' })).rejects.toMatchObject({ code: 'server' });
    await expect(backend.getState()).resolves.toEqual({ kind: 'signed-out' });
    expect(listener.mock.calls.some(([state]) => state.kind === 'signed-in')).toBe(false);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    // A fresh backend cannot trust the residual persisted session either.
    await expect(new SupabaseAuthBackend(client).getState()).resolves.toEqual({ kind: 'signed-out' });
    expect(client.functions.invoke).toHaveBeenLastCalledWith('apple-account', {
      headers: { Authorization: 'Bearer access-token' }, body: { action: 'status', expectedUserId: 'user-1' },
    });
  });

  it('does not clear a newly selected account after a late Apple setup failure', async () => {
    const apple = appleSession(); const other = session(); other.user.id = 'user-2'; other.access_token = 'other-token';
    let current = apple;
    const registration = deferred<{ data: null; error: Error }>();
    const { client, auth } = authClient({
      getSession: jest.fn(async () => ({ data: { session: current }, error: null })),
      signInWithIdToken: jest.fn().mockResolvedValue({ data: { session: apple }, error: null }),
    });
    (client.functions.invoke as jest.Mock).mockReturnValue(registration.promise);
    const backend = new SupabaseAuthBackend(client);
    const operation = backend.signInWithApple({ token: 'apple-token', nonce: 'n'.repeat(32), authorizationCode: 'code' });
    await Promise.resolve(); await Promise.resolve();
    current = other;
    registration.resolve({ data: null, error: new Error('unavailable') });
    await expect(operation).rejects.toMatchObject({ code: 'server' });
    expect(auth.signOut).not.toHaveBeenCalled();
    await expect(backend.getState()).resolves.toEqual(authStateFromSession(other));
  });

  it('does not clear a newer token for the same user after a late Apple setup failure', async () => {
    const apple = appleSession(); const refreshed = appleSession(); refreshed.access_token = 'new-token';
    let current = apple;
    const registration = deferred<{ data: null; error: Error }>();
    const { client, auth } = authClient({
      getSession: jest.fn(async () => ({ data: { session: current }, error: null })),
      signInWithIdToken: jest.fn().mockResolvedValue({ data: { session: apple }, error: null }),
    });
    (client.functions.invoke as jest.Mock).mockImplementation((_name, options) => options.body.action === 'register' ? registration.promise : Promise.resolve({ data: { ready: false }, error: null }));
    const backend = new SupabaseAuthBackend(client);
    const operation = backend.signInWithApple({ token: 'apple-token', nonce: 'n'.repeat(32), authorizationCode: 'code' });
    await Promise.resolve(); await Promise.resolve();
    current = refreshed;
    registration.resolve({ data: null, error: new Error('unavailable') });
    await expect(operation).rejects.toMatchObject({ code: 'server' });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(current.access_token).toBe('new-token');
  });

  it('checks startup Apple readiness from trusted provider metadata when identities are absent', async () => {
    const apple = appleSession(); delete apple.user.identities; apple.user.app_metadata = { providers: ['email', 'apple'] };
    const { client } = authClient({ getSession: jest.fn().mockResolvedValue({ data: { session: apple }, error: null }) });
    (client.functions.invoke as jest.Mock).mockResolvedValue({ data: { ready: false }, error: null });
    await expect(new SupabaseAuthBackend(client).getState()).resolves.toEqual({ kind: 'signed-out' });
    expect(client.functions.invoke).toHaveBeenCalledWith('apple-account', {
      headers: { Authorization: 'Bearer access-token' }, body: { action: 'status', expectedUserId: 'user-1' },
    });
  });

  it('shares readiness with every subscriber and releases the provider listener after the last unsubscribe', async () => {
    const apple = appleSession();
    const { client, auth, subscription } = authClient({ getSession: jest.fn().mockResolvedValue({ data: { session: apple }, error: null }) });
    (client.functions.invoke as jest.Mock).mockResolvedValue({ data: { ready: true }, error: null });
    const backend = new SupabaseAuthBackend(client); const one = jest.fn(); const two = jest.fn();
    const stopOne = backend.onStateChange(one); const stopTwo = backend.onStateChange(two);
    auth.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', apple);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(one).toHaveBeenLastCalledWith(authStateFromSession(apple));
    expect(two).toHaveBeenLastCalledWith(authStateFromSession(apple));
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    stopOne(); expect(subscription.unsubscribe).not.toHaveBeenCalled();
    stopTwo(); expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not publish a delayed startup Apple readiness result after another account signs in', async () => {
    const apple = appleSession(); const other = session(); other.user.id = 'user-2'; other.access_token = 'other-token';
    let current = apple;
    const status = deferred<{ data: { ready: boolean }; error: null }>();
    const { client, auth } = authClient({ getSession: jest.fn(async () => ({ data: { session: current }, error: null })) });
    (client.functions.invoke as jest.Mock).mockReturnValue(status.promise);
    const backend = new SupabaseAuthBackend(client); const listener = jest.fn(); backend.onStateChange(listener);
    const callback = auth.onAuthStateChange.mock.calls[0][0];
    callback('INITIAL_SESSION', apple);
    await Promise.resolve();
    current = other; callback('SIGNED_IN', other);
    status.resolve({ data: { ready: true }, error: null });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(listener).toHaveBeenLastCalledWith(authStateFromSession(other));
    expect(listener.mock.calls.some(([state]) => state.kind === 'signed-in' && state.user.id === 'user-1')).toBe(false);
  });

  it('rejects deletion when the session changed after the confirmation', async () => {
    const other = session(); other.user.id = 'user-2';
    const { client, rpc, auth } = authClient({ getSession: jest.fn().mockResolvedValue({ data: { session: other }, error: null }) });
    await expect(new SupabaseAuthBackend(client).deleteAccount('user-1')).rejects.toMatchObject({ code: 'conflict' });
    expect(rpc).not.toHaveBeenCalled(); expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('keeps a switched session after confirmed deletion finishes', async () => {
    const owner = session(); const other = session(); other.user.id = 'user-2'; other.access_token = 'other-token';
    let current = owner;
    const deletion = deferred<{ data: boolean; error: null }>();
    const { client, rpc, auth } = authClient({ getSession: jest.fn(async () => ({ data: { session: current }, error: null })) });
    rpc.mockReturnValue(deletion.promise);
    const backend = new SupabaseAuthBackend(client);
    const operation = backend.deleteAccount('user-1');
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { expected_user_id: 'user-1' });
    current = other; deletion.resolve({ data: true, error: null }); await operation;
    expect(auth.signOut).not.toHaveBeenCalled();
    await expect(backend.getState()).resolves.toEqual(authStateFromSession(other));
  });

  it('serializes conditional cleanup against a queued new sign-in', async () => {
    const owner = session(); const other = session(); other.user.id = 'user-2';
    let current = owner;
    const cleanup = deferred<{ error: null }>();
    const { client, auth } = authClient({
      getSession: jest.fn(async () => ({ data: { session: current }, error: null })),
      signOut: jest.fn(() => cleanup.promise),
      verifyOtp: jest.fn(async () => { current = other; return { data: {}, error: null }; }),
    });
    const backend = new SupabaseAuthBackend(client);
    const out = backend.signOutIfCurrent('user-1');
    await Promise.resolve(); await Promise.resolve();
    const next = backend.verifyEmailOtp('other@example.com', '123456');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    cleanup.resolve({ error: null }); await out; await next;
    expect(current.user.id).toBe('user-2');
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
