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

// Fixed clock: Wednesday, Oct 7, 2026 at 16:00 UTC (10:00 MDT / 12:00 EDT)
jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-10-07T16:00:00.000Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608,
    lng: -111.891,
    source: 'gps',
    loading: false,
    fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-10-07T00:00:00.000Z' }));
jest.mock('@/data/bundled-activities', () => ({
  BUNDLED_ACTIVITIES: [
    {
      id: 'slc-today',
      title: 'Wednesday Plaza Concert',
      category: 'music',
      venue: 'Gallivan Center',
      area: 'Downtown',
      lat: 40.764,
      lng: -111.891,
      whenLabel: 'Wed',
      startsInMinutes: 120,
      startsAtIso: '2026-10-07T18:00:00.000Z',
      timezone: 'America/Denver',
      description: 'Downtown concert today.',
      attendees: 0,
      rating: 'general',
      source: 'live',
      serviceRegion: 'utah',
    },
    {
      id: 'slc-tomorrow',
      title: 'Thursday Gallery Stroll',
      category: 'arts',
      venue: 'Utah Museum of Fine Arts',
      area: 'Downtown',
      lat: 40.764,
      lng: -111.891,
      whenLabel: 'Thu',
      startsInMinutes: 1560,
      startsAtIso: '2026-10-08T18:00:00.000Z',
      timezone: 'America/Denver',
      description: 'Thursday evening stroll.',
      attendees: 0,
      rating: 'general',
      source: 'live',
      serviceRegion: 'utah',
    },
    {
      id: 'slc-weekend',
      title: 'Saturday Farmers Market',
      category: 'food',
      venue: 'Pioneer Park',
      area: 'Downtown',
      lat: 40.764,
      lng: -111.891,
      whenLabel: 'Sat',
      startsInMinutes: 4320,
      startsAtIso: '2026-10-10T16:00:00.000Z',
      timezone: 'America/Denver',
      description: 'Weekend market.',
      attendees: 0,
      rating: 'general',
      source: 'live',
      serviceRegion: 'utah',
    },
    {
      id: 'jax-weekend',
      title: 'Jacksonville Riverside Arts Market',
      category: 'arts',
      venue: 'Riverside Arts Market',
      area: 'Riverside',
      lat: 30.3163,
      lng: -81.677,
      whenLabel: 'Sat',
      startsInMinutes: 4320,
      startsAtIso: '2026-10-10T14:00:00.000Z',
      timezone: 'America/New_York',
      description: 'Saturday market under the Fuller Warren Bridge.',
      attendees: 0,
      rating: 'general',
      source: 'live',
      serviceRegion: 'jacksonville',
    },
  ],
}));

describe('FeedScreen date and location filtering (#371)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
    await AsyncStorage.setItem('onto.feedRadius.v1', '10');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filters by Today, Tomorrow, This weekend, and custom dates, then clears back to all dates', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByText('Wednesday Plaza Concert')).toBeTruthy());
    expect(screen.getByText('Thursday Gallery Stroll')).toBeTruthy();
    expect(screen.getByText('Saturday Farmers Market')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByText('Tomorrow'));

    await waitFor(() => expect(screen.getByText('Thursday Gallery Stroll')).toBeTruthy());
    expect(screen.queryByText('Wednesday Plaza Concert')).toBeNull();
    expect(screen.queryByText('Saturday Farmers Market')).toBeNull();
    expect(screen.getByTestId('active-date-filter')).toBeTruthy();

    fireEvent.press(screen.getByText('This weekend'));
    await waitFor(() => expect(screen.getByText('Saturday Farmers Market')).toBeTruthy());
    expect(screen.queryByText('Thursday Gallery Stroll')).toBeNull();

    // Clear the active date filter and return to default discovery
    fireEvent.press(screen.getByLabelText('Clear active date filter'));
    await waitFor(() => expect(screen.getByText('Wednesday Plaza Concert')).toBeTruthy());
    expect(screen.getByText('Thursday Gallery Stroll')).toBeTruthy();
    expect(screen.getByText('Saturday Farmers Market')).toBeTruthy();
  });

  it('combines a manually chosen destination city with custom travel dates and reports an unmatched future window', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByText('Wednesday Plaza Concert')).toBeTruthy());

    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByLabelText('change city'));
    fireEvent.press(screen.getByText('Jacksonville'));

    fireEvent.press(screen.getByText('Pick dates'));
    fireEvent.changeText(screen.getByLabelText('Start date (YYYY-MM-DD)'), '2026-10-10');
    fireEvent.changeText(screen.getByLabelText('End date (YYYY-MM-DD, optional)'), '2026-10-11');
    fireEvent.press(screen.getByText('Apply dates'));

    await waitFor(() => expect(screen.getByText('Jacksonville Riverside Arts Market')).toBeTruthy());
    expect(screen.queryByText('Wednesday Plaza Concert')).toBeNull();
    expect(screen.getByTestId('active-date-filter')).toBeTruthy();

    // Selecting a date beyond the 60-day ICS window clearly states the horizon limit
    fireEvent.press(screen.getByText('Pick dates'));
    fireEvent.changeText(screen.getByLabelText('Start date (YYYY-MM-DD)'), '2027-01-15');
    fireEvent.changeText(screen.getByLabelText('End date (YYYY-MM-DD, optional)'), '2027-01-16');
    fireEvent.press(screen.getByText('Apply dates'));

    await waitFor(() => expect(screen.getByText('No matches for these filters.')).toBeTruthy());
  });

  it('does not fill an unmatched Discover window with a saved Going plan', async () => {
    await AsyncStorage.setItem('onto.joined.v1', '["slc-today"]');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await screen.findByText('Thursday Gallery Stroll');
    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByText('Pick dates'));
    fireEvent.changeText(screen.getByLabelText('Start date (YYYY-MM-DD)'), '2026-10-20');
    fireEvent.press(screen.getByText('Apply dates'));
    await screen.findByText('No matches for these filters.');
    expect(screen.queryByText('Wednesday Plaza Concert')).toBeNull();
  });

  it('combines times with search/interests and leaves mode in Account', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await screen.findByText('Wednesday Plaza Concert');
    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByLabelText('music'));
    fireEvent.press(screen.getByText('Pick dates'));
    fireEvent.changeText(screen.getByLabelText('Start date (YYYY-MM-DD)'), '2026-10-08');
    fireEvent.changeText(screen.getByLabelText('Start time (HH:MM, optional)'), '11:00');
    fireEvent.changeText(screen.getByLabelText('End time (HH:MM, optional)'), '13:00');
    fireEvent.press(screen.getByText('Apply dates'));
    await screen.findByText('No matches for these filters.');
    fireEvent.changeText(screen.getByLabelText('Search events'), 'Gallery');
    await screen.findByText('Thursday Gallery Stroll');
    expect(screen.queryByText('Wednesday Plaza Concert')).toBeNull();
    expect(screen.queryByText('Family')).toBeNull();
    expect(screen.queryByText('Everyone')).toBeNull();
    expect(screen.queryByText('21+')).toBeNull();
    fireEvent.press(screen.getByText('Pick dates'));
    fireEvent.changeText(screen.getByLabelText('End time (HH:MM, optional)'), '09:00');
    fireEvent.press(screen.getByText('Apply dates'));
    expect(screen.getByRole('alert')).toHaveTextContent('End must be after start.');
    expect(screen.getByText('Thursday Gallery Stroll')).toBeTruthy();
  });
});
