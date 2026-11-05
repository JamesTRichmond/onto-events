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
import { LOCAL_ACTIVITIES as AUSTIN_ACTIVITIES } from '@/data/austin-events';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-18T18:00:00Z') }));
jest.mock('@/hooks/use-weather', () => ({ useWeather: () => ({ report: null, loading: false, unavailable: true, cell: null }) }));
let mockMode: 'everyone' | 'family' = 'everyone';
jest.mock('@/hooks/use-tier-mode', () => ({ useTierMode: () => ({ mode: mockMode }) }));
const modules = {};
function mountBoth() {
  return render(
    <OntoBackendProvider modules={modules}>
      <SelectedLocationProvider>
        <View testID="discover-tab"><FeedScreen /></View>
        <View testID="places-tab"><PlacesScreen /></View>
      </SelectedLocationProvider>
    </OntoBackendProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockMode = 'everyone';
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
});

it('cold-launches remembered Austin with real places and an honest family-only supply hint offline', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'austin' }));
  await AsyncStorage.setItem('onto.feedRadius.v1', '5');
  mountBoth();
  const places = within(screen.getByTestId('places-tab'));
  const discover = within(screen.getByTestId('discover-tab'));
  await places.findByText('Austin Central Library');
  expect(AUSTIN_ACTIVITIES).toHaveLength(17);
  expect(AUSTIN_ACTIVITIES.every((activity) => activity.rating === 'family')).toBe(true);
  expect(await discover.findByText('Nothing in this mode nearby.')).toBeTruthy();
  fireEvent.press(discover.getByLabelText('Open feed options'));
  expect(discover.getByTestId('search-place')).toHaveTextContent(/Searching Austin/);
  expect(discover.queryAllByLabelText(/^Details:/)).toEqual([]);
  expect(discover.queryByText('Technology & Innovation Lab: Community Makers Workshop')).toBeNull();
  expect(places.getByTestId('places-location')).toHaveTextContent('Places around Austin');
  expect(places.queryByText('Ensign Peak')).toBeNull();
  expect(places.getByText('Best now')).toBeTruthy();
  expect(places.queryByText('Open now')).toBeNull();
  await act(async () => {});
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

it('changes both mounted tabs from either set of controls without requesting GPS', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'austin' }));
  mountBoth();
  const places = within(screen.getByTestId('places-tab'));
  const discover = within(screen.getByTestId('discover-tab'));
  await places.findByText('Austin Central Library');
  fireEvent.press(discover.getByLabelText('Open feed options'));
  fireEvent.press(places.getByLabelText('Change location'));
  fireEvent.press(places.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Salt Lake City'));
  await waitFor(() => expect(places.getByTestId('places-location')).toHaveTextContent('Places around Salt Lake City'));
  const cards = places.getAllByLabelText(/^Details:/);
  expect(cards.length).toBeGreaterThan(0);
  const utah = new Set(SPOTS.filter((spot) => spot.serviceRegion === 'utah').map((spot) => `Details: ${spot.title}`));
  for (const card of cards) expect(utah.has(card.props.accessibilityLabel)).toBe(true);
  expect(discover.getByTestId('search-place')).toHaveTextContent(/Searching Salt Lake City/);
  expect(places.queryByText('Austin Central Library')).toBeNull();
  fireEvent.press(discover.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Austin'));
  await places.findByText('Austin Central Library');
  expect(discover.getByTestId('search-place')).toHaveTextContent(/Searching Austin/);
  await waitFor(async () => expect(await AsyncStorage.getItem(STORAGE_KEYS.locationChoice))
    .toBe(JSON.stringify({ mode: 'city', cityId: 'austin' })));
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

it('renders credited family market schedules offline at a saved wider distance', async () => {
  mockMode = 'family';
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'austin' }));
  await AsyncStorage.setItem('onto.feedRadius.v1', '5');
  mountBoth();
  const discover = within(screen.getByTestId('discover-tab'));
  expect((await discover.findAllByText("Texas Farmers' Market at Mueller")).length).toBeGreaterThan(0);
  expect(discover.getAllByText(/via Texas Farmers' Market at Mueller/).length).toBeGreaterThan(0);
  expect(discover.queryByText('Downtown Family Story & Music Hour')).toBeNull();
  fireEvent.press(discover.getByLabelText('Open feed options'));
  expect(discover.getByTestId('search-place')).toHaveTextContent(/Searching Austin · within 5 miles/);
  expect(AUSTIN_ACTIVITIES).toHaveLength(17);
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(discover.queryByText('Host a meetup')).toBeNull();
});

it('suppresses Places after denied GPS until a supported city is deliberately selected', async () => {
  mountBoth();
  const places = within(screen.getByTestId('places-tab'));
  await places.findByText('Your location is unavailable. Choose location or change city.');
  expect(places.queryByText('Ensign Peak')).toBeNull();
  expect(places.queryByText('Austin Central Library')).toBeNull();
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  fireEvent.press(places.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Austin'));
  await places.findByText('Austin Central Library');
  expect(places.getByTestId('places-location')).toHaveTextContent('Places around Austin');
  await waitFor(async () => expect(await AsyncStorage.getItem(STORAGE_KEYS.locationChoice))
    .toBe(JSON.stringify({ mode: 'city', cityId: 'austin' })));
});
