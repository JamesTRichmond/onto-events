import { installAppleRevocationMonitor } from './apple-revocation';
import { SupabaseCommunity } from './supabase-community';
import { createAccountTokenVerifier, type AccountTokenVerifier } from './account-token-verifier';
import type { BackendModules } from './contracts';
import { SupabaseOntoBackend } from './supabase-backend';
import {
  getSupabaseClient,
  installSupabaseAuthRefresh,
  readSupabaseConfig,
} from './supabase-client';

/** The production composition root; consumers never construct transports. */
export function createConfiguredModules(): BackendModules {
  try {
    const config = readSupabaseConfig();
    if (!config) return {};
    const client = getSupabaseClient();
    const backend = new SupabaseOntoBackend(client);
    const publicReviews = new SupabaseCommunity(client);
    let tokenVerifier: AccountTokenVerifier | undefined;
    const verifier = () => tokenVerifier ??= createAccountTokenVerifier(config);
    return {
      publicReviews,
      catalog: backend,
      account: {
        auth: backend,
        privateForAccount: (ownerId) => {
          const privateBackend = new SupabaseOntoBackend(client, undefined, ownerId, verifier());
          return { profile: privateBackend, rsvp: privateBackend };
        },
        communityForAccount: (ownerId) => {
          const community = new SupabaseCommunity(client, ownerId, verifier());
          return { hosting: community, reviews: community, reviewer: community };
        },
        start: () => {
          const stopRefresh = installSupabaseAuthRefresh(client);
          const stopApple = installAppleRevocationMonitor(client, (userId, token) => backend.signOutIfCurrent(userId, token));
          return () => { stopApple(); stopRefresh(); };
        },
      },
    };
  } catch {
    // A partial deployment must not break accountless discovery.
    return {};
  }
}
