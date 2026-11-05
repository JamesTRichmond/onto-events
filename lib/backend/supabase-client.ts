import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeEventSubscription } from 'react-native';
import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { BackendError } from './contracts';

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

type PublicEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type OntoSupabaseClient = SupabaseClient<any, 'onto', any>;

export function readSupabaseConfig(env?: PublicEnv): SupabaseConfig | null {
  // Expo replaces only direct, dot-notation process.env.EXPO_PUBLIC_* reads in
  // the client bundle. Keep the injectable object for deterministic tests.
  const source = env ?? {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  const url = source.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url && !publishableKey) return null;
  if (!url || !publishableKey) {
    throw new BackendError(
      'server',
      'Supabase configuration is incomplete; set both public connection variables',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new BackendError('server', 'Supabase URL is invalid', cause);
  }

  if (parsed.protocol !== 'https:') {
    throw new BackendError('server', 'Supabase URL must use https');
  }

  return { url: parsed.toString().replace(/\/$/, ''), publishableKey };
}

export function createOntoSupabaseClient(config: SupabaseConfig): OntoSupabaseClient {
  return createClient<any, 'onto'>(config.url, config.publishableKey, {
    db: { schema: 'onto' },
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
}

let singleton: OntoSupabaseClient | null = null;

export function getSupabaseClient(): OntoSupabaseClient {
  if (singleton) return singleton;

  const config = readSupabaseConfig();
  if (!config) {
    throw new BackendError(
      'server',
      'Supabase is not configured; the offline feed remains available',
    );
  }

  singleton = createOntoSupabaseClient(config);
  return singleton;
}

/**
 * Keep native sessions fresh only while the app is active. Web auth manages
 * refresh through the browser. Call this once from the auth provider and
 * dispose it when that provider unmounts.
 */
export function installSupabaseAuthRefresh(
  client: OntoSupabaseClient = getSupabaseClient(),
): () => void {
  if (Platform.OS === 'web') return () => {};

  let subscription: NativeEventSubscription | null = null;
  const applyState = (state: string) => {
    if (state === 'active') {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  };

  applyState(AppState.currentState);
  subscription = AppState.addEventListener('change', applyState);

  return () => {
    subscription?.remove();
    client.auth.stopAutoRefresh();
  };
}
