import { SelectedLocationProvider } from '@/hooks/use-selected-location';
// Gesture Handler's jest mocks load for every suite (package.json setupFiles):
// every Discover card is a gesture now.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import FeedScreen from '../index';

jest.mock('@/lib/backend/context', () => ({
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
    lat: 40.7608,
    lng: -111.891,
    source: 'gps',
    loading: false,
    fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

// A compact bundle the suite controls end to end: two general cards for the
// Everyone feed, one family card, one mature card. The search box that used
// to narrow the feed is gone with the dashboard, so the fixture is the knob.
jest.mock('@/data/live-events', () => ({
  GENERATED_AT: '2026-08-29T00:00:00.000Z',
  LIVE_ACTIVITIES: [],
}));
jest.mock('@/data/bundled-activities', () => {
  const saturday = Date.parse('2026-08-29T21:00:00Z');
  const at = (minutes: number) => new Date(saturday + minutes * 60000).toISOString();
  const base = {
    area: 'Downtown', description: 'x', attendees: 4, source: 'live',
    whenLabel: 'baked', startsInMinutes: 0, sourceName: 'SLC Track Club',
  };
  return {
    BUNDLED_ACTIVITIES: [
      { ...base, id: 'gallivan-concert', title: 'Concert on the plaza', category: 'music',
        venue: 'Gallivan Center', lat: 40.7643, lng: -111.8887, rating: 'general', startsAtIso: at(45) },
      { ...base, id: 'ensign-hike', title: 'Sunset hike: Ensign Peak', category: 'outdoors',
        venue: 'Ensign Peak', lat: 40.81, lng: -111.891, rating: 'general', startsAtIso: at(90) },
      { ...base, id: 'farmers-market', title: 'Downtown Farmers Market', category: 'community',
        venue: 'Pioneer Park', lat: 40.7568, lng: -111.9011, rating: 'family', startsAtIso: at(60) },
      { ...base, id: 'happy-hour', title: 'Happy hour meetup', category: 'food',
        venue: 'A bar', lat: 40.7608, lng: -111.891, rating: 'mature', startsAtIso: at(30) },
    ],
  };
});

const titles = () =>
  screen.getAllByLabelText(/^Details: /).map((el) => el.props.accessibilityLabel.replace(/^Details: /, ''));
const firstCard = () => screen.getAllByTestId('swipe-card')[0];
const firstTitle = () =>
  within(firstCard()).getByLabelText(/^Details: /).props.accessibilityLabel.replace(/^Details: /, '');
/** VoiceOver's named action on a card: the same sort a swipe makes. */
const sortByAction = (title: string, kind: 'pass' | 'maybe') =>
  fireEvent(screen.getByLabelText(`Details: ${title}`), 'accessibilityAction', {
    nativeEvent: { actionName: kind === 'pass' ? 'Not for me' : 'Maybe' },
  });
const drag = (id: string, dx: number) =>
  act(() => {
    fireGestureHandler(getByGestureTestId(`swipe-${id}`), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: dx / 2 },
      { state: State.ACTIVE, translationX: dx },
      { state: State.END, translationX: dx },
    ]);
  });
const openDash = () => fireEvent.press(screen.getByTestId('dash-toggle'));
const PLAZA = 'Concert on the plaza';
const HIKE = 'Sunset hike: Ensign Peak';
/** Cards become swipe targets once the saved sorts have loaded. */
const ready = () => waitFor(() => expect(screen.getAllByTestId('swipe-card').length).toBeGreaterThan(0));

describe('Discover: swipe sorts the cards', () => {
  beforeEach(async () => {
    jest.useRealTimers();
    await AsyncStorage.clear();
    // This suite is about swipe, not the 1-mile default. Ensign Peak is outside 1 mile.
    await AsyncStorage.setItem('onto.feedRadius.v1', '100');
  });

  it('swipe is always on; the sheet no longer offers a swipe/scroll pill (James, 2026-10-07)', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();
    expect(screen.getAllByTestId('swipe-card').length).toBeGreaterThan(1);

    openDash();
    expect(screen.queryByText('swipe')).toBeNull();
    expect(screen.queryByText('scroll')).toBeNull();
    expect(screen.getAllByTestId('swipe-card').length).toBeGreaterThan(1);
  });

  it('the swipe hint row is gone from the screen (James, 2026-09-29)', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();

    expect(screen.queryByTestId('swipe-hint')).toBeNull();
    expect(screen.queryByText('Not for me · swipe a card · Maybe')).toBeNull();
    // The old deck and its text buttons stay gone too.
    expect(screen.queryByTestId('swipe-deck')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not for me' })).toBeNull();
  });

  it('a right swipe moves the card into Maybes, stored as an id only', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();
    expect(titles()).toContain(PLAZA);

    drag('gallivan-concert', 160);

    await waitFor(() => expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull());
    expect(screen.getByTestId('undo-snackbar')).toBeTruthy();
    expect(screen.getByText(`In Maybes: ${PLAZA}`)).toBeTruthy();
    const saved = JSON.parse((await AsyncStorage.getItem('onto.maybes.v1')) ?? '[]');
    expect(saved).toEqual(['gallivan-concert']);
    // An id, never a coordinate or a title.
    expect(JSON.stringify(saved)).not.toMatch(/40\.7|111\.8|plaza/i);
  });

  it('a left sort tosses the card; Undo in the snackbar brings it back', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();
    const first = firstTitle();

    sortByAction(first, 'pass');

    await waitFor(() => expect(titles()).not.toContain(first));
    expect(screen.getByText(`Tossed: ${first}`)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Undo toss' }));
    await waitFor(() => expect(titles()).toContain(first));
    expect(screen.queryByTestId('undo-snackbar')).toBeNull();
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.passed.v1')).toBeNull());
  });

  it('a short drag springs back and sorts nothing', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();

    drag('gallivan-concert', -40);

    expect(titles()).toContain(PLAZA);
    expect(screen.queryByTestId('undo-snackbar')).toBeNull();
  });

  it('sorting everything says so; Bring back tossed restores the feed', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();

    sortByAction(PLAZA, 'pass');
    sortByAction(HIKE, 'maybe');

    await waitFor(() => expect(screen.getByText("That's everything here.")).toBeTruthy());
    expect(screen.getByText('Every card has a yes or a no.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Bring back tossed (1)' }));
    await waitFor(() => expect(titles()).toContain(PLAZA));
  });

  it('a Going plan leaves Discover without being tossed or losing its snapshot', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();
    const before = screen.getAllByTestId('swipe-card').length;

    fireEvent.press(screen.getByRole('button', { name: `Going: ${PLAZA}` }));

    await waitFor(() => expect(screen.getAllByTestId('swipe-card')).toHaveLength(before - 1));
    expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull();
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.going.events.v1')).toContain(PLAZA));
    expect((await AsyncStorage.getItem('onto.passed.v1')) ?? '').not.toContain('gallivan-concert');
  });

  it('no card is a swipe target until the saved sorts have loaded', async () => {
    await AsyncStorage.setItem('onto.passed.v1', JSON.stringify(['gallivan-concert']));
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(screen.queryAllByTestId('swipe-card')).toHaveLength(0);
    await waitFor(() => expect(screen.getAllByTestId('swipe-card').length).toBeGreaterThan(0));
    expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull();
  });

  it('a pan the system cancels springs the card back and sorts nothing', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();

    act(() => {
      fireGestureHandler(getByGestureTestId('swipe-gallivan-concert'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 140 },
        { state: State.CANCELLED, translationX: 140 },
      ]);
    });

    expect(titles()).toContain(PLAZA);
    expect(screen.queryByTestId('undo-snackbar')).toBeNull();
  });

  it('family mode: swipe cards stay RSVP-only, and a maybe saved in Everyone never shows (safety invariant)', async () => {
    await AsyncStorage.setItem('onto.mode.v1', 'family');
    // A maybe saved while browsing Everyone: family must never surface it.
    await AsyncStorage.setItem('onto.maybes.v1', JSON.stringify(['gallivan-concert']));
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await waitFor(() => expect(screen.getByText('Downtown Farmers Market')).toBeTruthy());
    expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull();
    await ready();
    const card = within(firstCard());
    const going = card.getByRole('button', { name: /^Going:/ });
    expect(going.props.accessibilityHint.startsWith('RSVP only:')).toBe(true);
    expect(card.getByText(/FAMILY/)).toBeTruthy();
    expect(card.queryByText("I'm in")).toBeNull();
    expect(card.queryByText(/slots open/)).toBeNull();
    expect(card.queryByText(/pair|match|stranger/i)).toBeNull();
    // The sorting chrome itself never speaks of meeting people.
    expect(screen.queryByText(/pair|match|stranger/i)).toBeNull();
  });

  it('the snackbar clears itself after a few seconds', async () => {
    jest.useFakeTimers();
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();
    await act(async () => { await jest.runOnlyPendingTimersAsync(); });
    sortByAction(firstTitle(), 'pass');
    await act(async () => { await jest.advanceTimersByTimeAsync(300); });
    expect(screen.getByTestId('undo-snackbar')).toBeTruthy();

    await act(async () => { await jest.advanceTimersByTimeAsync(6000); });

    expect(screen.queryByTestId('undo-snackbar')).toBeNull();
    jest.useRealTimers();
  });

  it('Maybes can be opened, tossed, and undone back onto that list', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();

    drag('gallivan-concert', 160);
    await waitFor(() => expect(screen.getByText('Maybes (1)')).toBeTruthy());
    fireEvent.press(screen.getByText('Maybes (1)'));

    expect(screen.getByLabelText(`Details: ${PLAZA}`)).toBeTruthy();
    const actions = screen.getByLabelText(`Details: ${PLAZA}`).props.accessibilityActions ?? [];
    expect(actions.map((action: { name: string }) => action.name)).toEqual(['Not for me']);
    drag('gallivan-concert', 160);
    expect(screen.getByLabelText(`Details: ${PLAZA}`)).toBeTruthy();
    sortByAction(PLAZA, 'pass');
    await waitFor(() => expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull());

    fireEvent.press(screen.getByRole('button', { name: 'Undo toss' }));
    await waitFor(() => expect(screen.getByLabelText(`Details: ${PLAZA}`)).toBeTruthy());

    fireEvent.press(screen.getByText('Back to the feed'));
    await waitFor(() => expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull());
    expect(screen.getByText('Maybes (1)')).toBeTruthy();
  });

  it('Bring back tossed returns a Maybe to Maybes, not the main feed', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await ready();

    drag('gallivan-concert', 160);
    await waitFor(() => expect(screen.getByText('Maybes (1)')).toBeTruthy());
    fireEvent.press(screen.getByText('Maybes (1)'));
    sortByAction(PLAZA, 'pass');
    await waitFor(() => expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull());

    fireEvent.press(screen.getByRole('button', { name: 'Bring back tossed (1)' }));
    await waitFor(() => expect(screen.getByLabelText(`Details: ${PLAZA}`)).toBeTruthy());
    fireEvent.press(screen.getByText('Back to the feed'));
    await waitFor(() => expect(screen.queryByLabelText(`Details: ${PLAZA}`)).toBeNull());
    expect(screen.getByText('Maybes (1)')).toBeTruthy();
  });
});
