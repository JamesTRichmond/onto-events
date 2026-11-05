import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';

import FeedScreen from '../index';

// The catalog request fails on a fresh install and the bundle holds nothing
// current: the screen must say so, not fill itself with made-up listings.
const mockCatalogBackend = {
  listEvents: jest.fn(() => Promise.reject(new Error('offline'))),
  getCatalogFreshness: jest.fn(() => Promise.reject(new Error('offline'))),
};
jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: mockCatalogBackend, rsvpBackend: null, rsvpOwnerId: null }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-08-31T20:10:00Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-08-31T00:00:00.000Z' }));
jest.mock('@/data/bundled-activities', () => ({ BUNDLED_ACTIVITIES: [] }));

describe('FeedScreen offline with nothing bundled', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('says live updates are offline and offers the retry instead of inventing events', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(
      await screen.findByText('Live updates are offline — showing the built-in Salt Lake City guide.'),
    ).toBeTruthy();
    expect(screen.getByText('Live updates are offline. Pull down to try again.')).toBeTruthy();
    expect(screen.queryAllByLabelText(/^Details: /)).toHaveLength(0);
  });
});
