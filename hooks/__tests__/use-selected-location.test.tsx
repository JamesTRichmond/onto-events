import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { CITIES } from '@/data/cities';
import { OntoBackendProvider } from '@/lib/backend/context';
import { eraseAllOntoData, STORAGE_KEYS } from '@/lib/storage';
import { SelectedLocationProvider, useSelectedLocation } from '../use-selected-location';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));

const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
const position = jest.mocked(Location.getCurrentPositionAsync);
const wrapper = SelectedLocationProvider;
const gps = { coords: { latitude: 35.5956, longitude: -82.5486 } } as Location.LocationObject;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  position.mockResolvedValue(gps);
});

it('shares one startup permission and fix between mounted consumers, and refreshes once on request', async () => {
  const { result } = renderHook(() => ({ first: useSelectedLocation(), second: useSelectedLocation() }), { wrapper });
  await waitFor(() => expect(result.current.first.resolved.status).toBe('ready'));
  expect(result.current.first.resolved).toBe(result.current.second.resolved);
  expect(result.current.first.resolved.origin?.serviceRegion).toBe('asheville');
  expect(permission).toHaveBeenCalledTimes(1);
  expect(position).toHaveBeenCalledTimes(1);
  act(() => result.current.second.findMe());
  await waitFor(() => expect(position).toHaveBeenCalledTimes(2));
  expect(permission).toHaveBeenCalledTimes(2);
});

it.each(CITIES)('loads $name in both consumers without permission', async city => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: city.id }));
  const { result } = renderHook(() => ({ first: useSelectedLocation(), second: useSelectedLocation() }), { wrapper });
  await waitFor(() => expect(result.current.first.resolved.status).toBe('ready'));
  expect(result.current.second.resolved.origin).toMatchObject({
    label: city.name, lat: city.anchor.lat, lng: city.anchor.lng, timeZone: city.timeZone, serviceRegion: city.serviceRegion,
  });
  expect(permission).not.toHaveBeenCalled();
});

it('transfers a pin between consumers but restores the remembered city after remount', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'middlebury' }));
  const first = renderHook(() => ({ a: useSelectedLocation(), b: useSelectedLocation() }), { wrapper });
  await waitFor(() => expect(first.result.current.a.loaded).toBe(true));
  act(() => first.result.current.a.choosePin({ lat: 44.48, lng: -73.21 }));
  expect(first.result.current.b.resolved.origin).toMatchObject({ source: 'pin', lat: 44.48, lng: -73.21 });
  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.locationChoice))!)).toEqual({ mode: 'city', cityId: 'middlebury' });
  first.unmount();
  const second = renderHook(useSelectedLocation, { wrapper });
  await waitFor(() => expect(second.result.current.resolved.origin?.label).toBe('Middlebury'));
  expect(second.result.current.pin).toBeNull();
});

it('requests exactly one fix when returning from a chosen city', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'burlington' }));
  const { result } = renderHook(useSelectedLocation, { wrapper });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  act(() => result.current.findMe());
  await waitFor(() => expect(result.current.resolved.origin?.source).toBe('device'));
  expect(permission).toHaveBeenCalledTimes(1);
  expect(position).toHaveBeenCalledTimes(1);
});

it('ignores a late GPS result after choosing a city', async () => {
  let release!: (value: Location.LocationObject) => void;
  position.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const { result } = renderHook(useSelectedLocation, { wrapper });
  await waitFor(() => expect(position).toHaveBeenCalledTimes(1));
  act(() => result.current.chooseCity('burlington'));
  await act(async () => release(gps));
  expect(result.current.resolved.origin?.label).toBe('Burlington');
});

it('clears the pin and remembered city under the backend erasure boundary', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'burlington' }));
  function ErasureRoot({ children }: PropsWithChildren) {
    return <OntoBackendProvider modules={{}}><SelectedLocationProvider>{children}</SelectedLocationProvider></OntoBackendProvider>;
  }
  const { result } = renderHook(useSelectedLocation, { wrapper: ErasureRoot });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  act(() => result.current.choosePin({ lat: 44.48, lng: -73.21 }));
  await act(async () => eraseAllOntoData());
  await waitFor(() => expect(result.current.resolved.origin?.source).toBe('device'));
  expect(result.current.pin).toBeNull();
  expect(result.current.city.id).toBe('salt-lake-city');
  expect(await AsyncStorage.getItem(STORAGE_KEYS.locationChoice)).toBeNull();
});
