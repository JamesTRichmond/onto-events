jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { BackendError } from '../contracts';
import { readSupabaseConfig } from '../supabase-client';

describe('readSupabaseConfig', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalPublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalPublishableKey === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;
    }
  });

  it('keeps the app in offline mode when no backend variables are present', () => {
    expect(readSupabaseConfig({})).toBeNull();
  });

  it('requires the URL and publishable key as a pair', () => {
    expect(() =>
      readSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://onto.supabase.co' }),
    ).toThrow(
      expect.objectContaining<Partial<BackendError>>({
        code: 'server',
        message: 'Supabase configuration is incomplete; set both public connection variables',
      }),
    );
  });

  it('requires an HTTPS project URL', () => {
    expect(() =>
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'http://onto.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      }),
    ).toThrow(
      expect.objectContaining<Partial<BackendError>>({
        code: 'server',
        message: 'Supabase URL must use https',
      }),
    );
  });

  it('normalizes a complete public configuration', () => {
    expect(
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: ' https://onto.supabase.co/ ',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' publishable-key ',
      }),
    ).toEqual({
      url: 'https://onto.supabase.co',
      publishableKey: 'publishable-key',
    });
  });

  it('reads the real Expo variables when no test object is injected', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://runtime.onto.test/';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'runtime-publishable-key';

    expect(readSupabaseConfig()).toEqual({
      url: 'https://runtime.onto.test',
      publishableKey: 'runtime-publishable-key',
    });
  });
});
