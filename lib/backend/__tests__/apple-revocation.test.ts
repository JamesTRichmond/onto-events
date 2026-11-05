import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import { SupabaseAuthBackend } from '../supabase-auth';
import { installAppleRevocationMonitor } from '../apple-revocation';
import type { OntoSupabaseClient } from '../supabase-client';
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  getCredentialStateAsync: jest.fn(),
  addRevokeListener: jest.fn(),
  AppleAuthenticationCredentialState: { AUTHORIZED: 1, REVOKED: 2 },
}));
const user = (id: string) => ({
  access_token: `token-${id}`,
  user: {
    id,
    identities: [{ provider: 'apple', identity_data: { sub: 'subject' } }],
  },
});
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
let stateListener: (value: AppStateStatus) => void;
let revokeListener: () => void;
let remove: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN = 'true';
  remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    stateListener = listener;
    return { remove };
  });
  (Apple.addRevokeListener as jest.Mock).mockImplementation((listener) => {
    revokeListener = listener;
    return { remove };
  });
  (Apple.getCredentialStateAsync as jest.Mock).mockResolvedValue(
    Apple.AppleAuthenticationCredentialState.AUTHORIZED,
  );
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN;
});
it('responds to native revocation and removes listeners', async () => {
  const auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session: user('a') } }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  };
  const client = { auth } as unknown as OntoSupabaseClient;
  const backend = new SupabaseAuthBackend(client);
  const cleanup = installAppleRevocationMonitor(client, (id, token) => backend.signOutIfCurrent(id, token));
  await flush();
  expect(auth.signOut).not.toHaveBeenCalled();
  (Apple.getCredentialStateAsync as jest.Mock).mockResolvedValue(
    Apple.AppleAuthenticationCredentialState.REVOKED,
  );
  revokeListener();
  await flush();
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  cleanup();
  expect(remove).toHaveBeenCalledTimes(2);
});
it('does not sign out a new account after a delayed credential check', async () => {
  let release!: (value: number) => void;
  const pending = new Promise<number>((resolve) => {
    release = resolve;
  });
  (Apple.getCredentialStateAsync as jest.Mock).mockReturnValue(pending);
  let current = user('a');
  const auth = {
    getSession: jest
      .fn()
      .mockImplementation(async () => ({ data: { session: current } })),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  };
  const client = { auth } as unknown as OntoSupabaseClient;
  const backend = new SupabaseAuthBackend(client);
  const cleanup = installAppleRevocationMonitor(client, (id, token) => backend.signOutIfCurrent(id, token));
  await flush();
  current = user('b');
  release(Apple.AppleAuthenticationCredentialState.REVOKED);
  await flush();
  expect(auth.signOut).not.toHaveBeenCalled();
  cleanup();
});
it('rechecks on foreground without treating unavailable validation as revocation', async () => {
  const auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session: user('a') } }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  };
  const client = { auth } as unknown as OntoSupabaseClient;
  const backend = new SupabaseAuthBackend(client);
  const cleanup = installAppleRevocationMonitor(client, (id, token) => backend.signOutIfCurrent(id, token));
  await flush();
  (Apple.getCredentialStateAsync as jest.Mock).mockRejectedValue(
    new Error('unavailable'),
  );
  stateListener('active');
  await flush();
  expect(auth.signOut).not.toHaveBeenCalled();
  cleanup();
});
