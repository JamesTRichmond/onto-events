import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';

import { fakeNwsFetch } from '@/lib/weather/__tests__/fake-nws';
import { resetWeatherCache } from '@/hooks/use-weather';
import FeedScreen from '../index';

jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-09-28T20:30:00Z'),
}));
// A real fix, a few blocks from the grid point: the case the cell exists for.
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608,
    lng: -111.891,
    source: 'gps',
    loading: false,
    fallbackReason: null,
    refresh: jest.fn(),
  }),
}));
jest.mock('@/data/live-events', () => ({
  GENERATED_AT: '2026-09-28T00:00:00.000Z',
  LIVE_ACTIVITIES: [],
}));

const realFetch = globalThis.fetch;

// The strip left the dashboard (James, 2026-09-29): weather now feeds the sky
// alone. What must not change is how it is asked for.
describe('Discover weather', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetWeatherCache();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('shows no strip: no temperature, no wind line, no radar toggle', async () => {
    const { fetchImpl, calls } = fakeNwsFetch();
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByTestId('weather-strip')).toBeNull();
    expect(screen.queryByText(/°$/)).toBeNull();
    expect(screen.queryByText(/^Wind /)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Weather:/ })).toBeNull();
  });

  it('the phone’s position never leaves it: every weather request is keyed by the grid cell', async () => {
    const { fetchImpl, calls } = fakeNwsFetch();
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    for (const { url } of calls) {
      expect(url.startsWith('https://api.weather.gov/')).toBe(true);
      expect(url).not.toMatch(/40\.76|111\.89|40\.7608|-111\.891/);
    }
    expect(calls[0].url).toBe('https://api.weather.gov/points/40.8,-111.9');
  });

  it('offline, the sky stays calm and the feed carries on', async () => {
    const seen: string[] = [];
    globalThis.fetch = ((url: string) => {
      seen.push(url);
      return Promise.reject(new Error('offline'));
    }) as unknown as typeof fetch;
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    // The first render of the full screen is slow under jest; the answer is not.
    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(screen.getByText('onto')).toBeTruthy();
    // One try, not a retry loop.
    expect(seen).toEqual(['https://api.weather.gov/points/40.8,-111.9']);
  });
});
