import { AppState, Platform } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import type { OntoSupabaseClient } from './supabase-client';
/** No Apple subject is persisted separately; use the authenticated provider identity. */
export function installAppleRevocationMonitor(
  client: OntoSupabaseClient,
  signOutIfCurrent: (userId: string, accessToken: string) => Promise<void>,
): () => void {
  if (
    Platform.OS !== 'ios' ||
    process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN !== 'true'
  )
    return () => {};
  let active = true;
  const check = async () => {
    try {
      const { data } = await client.auth.getSession();
      const session = data.session;
      const identity = session?.user.identities?.find(
        (i) => i.provider === 'apple',
      );
      const subject = identity?.identity_data?.sub;
      if (
        !session ||
        typeof subject !== 'string' ||
        !(await Apple.isAvailableAsync())
      )
        return;
      const revoked =
        (await Apple.getCredentialStateAsync(subject)) !==
        Apple.AppleAuthenticationCredentialState.AUTHORIZED;
      if (active && revoked)
        await signOutIfCurrent(session.user.id, session.access_token);
    } catch {
      /* Unavailable network/device validation is not a claim of revocation. */
    }
  };
  const state = AppState.addEventListener('change', (value) => {
    if (value === 'active') void check();
  });
  const revoke = Apple.addRevokeListener(() => {
    void check();
  });
  void check();
  return () => {
    active = false;
    state.remove();
    revoke.remove();
  };
}
