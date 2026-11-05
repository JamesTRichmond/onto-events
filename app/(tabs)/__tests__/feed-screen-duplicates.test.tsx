import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';

import FeedScreen from '../index';

jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-10-03T16:30:00Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

// Build 9 showed this happening twice: once from the Planetarium's own
// calendar and once from the county calendar that also lists it.
jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-10-03T00:00:00.000Z' }));
jest.mock('@/data/bundled-activities', () => {
  const base = {
    title: 'Sensory Friendly Saturday', category: 'community', venue: 'Clark Planetarium',
    area: 'Salt Lake City, UT', lat: 40.7651, lng: -111.9032, whenLabel: 'Sat, Oct 3',
    startsInMinutes: 0, startsAtIso: '2026-10-03T17:30:00.000Z', description: 'Under the dome.',
    attendees: 0, rating: 'general', source: 'live', sourceUrl: 'https://example.com/event',
  };
  return {
    BUNDLED_ACTIVITIES: [
      { ...base, id: 'ics-slco-events-1', sourceName: 'Salt Lake County Events' },
      // The Planetarium's own feed files the same happening under learning.
      { ...base, id: 'ics-clark-planetarium-1', sourceName: 'Clark Planetarium', category: 'learning' },
    ],
  };
});

describe('FeedScreen with one happening listed by two calendars', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows one card, credited to the venue', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getAllByLabelText('Details: Sensory Friendly Saturday')).toHaveLength(1));
    expect(screen.getByText('via Clark Planetarium')).toBeTruthy();
    expect(screen.queryByText('via Salt Lake County Events')).toBeNull();
  });
});
