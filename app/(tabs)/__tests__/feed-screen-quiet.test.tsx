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

// Monday 14:10 in Salt Lake City, and nothing on for hours: the quiet
// afternoon the product brief calls "empty Monday is the product".
jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-08-31T20:10:00Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
  }),
}));

// Two live items later the same label-day and one already underway: the
// heading over today reads the same either way now.
jest.mock('@/data/live-events', () => ({
  GENERATED_AT: '2026-08-31T00:00:00.000Z',
}));
jest.mock('@/data/bundled-activities', () => {
  const monday = Date.parse('2026-08-31T20:10:00Z');
  const at = (minutes: number) => new Date(monday + minutes * 60000).toISOString();
  const base = {
    venue: 'Somewhere', area: 'Downtown', lat: 40.7608, lng: -111.891,
    description: 'x', attendees: 4, rating: 'general', source: 'live',
    whenLabel: 'baked', startsInMinutes: 0,
  };
  return {
    BUNDLED_ACTIVITIES: [
      { ...base, id: 'chess', title: 'Chess at the Library', category: 'community', startsAtIso: at(200) },
      { ...base, id: 'show', title: 'Late show', category: 'music', startsAtIso: at(420) },
      { ...base, id: 'run', title: 'Trail run', category: 'fitness', lat: 40.86, lng: -111.891, startsAtIso: at(-30) },
    ],
  };
});

describe('FeedScreen on a quiet afternoon', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
  });

  it("the line over today reads things to do • scroll — never Tonight's Plan (James, 2026-09-29)", async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getAllByText('things to do • scroll').length).toBeGreaterThan(0));
    expect(screen.queryByText("Tonight's Plan")).toBeNull();
    expect(screen.queryByText('Later tonight')).toBeNull();
    expect(screen.queryByText(/Quiet right now/)).toBeNull();
    expect(screen.getByLabelText('Details: Chess at the Library')).toBeTruthy();
    expect(screen.getByLabelText('Details: Late show')).toBeTruthy();
  });

  it('a fresh 1-mile search leaves a run seven miles out', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getByLabelText('Details: Chess at the Library')).toBeTruthy());
    expect(screen.queryByLabelText('Details: Trail run')).toBeNull();
  });

  it('widening the distance finds the imminent run seven miles out', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getByLabelText('Details: Chess at the Library')).toBeTruthy());
    expect(screen.queryByLabelText('Details: Trail run')).toBeNull();
    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByLabelText('10 miles'));
    await waitFor(() => expect(screen.getByLabelText('Details: Trail run')).toBeTruthy());
    expect(screen.getByText('onto activities happening now')).toBeTruthy();
  });
});
