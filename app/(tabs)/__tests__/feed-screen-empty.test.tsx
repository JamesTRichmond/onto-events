import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';

import FeedScreen from '../index';

jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }),
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
  }),
}));

// Nothing at all to show: every bundled source is empty.
jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-08-31T00:00:00.000Z', LIVE_ACTIVITIES: [] }));
jest.mock('@/data/local-events', () => ({ LOCAL_GENERATED_AT: '2026-08-31T00:00:00.000Z', LOCAL_ACTIVITIES: [] }));
jest.mock('@/data/family-events', () => ({ FAMILY_ACTIVITIES: [] }));
jest.mock('@/data/roadtrip-events', () => ({ ROADTRIP_ACTIVITIES: [] }));
jest.mock('@/data/activities', () => ({ ...jest.requireActual('@/data/activities'), SEED_ACTIVITIES: [] }));

describe('FeedScreen with nothing to show', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('says James\'s line, exactly, and keeps the hint', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByText('onto the next thing')).toBeTruthy());
    expect(screen.getByText('Try downtown.')).toBeTruthy();
    expect(screen.queryByText(/get onto/i)).toBeNull();
  });
});
