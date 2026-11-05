import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import { COMING_SOON_CITIES } from '@/data/cities';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import FeedScreen from '../index';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
const mockCatalog = { listEvents: jest.fn(), getEvent: jest.fn(), getCatalogFreshness: jest.fn() };
jest.mock('@/lib/backend/context', () => ({ useOntoBackend: () => ({ catalogBackend: mockCatalog, rsvpBackend: null, rsvpOwnerId: null }) }));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-12T18:00:00Z') }));
jest.mock('@/data/bundled-activities', () => ({ BUNDLED_ACTIVITIES: [] }));
let mockMapStart: { lat: number; lng: number };
jest.mock('@/components/ui/pin-picker', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return { PinPicker: ({ start, onPick, onClose }: { start: { lat: number; lng: number }; onPick: (spot: { lat: number; lng: number }) => void; onClose: () => void }) => {
    mockMapStart = start;
    return <View><Pressable accessibilityLabel="Confirm Vermont pin" onPress={() => onPick({ lat: 44.48, lng: -73.21 })}><Text>Confirm</Text></Pressable><Pressable accessibilityLabel="Cancel map" onPress={onClose}><Text>Cancel</Text></Pressable></View>;
  } };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
  jest.clearAllMocks();
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
  mockCatalog.listEvents.mockResolvedValue({ items: [], nextCursor: null });
});
const openOptions = () => fireEvent.press(screen.getByLabelText('Open feed options'));
const selectCity = (name: string) => { fireEvent.press(screen.getByLabelText('change city')); fireEvent.press(screen.getByLabelText(name)); };

it.each([
  ['Salt Lake City', 'utah'], ['Jacksonville', 'jacksonville'], ['Asheville', 'asheville'], ['Black Mountain', 'asheville'], ['Weaverville', 'asheville'],
  ['Tallahassee', 'tallahassee'],
  ['Tucson', 'tucson'],
  ['Burlington', 'vermont-corridor'], ['South Burlington', 'vermont-corridor'], ['Williston', 'vermont-corridor'], ['Bristol', 'vermont-corridor'],
  ['Middlebury', 'vermont-corridor'], ['Vergennes', 'vermont-corridor'], ['Rutland', 'vermont-corridor'], ['Montpelier', 'vermont-corridor'], ['White River Junction', 'vermont-corridor'],
])('selecting %s searches its named region after permission denial', async (name, serviceRegion) => {
  render(<FeedScreen />, { wrapper: SelectedLocationProvider }); await screen.findByText('Your location is unavailable. Choose location or change city.');
  expect(mockCatalog.listEvents).not.toHaveBeenCalled();
  openOptions(); selectCity(name);
  await waitFor(() => expect(screen.getByTestId('search-place')).toHaveTextContent(`Searching ${name} · within 1 mile`));
  await waitFor(() => expect(mockCatalog.listEvents).toHaveBeenCalledWith({ serviceRegion, ratings: ['family', 'general'], limit: 200 }));
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

it('cancel and upcoming cities preserve the current feed choice', async () => {
  await AsyncStorage.setItem('onto.locationChoice.v2', JSON.stringify({ mode: 'city', cityId: 'asheville' }));
  render(<FeedScreen />, { wrapper: SelectedLocationProvider }); openOptions();
  await screen.findByText('Searching Asheville · within 1 mile');
  fireEvent.press(screen.getByLabelText('change city'));
  for (const name of COMING_SOON_CITIES) {
    const row = screen.getByLabelText(`${name}, Coming soon`);
    expect(row).toBeDisabled(); fireEvent.press(row);
  }
  fireEvent.press(screen.getByLabelText('Cancel city selection'));
  expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching Asheville/);
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

it('centers maps on the selected city, keeps cancel harmless and forgets confirmed pins after reopening', async () => {
  await AsyncStorage.setItem('onto.locationChoice.v2', JSON.stringify({ mode: 'city', cityId: 'asheville' }));
  const first = render(<FeedScreen />, { wrapper: SelectedLocationProvider }); openOptions(); await screen.findByText('Searching Asheville · within 1 mile');
  fireEvent.press(screen.getByLabelText('choose location'));
  expect(mockMapStart).toMatchObject({ lat: 35.5956, lng: -82.5486 });
  fireEvent.press(screen.getByLabelText('Cancel map'));
  expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching Asheville/);
  fireEvent.press(screen.getByLabelText('choose location')); fireEvent.press(screen.getByLabelText('Confirm Vermont pin'));
  await waitFor(() => expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching around your pin/));
  expect(screen.getByLabelText('choose location')).toBeSelected();
  expect(JSON.parse((await AsyncStorage.getItem('onto.locationChoice.v2'))!)).toEqual({ mode: 'city', cityId: 'asheville' });
  first.unmount(); render(<FeedScreen />, { wrapper: SelectedLocationProvider }); openOptions(); await screen.findByText('Searching Asheville · within 1 mile');
});

it('a late GPS fix cannot overwrite a deliberately chosen city', async () => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
  let finish!: (value: unknown) => void;
  jest.mocked(Location.getCurrentPositionAsync).mockImplementation(() => new Promise(resolve => { finish = resolve; }) as never);
  render(<FeedScreen />, { wrapper: SelectedLocationProvider }); await waitFor(() => expect(finish).toBeDefined());
  openOptions(); selectCity('Burlington');
  await act(async () => { finish({ coords: { latitude: 40.76, longitude: -111.89 } }); });
  expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching Burlington/);
  expect(mockCatalog.listEvents.mock.calls.every(([query]) => query.serviceRegion === 'vermont-corridor')).toBe(true);
});

it('waits for a remembered city before opening its map', async () => {
  const read = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;
  let release!: (value: string) => void;
  const pending = new Promise<string>(resolve => { release = resolve; });
  jest.mocked(AsyncStorage.getItem).mockImplementation(key => key === 'onto.locationChoice.v2' ? pending : read(key));
  try {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider }); openOptions();
    fireEvent.press(screen.getByLabelText('choose location'));
    expect(screen.queryByLabelText('Cancel map')).toBeNull();
    await act(async () => { release(JSON.stringify({ mode: 'city', cityId: 'asheville' })); });
    expect(screen.getByLabelText('Cancel map')).toBeTruthy();
    expect(mockMapStart).toMatchObject({ lat: 35.5956, lng: -82.5486 });
  } finally { jest.mocked(AsyncStorage.getItem).mockImplementation(read); }
});
