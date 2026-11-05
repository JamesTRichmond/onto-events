import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { CatalogEvent, CatalogEventQuery } from '@/lib/backend/contracts';
import { STORAGE_KEYS, STORAGE_PREFIXES } from '@/lib/storage';
import FeedScreen from '../index';

const mockCatalogBackend = {
  listEvents: jest.fn(),
  getEvent: jest.fn(),
  getCatalogFreshness: jest.fn(),
};
const mockLocation = {
  current: { lat: 44.478, lng: -73.212, source: 'gps', loading: false, fallbackReason: null },
};
jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: mockCatalogBackend, rsvpBackend: null, rsvpOwnerId: null }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ ...mockLocation.current, refresh: jest.fn() }),
}));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-08T18:40:00Z') }));
jest.mock('@/data/bundled-activities', () => ({ BUNDLED_ACTIVITIES: [] }));
jest.mock('@/components/ui/pin-picker', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return { PinPicker: ({ onPick, onClose }: { onPick: (spot: { lat: number; lng: number }) => void; onClose: () => void }) =>
    <View><Pressable accessibilityLabel="Pick Vermont pin" onPress={() => onPick({ lat: 44.480123, lng: -73.210987 })}><Text>Pick</Text></Pressable>
      <Pressable accessibilityLabel="Cancel test pin" onPress={onClose}><Text>Cancel</Text></Pressable></View> };
});

const vtCacheKey = `${STORAGE_PREFIXES.catalogRegion}vermont-corridor`;
function event(id: string, vermont = true): CatalogEvent {
  return {
    id, sourceName: 'Public library', sourceEventId: id,
    sourceUrl: 'https://example.com/event', title: id, description: 'Public program',
    venueName: 'Public library', locality: vermont ? 'Burlington' : 'Salt Lake City',
    region: vermont ? 'VT' : 'UT', countryCode: 'US',
    latitude: vermont ? 44.478 : 40.7608, longitude: vermont ? -73.212 : -111.891,
    category: 'learning', rating: 'general', startsAt: '2026-10-08T20:00:00Z',
    endsAt: '2026-10-08T21:00:00Z', timezone: vermont ? 'America/New_York' : 'America/Denver',
    imageUrl: null, isCancelled: false, isRoadtrip: false,
    ingestedAt: '2026-10-08T18:40:00Z', updatedAt: '2026-10-08T18:40:00Z',
  };
}
function cache(items: CatalogEvent[]) {
  return JSON.stringify({ items, updatedAt: '2026-10-08T18:40:00Z' });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
  jest.clearAllMocks();
  mockLocation.current = { lat: 44.478, lng: -73.212, source: 'gps', loading: false, fallbackReason: null };
  mockCatalogBackend.listEvents.mockResolvedValue({ items: [], nextCursor: null });
  mockCatalogBackend.getCatalogFreshness.mockResolvedValue(null);
});

it.each([
  ['Burlington', 44.478, -73.212],
  ['Middlebury', 44.015, -73.167],
  ['Bristol', 44.134, -73.079],
  ['Vergennes', 44.167, -73.254],
  ['Rutland', 43.610, -72.972],
  ['Montpelier', 44.260, -72.576],
  ['White River Junction', 43.648, -72.318],
])('requests the named Vermont catalog for a device near %s', async (_hub, lat, lng) => {
  mockLocation.current = { ...mockLocation.current, lat: Number(lat), lng: Number(lng) };
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  await waitFor(() => expect(mockCatalogBackend.listEvents).toHaveBeenCalledWith({
    serviceRegion: 'vermont-corridor', ratings: ['family', 'general'], limit: 200,
  }));
  await act(async () => {});
  expect(mockCatalogBackend.getCatalogFreshness).not.toHaveBeenCalled();
});

it('requests the named Tallahassee catalog for a device near Tallahassee City Hall', async () => {
  mockLocation.current = { ...mockLocation.current, lat: 30.4383, lng: -84.2807 };
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  await waitFor(() => expect(mockCatalogBackend.listEvents).toHaveBeenCalledWith({
    serviceRegion: 'tallahassee', ratings: ['family', 'general'], limit: 200,
  }));
  await act(async () => {});
  expect(mockCatalogBackend.getCatalogFreshness).not.toHaveBeenCalled();
});

it('keeps Vermont scope on the second page and renders both returned public cards', async () => {
  mockCatalogBackend.listEvents.mockImplementation((query: CatalogEventQuery) => Promise.resolve({
    items: [event(query.cursor ? 'Second Vermont program' : 'First Vermont program')],
    nextCursor: query.cursor ? null : '200',
  }));
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  expect(await screen.findByLabelText('Details: Second Vermont program')).toBeTruthy();
  expect(screen.getByLabelText('Details: First Vermont program')).toBeTruthy();
  expect(mockCatalogBackend.listEvents).toHaveBeenCalledWith({
    serviceRegion: 'vermont-corridor', ratings: ['family', 'general'], limit: 200, cursor: '200',
  });
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(vtCacheKey))!).items).toHaveLength(2));
  expect(await AsyncStorage.getItem(STORAGE_KEYS.catalog)).toBeNull();
});

it('does not claim the Salt Lake City guide when Vermont has nothing saved', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.catalog, cache([event('Saved Utah program', false)]));
  mockCatalogBackend.listEvents.mockRejectedValue(new Error('offline'));
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  expect(await screen.findByText('Live updates are offline.')).toBeTruthy();
  expect(screen.queryByText('Live updates are offline — showing the built-in Salt Lake City guide.')).toBeNull();
  expect(screen.queryByLabelText('Details: Saved Utah program')).toBeNull();
  expect(await screen.findByText('Live updates are offline. Pull down to try again.')).toBeTruthy();
  expect(await AsyncStorage.getItem(STORAGE_KEYS.catalog)).toContain('Saved Utah program');
});

it('uses the saved Vermont cache on failure instead of the global catalog', async () => {
  const globalCache = cache([event('Saved Utah program', false)]);
  await AsyncStorage.setItem(STORAGE_KEYS.catalog, globalCache);
  await AsyncStorage.setItem(vtCacheKey, cache([event('Saved Vermont program')]));
  mockCatalogBackend.listEvents.mockRejectedValue(new Error('offline'));
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  expect(await screen.findByLabelText('Details: Saved Vermont program')).toBeTruthy();
  expect(await screen.findByText('Offline — showing saved events.')).toBeTruthy();
  expect(screen.queryByLabelText('Details: Saved Utah program')).toBeNull();
  expect(await AsyncStorage.getItem(STORAGE_KEYS.catalog)).toBe(globalCache);
});

it('ignores a late Vermont response after choosing Salt Lake City', async () => {
  let finishVermont!: (value: { items: CatalogEvent[]; nextCursor: null }) => void;
  mockCatalogBackend.listEvents.mockImplementation((query: CatalogEventQuery) =>
    query.serviceRegion === 'vermont-corridor'
      ? new Promise(resolve => { finishVermont = resolve; })
      : Promise.resolve({ items: [event('Salt Lake program', false)], nextCursor: null }));
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  await waitFor(() => expect(finishVermont).toBeDefined());
  fireEvent.press(screen.getByTestId('dash-toggle'));
  fireEvent.press(screen.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Salt Lake City'));
  expect(await screen.findByLabelText('Details: Salt Lake program')).toBeTruthy();
  await act(async () => { finishVermont({ items: [event('Late Vermont program')], nextCursor: null }); });
  expect(screen.queryByLabelText('Details: Late Vermont program')).toBeNull();
  expect(await AsyncStorage.getItem(vtCacheKey)).toBeNull();
  const requests = mockCatalogBackend.listEvents.mock.calls.map(([query]) => query);
  expect(requests.every(query => !('lat' in query) && !('lng' in query) && !('latitude' in query) && !('longitude' in query))).toBe(true);
});

it('retains a saved Utah catalog for an explicitly chosen Salt Lake City', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'salt-lake-city' }));
  mockCatalogBackend.listEvents.mockRejectedValue(new Error('offline'));
  await AsyncStorage.setItem(STORAGE_KEYS.catalog, cache([event('Saved Utah program', false)]));
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  expect(await screen.findByLabelText('Details: Saved Utah program')).toBeTruthy();
  expect(mockCatalogBackend.listEvents).toHaveBeenCalledWith({ serviceRegion: 'utah', ratings: ['family', 'general'], limit: 200 });
});

it('switches to the Vermont catalog for a memory-only pin, while cancel keeps Salt Lake City', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.locationChoice, JSON.stringify({ mode: 'city', cityId: 'salt-lake-city' }));
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  await waitFor(() => expect(mockCatalogBackend.listEvents).toHaveBeenCalled());
  fireEvent.press(screen.getByTestId('dash-toggle'));
  fireEvent.press(screen.getByLabelText('choose location'));
  fireEvent.press(screen.getByLabelText('Cancel test pin'));
  expect(mockCatalogBackend.listEvents.mock.calls.every(([query]) => query.serviceRegion === 'utah')).toBe(true);
  fireEvent.press(screen.getByLabelText('choose location'));
  fireEvent.press(screen.getByLabelText('Pick Vermont pin'));
  await waitFor(() => expect(mockCatalogBackend.listEvents).toHaveBeenCalledWith({
    serviceRegion: 'vermont-corridor', ratings: ['family', 'general'], limit: 200,
  }));
  await act(async () => {});
  const writes = JSON.stringify((AsyncStorage.setItem as jest.Mock).mock.calls);
  expect(writes).not.toContain('44.480123');
  expect(writes).not.toContain('-73.210987');
});
