import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import FeedScreen from '../index';

jest.mock('@/lib/backend/context', () => ({
  useOptionalOntoBackend: () => null,
  useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Deterministic clock: pretend "now" is a fixed instant so live events from
// the baked data neither appear nor vanish under the test.
jest.mock('@/hooks/use-now', () => ({
  useNow: () => Date.parse('2026-08-29T21:00:00Z'),
}));

// Swappable per test: the default is a Salt Lake City fix, one test
// moves the device to Vermont to exercise the regional delivery.
const mockRefresh = jest.fn();
const mockLocation = {
  current: { lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null },
};
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ ...mockLocation.current, refresh: mockRefresh }),
}));

const SLC_GPS = { ...mockLocation.current };
const VERMONT_GPS = { lat: 44.0153, lng: -73.1673, source: 'gps', loading: false, fallbackReason: null };

// Live bake can ship hundreds of nearby mature cards; FlatList only mounts a
// window of them, which breaks assertions on specific seed titles. Keep the
// suite on the stable seed/family/roadtrip fixtures. The demo seed is a test
// fixture only: the shipped bundle never carries it (data/bundled-activities).
jest.mock('@/data/live-events', () => ({
  GENERATED_AT: '2026-08-29T00:00:00.000Z',
  LIVE_ACTIVITIES: [],
}));
jest.mock('@/data/bundled-activities', () => {
  const { SEED_ACTIVITIES } = jest.requireActual('@/data/activities');
  const { FAMILY_ACTIVITIES } = jest.requireActual('@/data/family-events');
  const { ROADTRIP_ACTIVITIES } = jest.requireActual('@/data/roadtrip-events');
  return {
    BUNDLED_ACTIVITIES: [...SEED_ACTIVITIES, ...FAMILY_ACTIVITIES, ...ROADTRIP_ACTIVITIES].filter(
      (activity: { source: string }) => activity.source !== 'user',
    ),
  };
});

describe('FeedScreen', () => {
  const openDash = () => fireEvent.press(screen.getByTestId('dash-toggle'));
  const cards = () => waitFor(() => {
    expect(screen.getAllByLabelText(/^Details: /).length).toBeGreaterThan(0);
  });

  beforeEach(async () => {
    delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
    mockLocation.current = SLC_GPS;
    await AsyncStorage.clear();
    // Retain this suite's wide legacy fixture window; fresh-install behavior
    // has its own explicit test below.
    await AsyncStorage.setItem('onto.feedRadius.v1', '100');
    await AsyncStorage.setItem('onto.firstRunLocationSeen.v1', '1');
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
  });

  it('answers first: the dashboard is wordmark, tagline, chevron — nothing else', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(screen.getByText('onto')).toBeTruthy();
    expect(screen.getByText('things to do near you')).toBeTruthy();
    expect(screen.getByTestId('dash-toggle')).toBeTruthy();
    // Freshness is tucked behind the wordmark: hidden until tapped.
    expect(screen.queryByTestId('discover-last-refreshed')).toBeNull();
    fireEvent.press(screen.getByTestId('wordmark-button'));
    expect(screen.getByTestId('discover-last-refreshed')).toBeTruthy();
    expect(screen.getByText(/^Updated /)).toBeTruthy();
    fireEvent.press(screen.getByTestId('wordmark-button'));
    expect(screen.queryByTestId('discover-last-refreshed')).toBeNull();
    // The first card is on the first screen once the saved radius is known; no control is.
    await cards();
    expect(screen.queryByTestId('feed-controls')).toBeNull();
    expect(screen.queryByTestId('search-place')).toBeNull();
    expect(screen.queryByText(/^Search:/)).toBeNull();
    // Everything James removed from the dashboard (2026-09-29) stays gone.
    expect(screen.queryByText('my location')).toBeNull();
    expect(screen.queryByText('choose location')).toBeNull();
    expect(screen.queryByText('change city')).toBeNull();
    expect(screen.queryByText('Free only')).toBeNull();
    expect(screen.queryByText('Swipe mode')).toBeNull();
    expect(screen.queryByText(/^Going \(\d+\)$/)).toBeNull();
    expect(screen.queryByText(/^On me · /)).toBeNull();
    expect(screen.queryByText('Search')).toBeNull();
    expect(screen.queryByText(/^Up to \d+ mi$/)).toBeNull();
    expect(screen.queryByText('For you')).toBeNull();
    expect(screen.queryByText('This sky')).toBeNull();
    expect(screen.queryByText('Mode')).toBeNull();
    expect(screen.queryByText('Family')).toBeNull();
    expect(screen.queryByText('Pick your interests')).toBeNull();
    expect(screen.queryByTestId('swipe-hint')).toBeNull();
    expect(screen.queryByText('Not for me · swipe a card · Maybe')).toBeNull();
    const statusScrim = screen.getByTestId('sky-status-scrim', { includeHiddenElements: true });
    expect(statusScrim).toHaveStyle({ backgroundColor: '#171A34' });
    expect(statusScrim.props.edges).toEqual({ top: 'additive', right: 'off', bottom: 'off', left: 'off' });
  });

  it('the chevron opens V2 controls inside the dashboard, and closes it again', () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    openDash();
    expect(screen.getByTestId('feed-controls')).toBeTruthy();
    expect(screen.getByText('closest')).toBeTruthy();
    expect(screen.getByText('soonest')).toBeTruthy();
    expect(screen.getByLabelText('my location')).toBeTruthy();
    expect(screen.getByLabelText('choose location')).toBeTruthy();
    expect(screen.getByLabelText('change city')).toBeTruthy();
    expect(screen.getByText('GPS')).toBeTruthy();
    expect(screen.getByText('Map Pin')).toBeTruthy();
    expect(screen.getByText('City')).toBeTruthy();
    expect(screen.queryByText('This sky')).toBeNull();
    expect(screen.queryByText('Weather considered')).toBeNull();
    expect(screen.getByLabelText('1 mile')).toBeSelected();
    // Search/interests returned on 2026-10-28; other removed controls stay gone.
    for (const gone of ['For you', 'swipe', 'scroll', 'Free only', 'Includes food', 'Find me', 'Drop a pin', 'Move pin']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.queryByText(/^Going \(\d+\)$/)).toBeNull();
    expect(screen.queryByText(/^Interests \(\d+\)$/)).toBeNull();
    expect(screen.getByLabelText('Search events')).toBeTruthy();
    expect(screen.getByText('Interests')).toBeTruthy();

    openDash();
    expect(screen.queryByTestId('feed-controls')).toBeNull();
  });

  it('soonest is the standing read; closest switches the sort and persists', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    openDash();
    expect(screen.getByLabelText('soonest')).toBeSelected();
    fireEvent.press(screen.getByText('closest'));
    expect(screen.getByLabelText('closest')).toBeSelected();
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('onto.feedSort.v1')).toBe('nearest');
    });
  });

  it('a stored sort the pills no longer offer falls back to soonest', async () => {
    for (const saved of ['type', 'foryou']) {
      await AsyncStorage.setItem('onto.feedSort.v1', saved);
      const { unmount } = render(<FeedScreen />, { wrapper: SelectedLocationProvider });

      openDash();
      await waitFor(() => expect(screen.getByLabelText('soonest')).toBeSelected());
      expect(screen.queryByText('Type')).toBeNull();
      expect(screen.queryByText('For you')).toBeNull();
      unmount();
    }
  });

  it('Everyone mode shows general supply and hides family/mature (modes, not filters)', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await cards();

    // Gallivan Center plaza concert: 0.3 mi, general — always in the window.
    expect(screen.getByText('Concert on the plaza')).toBeTruthy();
    // Family and mature supply is in other modes.
    expect(screen.queryByText('Downtown Farmers Market')).toBeNull();
    expect(screen.queryByText('Happy hour meetup')).toBeNull();
  });

  it("marking Going removes the card from Discover and preserves its event snapshot", async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await cards();

    // Target the Gallivan plaza card by its accessible label rather than by
    // position in the list, so a reordered feed cannot silently pass this.
    expect(screen.queryByLabelText('Share Concert on the plaza')).toBeNull();
    fireEvent.press(screen.getByLabelText('Going: Concert on the plaza'));

    await waitFor(() => expect(screen.queryByText('Concert on the plaza')).toBeNull());
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.going.events.v1')).toContain('Concert on the plaza'));
    // Other cards remain available in Discover.
    expect(screen.getAllByText('Going').length).toBeGreaterThan(0);
  });

  it('restores saved interests and exposes their selected control in feed options', async () => {
    await AsyncStorage.setItem('onto.interests.v1', JSON.stringify(['music']));
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await cards();
    expect(screen.getByText('Concert on the plaza')).toBeTruthy();
    openDash();
    expect(screen.getByText('Interests')).toBeTruthy();
    expect(screen.getByLabelText('music')).toBeSelected();
  });

  it('family mode is RSVP-only: no pairing affordances anywhere (safety invariant)', async () => {
    await AsyncStorage.setItem('onto.mode.v1', 'family');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getByText('Downtown Farmers Market')).toBeTruthy());
    const rsvps = screen.getAllByRole('button', { name: /^Going:/ });
    expect(rsvps.length).toBeGreaterThan(0);
    expect(rsvps.every((button) => button.props.accessibilityHint.startsWith('RSVP only:'))).toBe(true);
    expect(screen.queryByText("I'm in")).toBeNull();
    expect(screen.queryByText(/slots open/)).toBeNull();
  });

  it('unsupported distant locations explain availability and do not show SLC cards', async () => {
    mockLocation.current = { ...VERMONT_GPS, lat: 32.7767, lng: -96.7970 };
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await screen.findByText('onto is not available in this area yet. Choose location or change city.');
    expect(screen.queryByText('Concert on the plaza')).toBeNull();
  });

  it('recognizes Vermont without claiming Salt Lake City is local', async () => {
    mockLocation.current = VERMONT_GPS;
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    expect(screen.queryByTestId('far-from-slc')).toBeNull();
    await waitFor(() => expect(screen.queryByText('Concert on the plaza')).toBeNull());
  });

  it('does not show synthetic social proof or matching slots in v1', () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(screen.queryByText(/\d+ interested/)).toBeNull();
    expect(screen.queryByText(/slots open/)).toBeNull();
  });

  it('never puts Tickets & details on the card face', async () => {
    await AsyncStorage.setItem('onto.mode.v1', 'family');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getByText('Downtown Farmers Market')).toBeTruthy());
    expect(screen.queryByText('Tickets & details')).toBeNull();
    expect(screen.queryByText('Source')).toBeNull();
  });

  it('opens Source from details only over https', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await AsyncStorage.setItem('onto.mode.v1', 'family');
    // NHMU is about 3.5 miles from the anchor, outside the 1-mile default.
    await AsyncStorage.setItem('onto.feedRadius.v1', '100');
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getByLabelText('Details: Chemistry Night')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Details: Chemistry Night'));
    const source = screen.getByRole('link', { name: 'Source for Chemistry Night' });
    fireEvent.press(source);

    expect(openUrl).toHaveBeenCalled();
    for (const [url] of openUrl.mock.calls) {
      expect(url).toMatch(/^https:\/\//i);
    }
    openUrl.mockRestore();
  });

  it('details sheet carries a Directions action', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await cards();
    fireEvent.press(screen.getByLabelText('Details: Concert on the plaza'));
    expect(screen.getByLabelText('Directions to Gallivan Center')).toBeTruthy();
  });

  it('tapping the card body opens details without joining', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await cards();
    fireEvent.press(screen.getByLabelText('Details: Concert on the plaza'));
    expect(screen.getByTestId('activity-details')).toBeTruthy();
    expect(screen.getByText('Outdoor stage downtown. Lawn chairs and food trucks.')).toBeTruthy();
    expect(screen.queryByText('Going ✓')).toBeNull();
    expect(screen.queryByText(/Going \(/)).toBeNull();
  });

  it('never exposes mature supply in the v1 feed, and offers no 21+ control here', () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    openDash();
    expect(screen.queryByText('21+')).toBeNull();
    expect(screen.queryByText('Happy hour meetup')).toBeNull();
    expect(screen.queryByText('Casino showroom night')).toBeNull();
  });

  it('fresh install defaults to soonest at one mile, with options open on first run', async () => {
    await AsyncStorage.clear();
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await waitFor(() => expect(screen.getByTestId('search-place')).toHaveTextContent(/within 1 mile/));
    expect(screen.getByTestId('feed-controls')).toBeTruthy();
    expect(screen.queryByText(/Searching Salt Lake City/)).toBeNull();
    expect(screen.getByLabelText('1 mile')).toBeSelected();
    expect(screen.getByLabelText('soonest')).toBeSelected();
  });

  it('invalid custom distance is explained and cannot replace the current choice', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    openDash();
    fireEvent.press(screen.getByLabelText('2 miles'));
    fireEvent.press(screen.getByText('Custom'));
    fireEvent.changeText(screen.getByLabelText('Custom distance in miles'), 'Infinity');
    fireEvent.press(screen.getByText('Apply distance'));
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter a distance from 1 to 100 miles/);
    expect(screen.getByLabelText('2 miles')).toBeSelected();
    fireEvent.changeText(screen.getByLabelText('Custom distance in miles'), '7.5');
    fireEvent.press(screen.getByText('Apply distance'));
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.feedRadius.v1')).toBe('7.5'));
  });
});
