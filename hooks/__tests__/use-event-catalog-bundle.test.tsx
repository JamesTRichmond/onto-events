/* eslint-disable @typescript-eslint/no-require-imports -- Use the existing isolated native storage mock. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';

import { BUNDLED_ACTIVITIES } from '@/data/bundled-activities';
import { LOCAL_GENERATED_AT } from '@/data/local-events';
import type { EventCatalogBackend } from '@/lib/backend/contracts';
import { buildFeed } from '@/lib/feed';
import { regionForSpot } from '@/lib/service-region';
import { useEventCatalog } from '../use-event-catalog';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const unavailable: EventCatalogBackend = {
  listEvents: jest.fn().mockRejectedValue(new Error('Offline')),
  getEvent: jest.fn().mockResolvedValue(null),
  getCatalogFreshness: jest.fn().mockResolvedValue(null),
};
// Freeze at the real bake's observation time; a historical bundle test must
// not fail merely because today's date passes the captured event horizon.
const observedAt = Date.parse(LOCAL_GENERATED_AT);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

it.each([
  'Burlington', 'Middlebury', 'Rutland City', 'Montpelier',
  'Bristol', 'Vergennes', 'White River Junction',
])('serves a real one-mile Everyone feed in %s on an offline cold start', async (locality) => {
  const { result } = renderHook(() =>
    useEventCatalog(unavailable, BUNDLED_ACTIVITIES, 'vermont-corridor'),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('bundled');
  expect(result.current.error).toBeTruthy();
  expect(result.current.activities.length).toBeGreaterThan(0);
  expect(result.current.activities.every((item) => regionForSpot(item) === 'vermont-corridor')).toBe(true);
  const publicVenue = result.current.activities.find((item) =>
    item.locality === locality && item.rating !== 'mature' &&
    Date.parse(item.startsAtIso ?? '') >= observedAt,
  );
  expect(publicVenue).toBeDefined();
  const feed = buildFeed(result.current.activities, {
    now: observedAt, lat: publicVenue!.lat, lng: publicVenue!.lng,
    radiusMi: 1, sort: 'soonest', mode: 'everyone', interests: new Set(),
  });
  expect(feed.items.length).toBeGreaterThan(0);
  expect(feed.items.every((item) => item.source === 'live' && item.rating !== 'mature')).toBe(true);
});

it('serves a real one-mile Everyone feed in Tallahassee on an offline cold start', async () => {
  const { result } = renderHook(() =>
    useEventCatalog(unavailable, BUNDLED_ACTIVITIES, 'tallahassee'),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('bundled');
  expect(result.current.error).toBeTruthy();
  expect(result.current.activities.length).toBeGreaterThan(0);
  expect(result.current.activities.every((item) => regionForSpot(item) === 'tallahassee')).toBe(true);
  const publicVenue = result.current.activities.find((item) =>
    item.locality === 'Tallahassee' && item.rating !== 'mature' &&
    Date.parse(item.startsAtIso ?? '') >= observedAt,
  );
  expect(publicVenue).toBeDefined();
  const feed = buildFeed(result.current.activities, {
    now: observedAt, lat: publicVenue!.lat, lng: publicVenue!.lng,
    radiusMi: 1, sort: 'soonest', mode: 'everyone', interests: new Set(),
  });
  expect(feed.items.length).toBeGreaterThan(0);
  expect(feed.items.every((item) => item.source === 'live' && item.rating !== 'mature')).toBe(true);
});

it('keeps actual offline region contents separate when the selected region changes', async () => {
  const { result, rerender } = renderHook(
    ({ region }: { region: 'vermont-corridor' | 'asheville' | 'utah' | 'tallahassee' }) =>
      useEventCatalog(null, BUNDLED_ACTIVITIES, region),
    { initialProps: { region: 'vermont-corridor' as const } },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  for (const region of ['asheville', 'utah', 'vermont-corridor', 'tallahassee'] as const) {
    rerender({ region });
    expect(result.current.source).toBe('bundled');
    expect(result.current.activities.length).toBeGreaterThan(0);
    expect(result.current.activities.every((item) => regionForSpot(item) === region)).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  }
});
