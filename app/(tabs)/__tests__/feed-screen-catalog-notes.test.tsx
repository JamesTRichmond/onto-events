import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';

import FeedScreen from '../index';

// One stable backend whose next answer each test decides.
const mockCatalogBackend = {
  listEvents: jest.fn(),
  getEvent: jest.fn(),
  getCatalogFreshness: jest.fn(),
};
jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: mockCatalogBackend, rsvpBackend: null, rsvpOwnerId: null }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-09-27T18:00:00Z'),
}));

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-09-22T00:00:00.000Z' }));
jest.mock('@/data/bundled-activities', () => ({ BUNDLED_ACTIVITIES: [] }));

const saved = {
  id: 'saved-1', sourceName: 'Salt Lake Buddhist Temple', sourceEventId: 'saved-1',
  sourceUrl: 'https://example.com/event', title: 'Saved service', description: 'Open to the public',
  venueName: 'Salt Lake Buddhist Temple', locality: 'Salt Lake City', region: 'UT', countryCode: 'US',
  latitude: 40.7608, longitude: -111.891, category: 'community', rating: 'general',
  startsAt: '2026-09-27T20:00:00.000Z', endsAt: null, timezone: 'America/Denver', imageUrl: null,
  isCancelled: false, isRoadtrip: false,
  ingestedAt: '2026-09-26T23:16:00.000Z', updatedAt: '2026-09-26T23:16:00.000Z',
};

const OFFLINE = 'Offline — showing saved events.';

describe('FeedScreen catalog notes with saved events', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await AsyncStorage.setItem(
      'onto.catalog.v1',
      JSON.stringify({ items: [saved], updatedAt: '2026-09-26T23:16:00.000Z' }),
    );
    mockCatalogBackend.getCatalogFreshness.mockResolvedValue(null);
  });

  it('does not call a normal launch fetch offline while saved events are showing', async () => {
    mockCatalogBackend.listEvents.mockReturnValue(new Promise(() => {}));
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(await screen.findByLabelText('Details: Saved service')).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it('says offline once the fetch has actually failed', async () => {
    mockCatalogBackend.listEvents.mockRejectedValue(new Error('offline'));
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(await screen.findByText(OFFLINE)).toBeTruthy();
    expect(screen.getByLabelText('Details: Saved service')).toBeTruthy();
  });
});
