import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import FeedScreen from '../index';

jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-10-03T16:00:00.000Z'),
}));

const mockRefresh = jest.fn();
let mockGps = true;
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => (mockGps
    ? { lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null, refresh: mockRefresh }
    : { lat: 40.7608, lng: -111.891, source: 'fallback', loading: false, fallbackReason: 'denied', refresh: mockRefresh }),
}));

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-10-03T00:00:00.000Z' }));

let mockActivities: unknown[] = [];
jest.mock('@/data/bundled-activities', () => ({
  get BUNDLED_ACTIVITIES() { return mockActivities; },
}));

const base = {
  id: 'sugar-house', title: 'Sugar House set', category: 'music', venue: 'Sugar House Park',
  area: 'Sugar House', whenLabel: 'Sat', startsInMinutes: 60,
  startsAtIso: '2026-10-03T18:00:00.000Z', description: 'South of downtown.', attendees: 0,
  rating: 'general', source: 'live',
};
// About 2.7 miles north of the Salt Lake anchor: outside 1 and 2, inside 5.
const nearish = { ...base, lat: 40.8, lng: -111.891 };
// St. George is about 260 miles away, still in Utah: outside every distance choice.
const faraway = { ...base, id: 'st-george', title: 'St. George set', lat: 37.0965, lng: -113.5684 };

describe('Discover empty screens offer a way out', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
    mockGps = true;
    mockRefresh.mockClear();
  });

  it('out of range: one tap widens to the nearest distance with events and saves it', async () => {
    mockActivities = [nearish];
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await screen.findByText('Nothing in range.');
    const widen = screen.getByRole('button', { name: 'Widen to 5 mi · 1 event' });
    fireEvent.press(widen);
    await waitFor(() => expect(screen.getByText('Sugar House set')).toBeTruthy());
    expect(screen.queryByText('Nothing in range.')).toBeNull();
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.feedRadius.v1')).toBe('5'));
  });

  it('out of range with nothing within 100 miles: no widen button, the hint stays', async () => {
    mockActivities = [faraway];
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await screen.findByText('Nothing in range.');
    expect(screen.getByText('Open feed options and widen the distance or choose another place.')).toBeTruthy();
    expect(screen.queryByText(/^Widen to/)).toBeNull();
  });

  it('location unavailable: Pick a city opens the picker and a city fills the feed', async () => {
    mockGps = false;
    mockActivities = [{ ...base, lat: 40.762, lng: -111.891 }];
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    const pick = await screen.findByRole('button', { name: 'Pick a city' });
    fireEvent.press(pick);
    expect(screen.getByTestId('city-picker')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Salt Lake City'));
    await waitFor(() => expect(screen.getByText('Sugar House set')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Pick a city' })).toBeNull();
  });

  it('location unavailable: Try location again asks the device once more', async () => {
    mockGps = false;
    mockActivities = [nearish];
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    fireEvent.press(await screen.findByRole('button', { name: 'Try location again' }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });
});
