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

// Monday 14:10 in Salt Lake City.
jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-08-31T20:10:00Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
  }),
}));

jest.mock('@/data/live-events', () => ({
  GENERATED_AT: '2026-08-31T00:00:00.000Z',
  LIVE_ACTIVITIES: [],
}));

// The closest thing is five days out, two are underway, one this evening;
// ticket-seller listings are hidden unless turned on, and then ride at the
// tail whatever the sort says.
// The shipped bundle never carries the demo seed (data/bundled-activities,
// 2026-09-27 "the demo seed never ships"); mock the bundle directly.
jest.mock('@/data/bundled-activities', () => {
  const monday = Date.parse('2026-08-31T20:10:00Z');
  const at = (minutes: number) => new Date(monday + minutes * 60000).toISOString();
  const base = {
    area: 'Downtown', description: 'x', attendees: 4, rating: 'general', source: 'live',
    whenLabel: 'baked', startsInMinutes: 0, sourceName: 'SLC Track Club', category: 'community',
  };
  const north = (mi: number) => ({ lat: 40.7608 + mi / 69, lng: -111.891 });
  return {
    BUNDLED_ACTIVITIES: [
      { ...base, ...north(0.05), id: 'saturday', title: 'Saturday market', venue: 'Pioneer Park', startsAtIso: at(60 * 24 * 5) },
      { ...base, ...north(2), id: 'run', title: 'Trail run', venue: 'Memory Grove', startsAtIso: at(-30) },
      { ...base, ...north(4), id: 'tm-now', title: 'Matinee', venue: 'Eccles Theater', sourceName: 'Ticketmaster', startsAtIso: at(-20) },
      { ...base, ...north(3), id: 'chess', title: 'Chess at the Library', venue: 'Main Library', startsAtIso: at(200) },
      { ...base, ...north(0.5), id: 'tm-late', title: 'Late show', venue: 'The Depot', sourceName: 'Ticketmaster', startsAtIso: at(400) },
    ],
  };
});

const HEADINGS = /^(onto activities happening now|things to do • scroll|onto activities coming up|Check event times|Places to explore|From ticket sellers)$/;
const headings = () => screen.getAllByText(HEADINGS).map((node) => node.props.children);
const openDash = () => fireEvent.press(screen.getByTestId('dash-toggle'));

describe('FeedScreen headings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('onto.feedRadius.v1', '100');
    await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
  });

  it('hides ticket sellers by default: free and local listings only (James, 2026-10-07)', async () => {
    await AsyncStorage.setItem('onto.feedSort.v1', 'nearest');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByText('Saturday market')).toBeTruthy());
    expect(screen.getByText('Trail run')).toBeTruthy();
    expect(screen.queryByText('Matinee')).toBeNull();
    expect(screen.queryByText('Late show')).toBeNull();
    expect(screen.queryByText('From ticket sellers')).toBeNull();
    expect(screen.queryByText(/^via Ticketmaster/)).toBeNull();
  });

  it('once turned on, closest keeps the order the viewer asked for; ticket sellers ride the tail', async () => {
    await AsyncStorage.setItem('onto.ticketSellers.v1', 'on');
    await AsyncStorage.setItem('onto.feedSort.v1', 'nearest');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(headings()).toEqual([
      'onto activities coming up', 'onto activities happening now', 'things to do • scroll',
      'onto activities happening now', 'From ticket sellers',
    ]));
    expect(screen.queryByText("Tonight's Plan")).toBeNull();
  });

  it('once turned on, soonest reorders by time, headings following the cards', async () => {
    await AsyncStorage.setItem('onto.ticketSellers.v1', 'on');
    await AsyncStorage.setItem('onto.feedSort.v1', 'nearest');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(headings().length).toBeGreaterThan(0));
    openDash();
    fireEvent.press(screen.getByText('soonest'));
    await waitFor(() => expect(headings()).toEqual([
      'onto activities happening now', 'things to do • scroll', 'onto activities coming up', 'From ticket sellers',
    ]));
  });
});
