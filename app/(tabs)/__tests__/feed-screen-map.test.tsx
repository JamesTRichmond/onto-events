import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import FeedScreen from '../index';

jest.mock('@/components/ui/event-map', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    EventMap: (props: { title: string }) => <Text testID="event-map">{props.title}</Text>,
  };
});

jest.mock('@/lib/backend/context', () => ({
  useOptionalOntoBackend: () => null,
  useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-08-29T21:00:00Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-08-29T00:00:00.000Z', LIVE_ACTIVITIES: [] }));
jest.mock('@/data/bundled-activities', () => {
  const { SEED_ACTIVITIES } = jest.requireActual('@/data/activities');
  return {
    BUNDLED_ACTIVITIES: SEED_ACTIVITIES.filter(
      (activity: { rating: string; id: string }) => activity.rating === 'general' && activity.id === 'gallivan-concert',
    ),
  };
});

describe('event map while browsing by distance', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
  });

  it('toggles a map from the details of an event found by distance', async () => {
    await AsyncStorage.setItem('onto.feedSort.v1', 'nearest');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getByLabelText('Details: Concert on the plaza')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Details: Concert on the plaza'));
    fireEvent.press(screen.getByLabelText('Map of Concert on the plaza'));

    expect(screen.getByTestId('event-map').props.children).toBe('Gallivan Center');
    fireEvent.press(screen.getByLabelText('Hide map of Concert on the plaza'));
    expect(screen.queryByTestId('event-map')).toBeNull();
  });

  it('does not offer the map when the feed is sorted by time', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByLabelText('Details: Concert on the plaza')).toBeTruthy());
    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByText('soonest'));
    fireEvent.press(screen.getByLabelText('Details: Concert on the plaza'));

    expect(screen.queryByLabelText('Map of Concert on the plaza')).toBeNull();
    expect(screen.queryByTestId('event-map')).toBeNull();
  });
});
