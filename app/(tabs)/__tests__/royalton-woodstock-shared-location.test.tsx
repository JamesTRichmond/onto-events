import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { View } from 'react-native';
import * as Location from 'expo-location';

import FeedScreen from '../index';
import PlacesScreen from '../places';
import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import { OntoBackendProvider } from '@/lib/backend/context';
import { STORAGE_KEYS } from '@/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-11-01T15:00:00Z') }));
jest.mock('@/hooks/use-weather', () => ({
  useWeather: () => ({ report: null, loading: false, unavailable: true, cell: null }),
}));

let mockMode: 'everyone' | 'family' = 'everyone';
jest.mock('@/hooks/use-tier-mode', () => ({ useTierMode: () => ({ mode: mockMode }) }));

const modules = {};
function mountBoth() {
  return render(
    <OntoBackendProvider modules={modules}>
      <SelectedLocationProvider>
        <View testID="discover-tab">
          <FeedScreen />
        </View>
        <View testID="places-tab">
          <PlacesScreen />
        </View>
      </SelectedLocationProvider>
    </OntoBackendProvider>,
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockMode = 'everyone';
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
});

describe('Royalton & Woodstock Shared Location & Offline Launch', () => {
  it('cold-launches remembered Woodstock with real bundled events and places while offline without prompting GPS', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.locationChoice,
      JSON.stringify({ mode: 'city', cityId: 'woodstock' }),
    );
    mountBoth();

    const places = within(screen.getByTestId('places-tab'));
    const discover = within(screen.getByTestId('discover-tab'));

    expect((await places.findAllByText('Norman Williams Public Library')).length).toBeGreaterThan(0);
    expect(places.getByTestId('places-location')).toHaveTextContent('Places around Woodstock');
    expect(places.queryByText('Ensign Peak')).toBeNull();

    expect(places.getByText('Best now')).toBeTruthy();
    expect(places.queryByText('Open now')).toBeNull();

    expect(
      await discover.findByText('Town Hall Theatre Cinema: Vermont Documentary Showcase'),
    ).toBeTruthy();
    await act(async () => {});
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('cold-launches remembered Royalton with real bundled events and places without prompting GPS', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.locationChoice,
      JSON.stringify({ mode: 'city', cityId: 'royalton' }),
    );
    mountBoth();

    const places = within(screen.getByTestId('places-tab'));
    const discover = within(screen.getByTestId('discover-tab'));

    expect((await places.findAllByText('Royalton Memorial Library')).length).toBeGreaterThan(0);
    expect(places.getByTestId('places-location')).toHaveTextContent('Places around Royalton');
    expect(places.queryByText('Ensign Peak')).toBeNull();

    expect(
      await discover.findByText(/White River Valley Brass Ensemble/),
    ).toBeTruthy();
    await act(async () => {});
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('synchronizes Discover and Places tabs when switching between Woodstock and Royalton', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.locationChoice,
      JSON.stringify({ mode: 'city', cityId: 'woodstock' }),
    );
    mountBoth();

    const places = within(screen.getByTestId('places-tab'));

    expect((await places.findAllByText('Norman Williams Public Library')).length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByLabelText('change city'));
    fireEvent.press(screen.getByLabelText('Royalton'));

    await waitFor(() =>
      expect(places.getByTestId('places-location')).toHaveTextContent('Places around Royalton'),
    );
    expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching Royalton/);

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.locationChoice)).toBe(
        JSON.stringify({ mode: 'city', cityId: 'royalton' }),
      ),
    );
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
