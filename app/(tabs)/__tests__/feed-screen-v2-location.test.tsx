import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FeedScreen from '../index';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/backend/context', () => ({ useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }) }));
const mockEnabled: boolean[] = [];
const mockRefresh = jest.fn();
jest.mock('@/hooks/use-user-location', () => ({ useUserLocation: (enabled: boolean) => {
  mockEnabled.push(enabled);
  return { lat: 40.7608, lng: -111.891, source: 'fallback', loading: false, fallbackReason: 'permission-denied', refresh: mockRefresh };
} }));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-09-30T12:00:00Z') }));
jest.mock('@/components/ui/pin-picker', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return { PinPicker: ({ onPick, onClose }: { onPick: (spot: {lat: number; lng: number}) => void; onClose: () => void }) =>
    <View testID="test-pin"><Pressable accessibilityLabel="Pick test pin" onPress={() => onPick({ lat: 40.71, lng: -111.88 })}><Text>Pick</Text></Pressable><Pressable accessibilityLabel="Cancel test pin" onPress={onClose}><Text>Cancel</Text></Pressable></View> };
});

beforeEach(async () => { await AsyncStorage.clear(); await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1'); jest.clearAllMocks(); mockEnabled.length = 0; mockRefresh.mockClear(); });

it('pin cancel, pick, move and reset leave coordinates in memory only and suppress device requests', async () => {
  const first = render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  await screen.findByText('Your location is unavailable. Choose location or change city.');
  fireEvent.press(screen.getByTestId('dash-toggle'));
  fireEvent.press(screen.getByLabelText('choose location'));
  fireEvent.press(screen.getByLabelText('Cancel test pin'));
  expect(screen.queryByTestId('test-pin')).toBeNull();
  fireEvent.press(screen.getByLabelText('choose location'));
  fireEvent.press(screen.getByLabelText('Pick test pin'));
  expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching around your pin/);
  expect(mockEnabled.at(-1)).toBe(false);
  expect(screen.getByLabelText('choose location')).toBeSelected();
  fireEvent.press(screen.getByLabelText('choose location'));
  fireEvent.press(screen.getByLabelText('Cancel test pin'));
  expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching around your pin/);
  expect(JSON.stringify((AsyncStorage.setItem as jest.Mock).mock.calls)).not.toContain('40.71');
  fireEvent.press(screen.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Salt Lake City'));
  await waitFor(() => expect(screen.getByLabelText('change city')).toBeSelected());
  fireEvent.press(screen.getByLabelText('my location'));
  expect(mockRefresh).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByLabelText('my location')).toBeSelected());
  first.unmount();
  render(<FeedScreen />, { wrapper: SelectedLocationProvider });
  expect(screen.queryByTestId('search-place')).toBeNull();
  expect(await screen.findByText('Your location is unavailable. Choose location or change city.')).toBeTruthy();
  fireEvent.press(screen.getByTestId('dash-toggle'));
  await waitFor(() => expect(screen.getByTestId('search-place')).toHaveTextContent(/Choose a search location/));
});
