import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/data/live-events', () => ({ GENERATED_AT: '2026-10-03T00:00:00.000Z' }));
jest.mock('@/data/bundled-activities', () => {
  const near = {
    id: 'near-show', title: 'Plaza concert', category: 'music', venue: 'Gallivan Center',
    area: 'Downtown', lat: 40.764, lng: -111.891, whenLabel: 'Sat', startsInMinutes: 60,
    startsAtIso: '2026-10-03T18:00:00.000Z', description: 'Downtown.', attendees: 0,
    rating: 'general', source: 'live',
  };
  // About 5 miles north of the Salt Lake anchor: inside 10, outside 1.
  const mid = {
    ...near, id: 'mid-show', title: 'Sugar House set', lat: 40.833, lng: -111.891,
  };
  // Provo is about 36 miles south of the Salt Lake anchor.
  const far = {
    ...near, id: 'far-show', title: 'Provo recital', lat: 40.2338, lng: -111.6585,
  };
  return { BUNDLED_ACTIVITIES: [near, mid, far] };
});

describe('Discover search radius', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to 1 mile, so a Sugar House event is out of range', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByText('Plaza concert')).toBeTruthy());
    expect(screen.queryByText('Sugar House set')).toBeNull();
    expect(screen.queryByText('Provo recital')).toBeNull();
    expect(screen.queryByTestId('search-place')).toBeNull();
    expect(screen.queryByText('This sky')).toBeNull();
    expect(screen.queryByText(/Searching Salt Lake City/)).toBeNull();
    fireEvent.press(screen.getByTestId('dash-toggle'));
    expect(screen.getByLabelText('1 mile')).toBeSelected();
  });

  it('a chosen radius is what the feed uses, and reopening restores it', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByText('Plaza concert')).toBeTruthy());
    fireEvent.press(screen.getByTestId('dash-toggle'));
    fireEvent.press(screen.getByLabelText('10 miles'));

    await waitFor(() => expect(screen.getByText('Sugar House set')).toBeTruthy());
    expect(screen.queryByText('Provo recital')).toBeNull();
    expect(screen.getByText('Plaza concert')).toBeTruthy();
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('onto.feedRadius.v1')).toBe('10');
    });
  });

  it('does not paint the 1-mile default before the saved radius loads', async () => {
    let release: (value: string | null) => void = () => {};
    const pending = new Promise<string | null>((resolve) => {
      release = resolve;
    });
    const storage = AsyncStorage as unknown as { getItem: typeof AsyncStorage.getItem };
    const original = storage.getItem;
    storage.getItem = ((key: string) => (
      key === 'onto.feedRadius.v1' ? pending : original(key)
    )) as typeof AsyncStorage.getItem;

    try {
      render(<FeedScreen />, { wrapper: SelectedLocationProvider });
      expect(screen.queryByText('Plaza concert')).toBeNull();
      expect(screen.queryByText('Sugar House set')).toBeNull();

      await act(async () => {
        release('10');
      });

      await waitFor(() => expect(screen.getByText('Sugar House set')).toBeTruthy());
      expect(screen.getByText('Plaza concert')).toBeTruthy();
      expect(screen.queryByText('Provo recital')).toBeNull();
      fireEvent.press(screen.getByTestId('dash-toggle'));
      expect(screen.getByLabelText('10 miles')).toBeSelected();
    } finally {
      storage.getItem = original;
    }
  });

  it('repairs an invalid saved radius to 1 mile', async () => {
    await AsyncStorage.setItem('onto.feedRadius.v1', 'invalid');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(async () => {
      expect(await AsyncStorage.getItem('onto.feedRadius.v1')).toBe('1');
    });
    await waitFor(() => expect(screen.getByText('Plaza concert')).toBeTruthy());
    expect(screen.queryByText('Sugar House set')).toBeNull();
  });
});
