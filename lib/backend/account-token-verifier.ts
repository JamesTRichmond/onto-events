import { createClient } from '@supabase/supabase-js';

import type { OntoSupabaseClient, SupabaseConfig } from './supabase-client';

/** Verifies one explicit token without sharing the app's mutable auth state. */
export type AccountTokenVerifier = (
  token: string,
) => ReturnType<OntoSupabaseClient['auth']['getUser']>;

export function createAccountTokenVerifier(
  config: SupabaseConfig,
  requestFetch?: typeof globalThis.fetch,
): AccountTokenVerifier {
  // getUser(token) can remove its client's session on session_not_found.
  // This client never installs or persists an app session, so a late error
  // cannot erase a newer identity on the production client.
  const verifier = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(requestFetch ? { global: { fetch: requestFetch } } : {}),
  }).auth;
  return (token) => verifier.getUser(token);
}
