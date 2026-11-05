import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { View } from 'react-native';
import * as Location from 'expo-location';

import FeedScreen from '../index';
import PlacesScreen from '../places';
import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import { OntoBackendProvider } from '@/lib/backend/context';
import { STORAGE_KEYS } from '@/lib/storage';
import { SPOTS } from '@/data/spots';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-11-01T12:00:00Z') }));
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

it('cold-launches remembered Montreal with real bundled events and places while offline', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'montreal' }));
  mountBoth();
  const places = within(screen.getByTestId('places-tab'));
  const discover = within(screen.getByTestId('discover-tab'));
  await places.findByText('Parc du Mont-Royal & Kondiaronk Belvedere');
  expect((await discover.findAllByText('Concert symphonique de l\'OSM / OSM Orchestral Masterworks')).length).toBeGreaterThan(0);
  expect(places.getByTestId('places-location')).toHaveTextContent('Places around Montreal');
  expect(places.queryByText('Ensign Peak')).toBeNull();
  expect(places.getByText('Best now')).toBeTruthy();
  expect(places.queryByText('Open now')).toBeNull();
  await act(async () => {});
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

it('changes both mounted tabs from either set of controls without requesting GPS', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'montreal' }));
  mountBoth();
  const places = within(screen.getByTestId('places-tab'));
  const discover = within(screen.getByTestId('discover-tab'));
  await places.findByText('Parc du Mont-Royal & Kondiaronk Belvedere');
  fireEvent.press(discover.getByLabelText('Open feed options'));
  fireEvent.press(places.getByLabelText('Change location'));
  fireEvent.press(places.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Salt Lake City'));
  await waitFor(() =>
    expect(places.getByTestId('places-location')).toHaveTextContent('Places around Salt Lake City'),
  );
  const cards = places.getAllByLabelText(/^Details:/);
  expect(cards.length).toBeGreaterThan(0);
  const utah = new Set(
    SPOTS.filter((spot) => spot.serviceRegion === 'utah').map((spot) => `Details: ${spot.title}`),
  );
  for (const card of cards) expect(utah.has(card.props.accessibilityLabel)).toBe(true);
  expect(discover.getByTestId('search-place')).toHaveTextContent(/Searching Salt Lake City/);
  expect(places.queryByText('Parc du Mont-Royal & Kondiaronk Belvedere')).toBeNull();
  fireEvent.press(discover.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Montreal'));
  await places.findByText('Parc du Mont-Royal & Kondiaronk Belvedere');
  expect(discover.getByTestId('search-place')).toHaveTextContent(/Searching Montreal/);
  await waitFor(async () =>
    expect(await AsyncStorage.getItem(STORAGE_KEYS.locationChoice)).toBe(
      JSON.stringify({ mode: 'city', cityId: 'montreal' }),
    ),
  );
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

it('renders credited real family programs offline at a saved wider distance', async () => {
  mockMode = 'family';
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'montreal' }));
  mountBoth();
  const discover = within(screen.getByTestId('discover-tab'));
  expect((await discover.findAllByText('Heure du conte bilingue / Bilingual Family Story Hour')).length).toBeGreaterThan(0);
});
