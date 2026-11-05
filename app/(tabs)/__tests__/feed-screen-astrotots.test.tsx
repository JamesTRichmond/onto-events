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
  useNow: () => Date.parse('2026-09-30T16:00:00Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-09-30T00:00:00.000Z' }));
jest.mock('@/data/bundled-activities', () => {
  const base = {
    title: 'AstroTots', category: 'learning', venue: 'Clark Planetarium',
    area: 'Salt Lake City, UT', lat: 40.7669, lng: -111.9026, whenLabel: 'Thu, Oct 1',
    startsInMinutes: 0, description: 'Pre-K astronomy.', attendees: 0, rating: 'family',
    source: 'live', sourceUrl: 'https://example.com/astrotots', sourceName: 'Clark Planetarium',
  };
  return {
    BUNDLED_ACTIVITIES: [
      {
        ...base, id: 'ics-clark-astro-thu', startsAtIso: '2026-10-01T16:30:00.000Z',
        sourceEventId: '["single","http://uid.trumba.com/event/206808077"]',
      },
      {
        ...base, id: 'ics-slco-astro-thu', sourceName: 'Salt Lake County Events',
        category: 'community', lat: 40.7669 + 0.05, startsAtIso: '2026-10-01T16:30:00.000Z',
        sourceEventId: '["single","http://uid.trumba.com/event/206808077"]',
      },
      {
        ...base, id: 'ics-clark-astro-tue', startsAtIso: '2026-10-06T16:30:00.000Z',
        sourceEventId: '["single","http://uid.trumba.com/event/206808071"]',
      },
    ],
  };
});

describe('AstroTots on the feed', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('onto.mode.v1', 'family');
  });

  it('shows one card for the Thursday class and keeps Tuesday as its own session', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getAllByLabelText('Details: AstroTots')).toHaveLength(2));
    expect(screen.getAllByText('via Clark Planetarium')).toHaveLength(2);
    expect(screen.queryByText('via Salt Lake County Events')).toBeNull();
  });
});
