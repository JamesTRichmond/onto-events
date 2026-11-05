import type { Session } from '@supabase/supabase-js';

import { BackendError, type AuthBackend, type AuthState } from './contracts';
import type { OntoSupabaseClient } from './supabase-client';

type SupabaseErrorLike = {
  code?: string;
  name?: string;
  message?: string;
  status?: number;
};

export function toBackendError(
  error: unknown,
  fallbackMessage: string,
): BackendError {
  if (error instanceof BackendError) return error;

  const value = (error ?? {}) as SupabaseErrorLike;
  const message = value.message || fallbackMessage;

  // Auth uses status400 for a missing session. Treat it as authentication
  // failure so a pending plan is retried rather than dropped as invalid input.
  if (value.code === 'session_not_found' || value.name === 'AuthSessionMissingError') {
    return new BackendError('not-authenticated', message, error);
  }

  if (value.code === 'otp_expired') {
    return new BackendError(
      'invalid-input',
      'That code expired. Request a new six-digit code.',
      error,
    );
  }
  if (
    value.code === 'over_email_send_rate_limit' ||
    value.code === 'over_request_rate_limit'
  ) {
    return new BackendError(
      'rate-limited',
      'Too many attempts. Wait a few minutes and try again.',
      error,
    );
  }

  if (value.status === 401)
    return new BackendError('not-authenticated', message, error);
  if (value.status === 403)
    return new BackendError('forbidden', message, error);
  if (value.status === 404)
    return new BackendError('not-found', message, error);
  if (value.status === 409) return new BackendError('conflict', message, error);
  if (value.status === 400 || value.status === 422) {
    return new BackendError('invalid-input', message, error);
  }
  if (value.status === 429)
    return new BackendError('rate-limited', message, error);
  if (value.status != null && value.status >= 500) {
    return new BackendError('server', message, error);
  }

  // PostgREST errors carry SQLSTATE/PGRST codes; the HTTP status is not
  // included on the error object returned by supabase-js.
  if (value.code === 'PGRST301' || value.code === '28000') {
    return new BackendError('not-authenticated', message, error);
  }
  if (value.code === '42501') {
    return new BackendError('forbidden', message, error);
  }
  if (value.code === 'PGRST116') {
    return new BackendError('not-found', message, error);
  }
  if (value.code === '23505') {
    return new BackendError('conflict', message, error);
  }
  if (['23502', '23503', '23514', '22P02'].includes(value.code ?? '')) {
    return new BackendError('invalid-input', message, error);
  }
  if (
    value.code === 'NETWORK_ERROR' ||
    /network|fetch failed|failed to fetch/i.test(message)
  ) {
    return new BackendError('network', message, error);
  }

  return new BackendError('unknown', message, error);
}

export function authStateFromSession(session: Session | null): AuthState {
  if (!session) return { kind: 'signed-out' };

  return {
    kind: 'signed-in',
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      createdAt: session.user.created_at,
    },
    session: {
      userId: session.user.id,
      accessToken: session.access_token,
      expiresAt:
        session.expires_at == null
          ? null
          : new Date(session.expires_at * 1000).toISOString(),
    },
  };
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BackendError('invalid-input', 'Enter a valid email address');
  }
  return email;
}

function normalizeOtp(value: string): string {
  const token = value.trim();
  if (!/^\d{6}$/.test(token)) {
    throw new BackendError(
      'invalid-input',
      'Enter the 6-digit code from your email',
    );
  }
  return token;
}

function isAppleSession(session: Session | null): boolean {
  return !!session && (session.user.identities?.some(identity => identity.provider === 'apple') === true ||
    session.user.app_metadata.provider === 'apple' ||
    (Array.isArray(session.user.app_metadata.providers) && session.user.app_metadata.providers.includes('apple')));
}

export class SupabaseAuthBackend implements AuthBackend {
  private mutationTail: Promise<unknown> = Promise.resolve();
  private appleSetup: { userId: string | null } | null = null;
  private readyAppleToken: string | null = null;
  private failedAppleToken: string | null = null;
  private stateVersion = 0;
  private readonly listeners = new Set<(state: AuthState) => void>();
  private unsubscribeAuth: (() => void) | null = null;

  constructor(
    private readonly client: OntoSupabaseClient,
    private readonly emailRedirectTo?: string,
  ) {}

  // All app-owned session mutations share this queue. A conditional cleanup
  // cannot check A and then clear B while another sign-in starts on this client.
  private mutateSession<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationTail.then(operation, operation);
    this.mutationTail = next.catch(() => {});
    return next;
  }

  private publish(state: AuthState): void {
    this.stateVersion++;
    this.listeners.forEach(listener => listener(state));
  }

  private async publishCurrent(): Promise<void> {
    const version = this.stateVersion;
    try {
      const state = await this.getState();
      if (version === this.stateVersion) this.publish(state);
    } catch {
      if (version === this.stateVersion) this.publish({ kind: 'signed-out' });
    }
  }

  private async verifiedState(session: Session | null): Promise<AuthState> {
    if (session && this.appleSetup && (!this.appleSetup.userId || this.appleSetup.userId === session.user.id))
      return { kind: 'loading' };
    if (session && this.failedAppleToken === session.access_token) return { kind: 'signed-out' };
    if (!session || !isAppleSession(session)) return authStateFromSession(session);
    if (this.readyAppleToken === session.access_token) return authStateFromSession(session);
    // A failed cleanup or a process restart must never resurrect an Apple
    // account whose server-held revocation material was not registered.
    const { data, error } = await this.client.functions.invoke('apple-account', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action: 'status', expectedUserId: session.user.id },
    });
    const latest = await this.client.auth.getSession();
    if (latest.error) throw toBackendError(latest.error, 'Could not verify the account');
    if (latest.data.session?.access_token !== session.access_token) return this.getState();
    if (this.appleSetup && (!this.appleSetup.userId || this.appleSetup.userId === session.user.id))
      return { kind: 'loading' };
    if (this.failedAppleToken === session.access_token) return { kind: 'signed-out' };
    if (error || data?.ready !== true) return { kind: 'signed-out' };
    this.readyAppleToken = session.access_token;
    return authStateFromSession(session);
  }

  async getState(): Promise<AuthState> {
    const { data, error } = await this.client.auth.getSession();
    if (error)
      throw toBackendError(error, 'Could not read the current session');
    return this.verifiedState(data.session);
  }

  async signInWithApple(input: {
    token: string;
    nonce: string;
    authorizationCode?: string;
  }): Promise<void> {
    if (input.nonce.length < 32 || !input.token || !input.authorizationCode)
      throw new BackendError('invalid-input', 'Invalid Apple credential');
    if (this.appleSetup) throw new BackendError('conflict', 'Apple sign-in is already in progress');
    const setup = { userId: null as string | null };
    this.appleSetup = setup;
    this.readyAppleToken = null;
    this.publish({ kind: 'loading' });
    let session: Session | null = null;
    let registered = false;
    try {
      const result = await this.mutateSession(() => this.client.auth.signInWithIdToken({
        provider: 'apple', token: input.token, nonce: input.nonce,
      }));
      if (result.error) throw toBackendError(result.error, 'Could not sign in with Apple');
      session = result.data.session;
      if (!session) throw new BackendError('server', 'Apple sign-in did not establish a session');
      setup.userId = session.user.id;
      const response = await this.client.functions.invoke('apple-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          action: 'register', expectedUserId: session.user.id,
          authorizationCode: input.authorizationCode,
        },
      });
      if (response.error || response.data?.ok !== true) {
        throw new BackendError('server', 'Apple account setup could not be completed. Try Apple sign-in again before using account sync.');
      }
      registered = true;
      this.failedAppleToken = null;
      this.readyAppleToken = session.access_token;
    } finally {
      if (!registered && session) {
        this.failedAppleToken = session.access_token;
        // A late failure must not sign out an account selected in the meantime.
        await this.signOutIfCurrent(session.user.id, session.access_token).catch(() => {});
      }
      this.appleSetup = null;
      await this.publishCurrent();
    }
  }

  async signInWithEmail(email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const { error } = await this.client.auth.signInWithOtp({
      email: normalizedEmail,
      options: this.emailRedirectTo
        ? { emailRedirectTo: this.emailRedirectTo }
        : undefined,
    });

    if (error) throw toBackendError(error, 'Could not send the sign-in link');
  }

  async verifyEmailOtp(email: string, token: string): Promise<void> {
    const { error } = await this.mutateSession(() => this.client.auth.verifyOtp({
      email: normalizeEmail(email),
      token: normalizeOtp(token),
      type: 'email',
    }));

    if (error) throw toBackendError(error, 'Could not verify the sign-in code');
  }

  async signOut(): Promise<void> {
    // Device-scoped sign-out also clears persisted access and refresh
    // credentials when local data is erased while offline.
    const { error } = await this.mutateSession(() => this.client.auth.signOut({ scope: 'local' }));
    if (error) throw toBackendError(error, 'Could not sign out');
  }

  async signOutIfCurrent(expectedUserId: string, expectedAccessToken?: string): Promise<void> {
    await this.mutateSession(async () => {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw toBackendError(error, 'Could not verify the account');
      if (data.session?.user.id !== expectedUserId ||
          (expectedAccessToken && data.session.access_token !== expectedAccessToken)) return;
      const result = await this.client.auth.signOut({ scope: 'local' });
      if (result.error) throw toBackendError(result.error, 'Could not sign out');
    });
  }

  async deleteAccount(expectedUserId: string): Promise<void> {
    const { data: current, error: sessionError } =
      await this.client.auth.getSession();
    if (sessionError)
      throw toBackendError(sessionError, 'Could not verify the account');
    if (!expectedUserId || current.session?.user.id !== expectedUserId)
      throw new BackendError('conflict', 'Your account changed. Confirm deletion again.');
    const appleLinked = isAppleSession(current.session);
    const { data, error } = appleLinked
      ? await this.client.functions
          .invoke('apple-account', {
            headers: { Authorization: `Bearer ${current.session.access_token}` },
            body: { action: 'delete', expectedUserId },
          })
          .then((result) => ({
            data: result.data?.deleted === true,
            error: result.error,
          }))
      : await this.client.rpc('delete_my_account', { expected_user_id: expectedUserId });
    if (error) throw toBackendError(error, 'Could not delete the account');
    if (data !== true) {
      throw new BackendError('server', 'Account deletion was not confirmed');
    }

    // Deletion already succeeded. Best-effort local cleanup must not turn that
    // success into a false failure message.
    await this.signOutIfCurrent(expectedUserId).catch(() => {});
  }

  onStateChange(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    if (!this.unsubscribeAuth) {
      const { data } = this.client.auth.onAuthStateChange((_event, session) => {
        const pending = session && this.appleSetup && (!this.appleSetup.userId || this.appleSetup.userId === session.user.id);
        if (!pending && !isAppleSession(session) && session?.access_token !== this.failedAppleToken) {
          this.publish(authStateFromSession(session)); return;
        }
        this.publish({ kind: 'loading' });
        const version = this.stateVersion;
        // Supabase invokes this callback under its auth lock. Defer reads until
        // it releases that lock; never await an auth call from the callback.
        void Promise.resolve().then(() => this.verifiedState(session)).then(state => {
          if (this.listeners.size > 0 && version === this.stateVersion) this.publish(state);
        }, () => {
          if (this.listeners.size > 0 && version === this.stateVersion) this.publish({ kind: 'signed-out' });
        });
      });
      this.unsubscribeAuth = () => data.subscription.unsubscribe();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stateVersion++;
        this.unsubscribeAuth?.();
        this.unsubscribeAuth = null;
      }
    };
  }
}
