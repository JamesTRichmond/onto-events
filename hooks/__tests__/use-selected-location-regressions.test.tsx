import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SelectedLocationProvider, useSelectedLocation } from '../use-selected-location';
import { OntoBackendProvider } from '@/lib/backend/context';
import { eraseAllOntoData, STORAGE_KEYS } from '@/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Location = require('expo-location');
const modules = {};
let consumers: Record<string, ReturnType<typeof useSelectedLocation>>;
function Consumer({ name }: { name: string }) {
  const location = useSelectedLocation();
  consumers[name] = location;
  return <Text>{name}: {location.resolved.origin?.label ?? location.resolved.status}</Text>;
}
function mount() {
  return render(<OntoBackendProvider modules={modules}>
    <SelectedLocationProvider><Consumer name="Discover" /><Consumer name="Places" /></SelectedLocationProvider>
  </OntoBackendProvider>);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  consumers = {};
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 44.4771, longitude: -73.211 } });
});

it('shares remembered cities and in-memory pins between mounted consumers, then restores the city on restart', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'burlington' }));
  const first = mount();
  await waitFor(() => expect(consumers.Places.resolved.origin?.label).toBe('Burlington'));
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  act(() => { consumers.Discover.chooseCity('asheville'); });
  expect(consumers.Places.resolved.origin?.label).toBe('Asheville');
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.locationChoice))!).cityId).toBe('asheville'));
  act(() => { consumers.Places.choosePin({ lat: 44.4771, lng: -73.211 }); });
  expect(consumers.Discover.resolved.origin).toMatchObject({ source: 'pin', serviceRegion: 'vermont-corridor' });
  expect(consumers.Discover.resolved.origin).toEqual(consumers.Places.resolved.origin);
  const saved = await AsyncStorage.getItem(STORAGE_KEYS.locationChoice);
  expect(saved).toBe(JSON.stringify({ mode: 'city', cityId: 'asheville' }));
  first.unmount();
  mount();
  await waitFor(() => expect(consumers.Places.resolved.origin?.label).toBe('Asheville'));
  expect(consumers.Places.pin).toBeNull();
});

it('requests one startup fix and one fix when returning from a city, regardless of consumer count', async () => {
  mount();
  await waitFor(() => expect(consumers.Discover.resolved.origin?.source).toBe('device'));
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  act(() => { consumers.Places.chooseCity('burlington'); });
  act(() => { consumers.Discover.findMe(); });
  await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  act(() => { consumers.Places.findMe(); });
  await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(3));
});

it('keeps a deliberate city when an earlier GPS result arrives late', async () => {
  let finish!: (value: unknown) => void;
  Location.getCurrentPositionAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mount();
  await waitFor(() => expect(finish).toBeDefined());
  act(() => { consumers.Places.chooseCity('asheville'); });
  await act(async () => { finish({ coords: { latitude: 40.7608, longitude: -111.891 } }); });
  expect(consumers.Discover.resolved.origin?.label).toBe('Asheville');
});

it('suspends the old GPS origin while a new request after city browsing is pending', async () => {
  mount();
  await waitFor(() => expect(consumers.Discover.resolved.origin?.source).toBe('device'));
  act(() => { consumers.Places.chooseCity('asheville'); });
  let finish!: (value: unknown) => void;
  Location.getCurrentPositionAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  act(() => { consumers.Places.findMe(); });
  await waitFor(() => expect(finish).toBeDefined());
  expect(consumers.Discover.resolved.origin).toBeNull();
  expect(consumers.Places.resolved.status).toBe('loading');
  await act(async () => { finish({ coords: { latitude: 30.3298, longitude: -81.6589 } }); });
  expect(consumers.Discover.resolved.origin?.serviceRegion).toBe('jacksonville');
});

it('suspends both origins after denial and clears the live pin and saved city on erasure', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  mount();
  await waitFor(() => expect(consumers.Places.resolved.status).toBe('unavailable'));
  expect(consumers.Discover.resolved.origin).toBeNull();
  act(() => { consumers.Discover.chooseCity('burlington'); });
  await waitFor(async () => expect(await AsyncStorage.getItem(STORAGE_KEYS.locationChoice)).not.toBeNull());
  act(() => { consumers.Places.choosePin({ lat: 44.4771, lng: -73.211 }); });
  await act(async () => { await eraseAllOntoData(); });
  await waitFor(() => expect(consumers.Places.resolved.status).toBe('unavailable'));
  expect(consumers.Discover.pin).toBeNull();
  expect(consumers.Discover.preference.mode).toBe('device');
  expect(await AsyncStorage.getItem(STORAGE_KEYS.locationChoice)).toBeNull();
});
