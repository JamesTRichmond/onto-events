import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import FeedScreen from '../index';

// The real location hooks run here; only the platform module is stubbed, so
// every permission prompt and fix the screen would trigger is counted.
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Location = require('expo-location');

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

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-08-31T00:00:00.000Z' }));
jest.mock('@/data/bundled-activities', () => ({ BUNDLED_ACTIVITIES: [] }));

describe('FeedScreen location use', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.7608, longitude: -111.891 },
    });
  });

  it('never locates a returning viewer whose stored choice is Salt Lake City', async () => {
    await AsyncStorage.setItem('onto.locationChoice.v1', 'slc');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(await screen.findByText('onto')).toBeTruthy();
    await act(async () => {});
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('follows the phone on a fresh install and asks exactly once', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });
});
