import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import type { Activity } from '@/data/activities';
import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import { eraseAllOntoData, STORAGE_KEYS } from '@/lib/storage';

import FeedScreen from '../index';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }),
}));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-28T16:00:00Z') }));
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));
let mockActivities: Activity[];
jest.mock('@/hooks/use-event-catalog', () => ({
  useEventCatalog: () => ({
    activities: mockActivities, source: 'bundled', updatedAt: '2026-10-28T15:00:00Z',
    error: null, refresh: jest.fn(),
  }),
}));

const music: Activity = {
  id: 'search-concert', title: 'Plaza concert', category: 'music', venue: 'Gallivan Center',
  area: 'Downtown', lat: 40.7608, lng: -111.891, whenLabel: '', startsInMinutes: 60,
  startsAtIso: '2026-10-28T17:00:00Z', description: 'Acoustic guitars.', attendees: 0,
  rating: 'general', source: 'live', sourceName: 'Test community calendar',
};
const arts: Activity = { ...music, id: 'search-art', title: 'Origami workshop', category: 'arts', venue: 'Art studio', description: 'Paper folding.' };
const emptyTitles = [
  'Nothing in range.', 'Nothing in this mode nearby.', 'Nothing in your interests nearby.',
  'No matches for these filters.', 'onto the next thing',
];
const mount = () => render(<FeedScreen />, { wrapper: SelectedLocationProvider });
const openOptions = () => fireEvent.press(screen.getByTestId('dash-toggle'));
const search = (query: string) => fireEvent.changeText(screen.getByLabelText('Search events'), query);

describe('Discover search, interests and real empty reasons', () => {
  beforeEach(async () => {
    delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
    mockActivities = [music, arts];
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEYS.firstRunLocationSeen, '1');
  });

  it('keeps controls inside feed options and leaves mode in Account', async () => {
    mount();
    await screen.findByText(music.title);
    expect(screen.queryByLabelText('Search events')).toBeNull();
    expect(screen.queryByText('Interests')).toBeNull();
    openOptions();
    const controls = within(screen.getByTestId('feed-controls'));
    expect(controls.getByLabelText('Search events')).toBeTruthy();
    expect(controls.getByText('Interests')).toBeTruthy();
    for (const label of ['Family', 'Everyone', '21+']) expect(controls.queryByText(label)).toBeNull();
    openOptions();
    expect(screen.queryByLabelText('Search events')).toBeNull();
  });

  it('searches title, venue and description case-insensitively and clears back to the feed', async () => {
    mount();
    await screen.findByText(music.title);
    openOptions();
    for (const query of [' PLAZA ', 'GALLIVAN', 'guitars']) {
      search(query);
      await waitFor(() => expect(screen.queryByText(arts.title)).toBeNull());
      expect(screen.getByText(music.title)).toBeTruthy();
    }
    openOptions();
    expect(screen.queryByText(arts.title)).toBeNull();
    openOptions();
    expect(screen.getByLabelText('Search events')).toHaveDisplayValue('guitars');
    fireEvent.press(screen.getByText('Clear search'));
    await screen.findByText(arts.title);
    expect(screen.getByText(music.title)).toBeTruthy();
  });

  it('filters by interests, persists them and restores all interests', async () => {
    const view = mount();
    await screen.findByText(music.title);
    openOptions();
    fireEvent.press(screen.getByText('music'));
    await waitFor(() => expect(screen.queryByText(arts.title)).toBeNull());
    expect(screen.getByText(music.title)).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem(STORAGE_KEYS.interests)).toBe('["music"]'));
    view.unmount();
    mount();
    await screen.findByText(music.title);
    expect(screen.queryByText(arts.title)).toBeNull();
    openOptions();
    expect(screen.getByLabelText('music')).toBeSelected();
    fireEvent.press(screen.getByText('All interests'));
    await screen.findByText(arts.title);
    await waitFor(async () => expect(await AsyncStorage.getItem(STORAGE_KEYS.interests)).toBe('[]'));
  });

  it('lets search look beyond interests while still enforcing mode', async () => {
    mockActivities.push({ ...arts, id: 'mature-art', title: 'Mature origami', rating: 'mature' });
    await AsyncStorage.setItem(STORAGE_KEYS.interests, '["music"]');
    mount();
    await screen.findByText(music.title);
    openOptions();
    search('origami');
    await screen.findByText(arts.title);
    expect(screen.queryByText(music.title)).toBeNull();
    expect(screen.queryByText('Mature origami')).toBeNull();
    fireEvent.press(screen.getByText('Clear search'));
    await screen.findByText(music.title);
    expect(screen.queryByText(arts.title)).toBeNull();
  });

  it('waits for saved interests before painting an unfiltered feed', async () => {
    const original = AsyncStorage.getItem;
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const gatedRead = jest.fn((key: string) => key === STORAGE_KEYS.interests ? pending : original(key));
    AsyncStorage.getItem = gatedRead;
    try {
      mount();
      await waitFor(() => expect(gatedRead).toHaveBeenCalledWith(STORAGE_KEYS.interests));
      expect(screen.queryByText(music.title)).toBeNull();
      expect(screen.queryByText(arts.title)).toBeNull();
      await act(async () => { release('["music"]'); });
      await screen.findByText(music.title);
      expect(screen.queryByText(arts.title)).toBeNull();
    } finally { AsyncStorage.getItem = original; }
  });

  it.each([
    ['out-of-range', 'Nothing in range.', 'Open feed options and widen the distance or choose another place.'],
    ['hidden-by-mode', 'Nothing in this mode nearby.', 'What is around right now lives in another tier — switch modes in Account.'],
    ['no-interest', 'Nothing in your interests nearby.', 'Open feed options to change Interests, or search for an event.'],
    ['no-match', 'No matches for these filters.', 'Clear the search or adjust feed options.'],
    ['no-data', 'onto the next thing', 'Try downtown.'],
  ])('renders the real %s reason from buildFeed', async (reason, title, hint) => {
    if (reason === 'out-of-range') mockActivities = [{ ...music, lat: 40.2338, lng: -111.6585 }];
    if (reason === 'hidden-by-mode') mockActivities = [{ ...music, rating: 'family' }];
    if (reason === 'no-interest') await AsyncStorage.setItem(STORAGE_KEYS.interests, '["fitness"]');
    if (reason === 'no-data') mockActivities = [];
    mount();
    if (reason === 'no-match') {
      await screen.findByText(music.title);
      openOptions();
      search('no such event');
    }
    await screen.findByText(title);
    expect(screen.getByText(hint)).toBeTruthy();
    for (const other of emptyTitles.filter((t) => t !== title)) expect(screen.queryByText(other)).toBeNull();
  });

  it('renders items and no feed empty message for none', async () => {
    mount();
    await screen.findByText(music.title);
    for (const title of emptyTitles) expect(screen.queryByText(title)).toBeNull();
  });

  it('erases active search and interests with local data', async () => {
    mount();
    await screen.findByText(music.title);
    openOptions();
    fireEvent.press(screen.getByText('music'));
    search('Plaza');
    await waitFor(() => expect(screen.queryByText(arts.title)).toBeNull());
    await act(async () => { await eraseAllOntoData(); });
    await screen.findByText(arts.title);
    expect(screen.getByLabelText('Search events')).toHaveDisplayValue('');
    expect(screen.getByLabelText('All interests')).toBeSelected();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.interests)).toBeNull();
  });
});
