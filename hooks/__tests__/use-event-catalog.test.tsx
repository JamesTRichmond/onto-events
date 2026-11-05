import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Activity } from '@/data/activities';
import type {
  CatalogEvent,
  EventCatalogBackend,
} from '@/lib/backend/contracts';
import { invalidatePublicCatalog } from '@/lib/catalog-refresh';
import { STORAGE_KEYS } from '@/lib/storage';

import { useEventCatalog } from '../use-event-catalog';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const emptyBundle: Activity[] = [];
const bundled: Activity[] = [
  {
    id: 'bundled-1',
    title: 'Bundled event',
    category: 'community',
    venue: 'Pioneer Park',
    area: 'Salt Lake City',
    lat: 40.76,
    lng: -111.89,
    whenLabel: 'Tonight',
    startsInMinutes: 60,
    description: 'Offline fallback',
    attendees: 0,
    rating: 'general',
    source: 'seed',
  },
];

function event(id = 'cloud-1'): CatalogEvent {
  return {
    id,
    sourceName: 'Ticketmaster',
    sourceEventId: id,
    sourceUrl: 'https://example.com/event',
    title: 'Cloud event',
    description: 'Live details',
    venueName: 'Gallivan Center',
    locality: 'Salt Lake City',
    region: 'UT',
    countryCode: 'US',
    latitude: 40.76,
    longitude: -111.89,
    category: 'music',
    rating: 'general',
    startsAt: '2026-09-03T01:00:00.000Z',
    endsAt: null,
    timezone: 'America/Denver',
    imageUrl: null,
    isCancelled: false,
    isRoadtrip: false,
    ingestedAt: '2026-09-02T23:00:00.000Z',
    updatedAt: '2026-09-02T23:00:00.000Z',
  };
}

function backend(items: CatalogEvent[] = [event()]): EventCatalogBackend {
  return {
    listEvents: jest.fn().mockResolvedValue({ items, nextCursor: null }),
    getEvent: jest.fn().mockResolvedValue(null),
    getCatalogFreshness: jest.fn().mockResolvedValue({
      sourceName: 'Ticketmaster',
      completedAt: '2026-09-02T23:05:00.000Z',
      recordCount: items.length,
      rejectedCount: 0,
    }),
  };
}

describe('useEventCatalog', () => {
  beforeEach(async () => {
    delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
  });

  it('replaces the bundled fallback with fresh cloud events and caches them', async () => {
    const remote = backend();
    const { result } = renderHook(() => useEventCatalog(remote, bundled));

    await waitFor(() => expect(result.current.source).toBe('cloud'));

    expect(result.current.activities.map((item) => item.id)).toEqual(['cloud-1']);
    expect(result.current.activities[0]?.sourceEventId).toBe('cloud-1');
    expect(result.current.updatedAt).toBe('2026-09-02T23:05:00.000Z');
    expect(remote.listEvents).toHaveBeenCalledWith({
      ratings: ['family', 'general'],
      limit: 200,
    });
    expect(await AsyncStorage.getItem(STORAGE_KEYS.catalog)).toContain('cloud-1');
  });

  it('keeps the built-in guide when the cloud catalog is empty and nothing is cached', async () => {
    const remote = backend([]);
    const { result } = renderHook(() => useEventCatalog(remote, bundled));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(remote.listEvents).toHaveBeenCalled();
    expect(result.current.source).toBe('bundled');
    expect(result.current.activities).toEqual(bundled);
    expect(result.current.updatedAt).toBeNull();
    expect(result.current.error).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      STORAGE_KEYS.catalog,
      expect.anything(),
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.catalog)).toBeNull();
  });

  it('keeps the cached catalog when the cloud catalog is empty', async () => {
    const cachedRaw = JSON.stringify({
      items: [event('cached-1')],
      updatedAt: '2026-09-02T22:00:00.000Z',
    });
    await AsyncStorage.setItem(STORAGE_KEYS.catalog, cachedRaw);
    jest.clearAllMocks();
    const remote = backend([]);

    const { result } = renderHook(() => useEventCatalog(remote, bundled));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(remote.listEvents).toHaveBeenCalled();
    expect(result.current.source).toBe('cache');
    expect(result.current.activities.map((item) => item.id)).toEqual(['cached-1']);
    expect(result.current.updatedAt).toBe('2026-09-02T22:00:00.000Z');
    expect(result.current.error).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      STORAGE_KEYS.catalog,
      expect.anything(),
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.catalog)).toBe(cachedRaw);
  });

  it('loads every catalog page and caches the combined result', async () => {
    const remote = backend();
    (remote.listEvents as jest.Mock)
      .mockResolvedValueOnce({ items: [event('cloud-1')], nextCursor: '200' })
      .mockResolvedValueOnce({ items: [event('cloud-2')], nextCursor: null });

    const { result } = renderHook(() => useEventCatalog(remote, bundled));

    await waitFor(() =>
      expect(result.current.activities.map((item) => item.id)).toEqual([
        'cloud-1',
        'cloud-2',
      ]),
    );
    expect(remote.listEvents).toHaveBeenNthCalledWith(2, {
      ratings: ['family', 'general'],
      limit: 200,
      cursor: '200',
    });
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.catalog);
    expect(cached).toContain('cloud-1');
    expect(cached).toContain('cloud-2');
  });

  it('uses event timestamps when optional freshness metadata fails', async () => {
    const remote = backend();
    (remote.getCatalogFreshness as jest.Mock).mockRejectedValue(
      new Error('metadata unavailable'),
    );

    const { result } = renderHook(() => useEventCatalog(remote, bundled));

    await waitFor(() => expect(result.current.source).toBe('cloud'));
    expect(result.current.activities.map((item) => item.id)).toEqual(['cloud-1']);
    expect(result.current.updatedAt).toBe('2026-09-02T23:00:00.000Z');
    expect(result.current.error).toBeNull();
  });

  it('requests mature catalog supply only behind the explicit flag', async () => {
    process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
    const remote = backend();

    const { result } = renderHook(() => useEventCatalog(remote, bundled));

    await waitFor(() => expect(result.current.source).toBe('cloud'));
    expect(remote.listEvents).toHaveBeenCalledWith({
      ratings: ['family', 'general', 'mature'],
      limit: 200,
    });
  });

  it('uses the last successful cloud response when refresh fails', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.catalog,
      JSON.stringify({
        items: [event('cached-1')],
        updatedAt: '2026-09-02T22:00:00.000Z',
      }),
    );
    const failing = backend();
    (failing.listEvents as jest.Mock).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useEventCatalog(failing, bundled));

    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    expect(result.current.source).toBe('cache');
    expect(result.current.activities.map((item) => item.id)).toEqual(['cached-1']);
  });

  it('reports a failed refresh after an in-session cloud load, on the cached source', async () => {
    const flaky = backend();
    (flaky.listEvents as jest.Mock)
      .mockResolvedValueOnce({ items: [event('cloud-1')], nextCursor: null })
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useEventCatalog(flaky, bundled));
    await waitFor(() => expect(result.current.source).toBe('cloud'));

    act(() => result.current.refresh());

    // The refresh re-reads the cache the cloud load wrote, so a failure is
    // never left sitting on source 'cloud': Discover's offline notes key on it.
    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    expect(result.current.source).toBe('cache');
    expect(result.current.activities.map((item) => item.id)).toEqual(['cloud-1']);
  });

  it('keeps the built-in guide when no cloud response has ever succeeded', async () => {
    const failing = backend();
    (failing.listEvents as jest.Mock).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useEventCatalog(failing, bundled));

    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    expect(result.current.source).toBe('bundled');
    expect(result.current.activities).toEqual(bundled);

    act(() => result.current.refresh());
    expect(failing.listEvents).toHaveBeenCalled();
  });

  it('clears a detached catalog error and keeps discovery available', async () => {
    const failing = backend();
    (failing.listEvents as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result, rerender } = renderHook(
      ({ remote }: { remote: EventCatalogBackend | null }) => useEventCatalog(remote, bundled),
      { initialProps: { remote: failing as EventCatalogBackend | null } },
    );
    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    rerender({ remote: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.activities).toEqual(bundled);
    expect(failing.listEvents).toHaveBeenCalledTimes(1);
  });

  it('ignores a detached catalog response rather than caching or displaying it', async () => {
    const remote = backend();
    let resolvePage!: (page: { items: CatalogEvent[]; nextCursor: null }) => void;
    (remote.listEvents as jest.Mock).mockReturnValue(new Promise((resolve) => {
      resolvePage = resolve;
    }));
    const { result, rerender } = renderHook(
      ({ service }: { service: EventCatalogBackend | null }) => useEventCatalog(service, bundled),
      { initialProps: { service: remote as EventCatalogBackend | null } },
    );
    await waitFor(() => expect(remote.listEvents).toHaveBeenCalled());
    rerender({ service: null });
    await act(async () => { resolvePage({ items: [event()], nextCursor: null }); });
    expect(result.current.activities).toEqual(bundled);
    expect(result.current.source).toBe('bundled');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.catalog)).toBeNull();
  });
});

test('named-region caches never substitute the other region during a failed fetch', async () => {
 await AsyncStorage.clear();
 await AsyncStorage.setItem(STORAGE_KEYS.catalog,JSON.stringify({items:[event('utah-old')],updatedAt:'2026-10-01T00:00:00Z'}));
 const backend:EventCatalogBackend={listEvents:jest.fn().mockRejectedValue(new Error('offline')),getEvent:jest.fn(),getCatalogFreshness:jest.fn().mockResolvedValue(null)};
 const {result}=renderHook(()=>useEventCatalog(backend,bundled,'vermont-corridor'));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.activities).toEqual([]);
 expect(backend.listEvents).toHaveBeenCalledWith(expect.objectContaining({serviceRegion:'vermont-corridor'}));
});

test('hosted events are never persisted into the offline public catalog',async()=>{
 await AsyncStorage.clear();const hosted={...event('hosted-test'),sourceName:'onto community',hosted:{meetingInstructions:'Public entrance',newcomersWelcome:true}};
 const backend:EventCatalogBackend={listEvents:jest.fn().mockResolvedValue({items:[hosted],nextCursor:null}),getEvent:jest.fn(),getCatalogFreshness:jest.fn().mockResolvedValue(null)};
 const {result}=renderHook(()=>useEventCatalog(backend,bundled));
 await waitFor(()=>expect(result.current.source).toBe('cloud'));
 await waitFor(async()=>expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.catalog))!).items).toEqual([]));
 expect(result.current.activities[0].hosted?.newcomersWelcome).toBe(true);
});

test('a Vermont catalog never borrows the global Utah refresh timestamp', async () => {
 await AsyncStorage.clear(); const vt = {...event('vt-event'), locality:'Middlebury',region:'VT',latitude:44.0153,longitude:-73.1673,timezone:'America/New_York'};
 const remote=backend([vt]); const {result}=renderHook(()=>useEventCatalog(remote,emptyBundle,'vermont-corridor'));
 await waitFor(()=>expect(result.current.source).toBe('cloud'));
 expect(result.current.updatedAt).toBe(vt.updatedAt); expect(remote.getCatalogFreshness).not.toHaveBeenCalled();
});

test('local cancellation invalidates an already-mounted community card', async () => {
 await AsyncStorage.clear(); const hosted = {...event('hosted-test'),sourceName:'onto community'}; const remote=backend([hosted]);
 const hook=renderHook(()=>useEventCatalog(remote,bundled)); await waitFor(()=>expect(hook.result.current.activities.some(item=>item.id===hosted.id)).toBe(true));
 (remote.listEvents as jest.Mock).mockResolvedValue({items:[],nextCursor:null});
 act(()=>invalidatePublicCatalog());
 expect(hook.result.current.activities.some(item=>item.id===hosted.id)).toBe(false);
 await waitFor(()=>expect(remote.listEvents).toHaveBeenCalledTimes(2));
});

 it('suspends reads and cards until an eligible origin is ready', async () => {
  const remote = backend();
  const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useEventCatalog(remote, bundled, 'utah', enabled), { initialProps: { enabled: false } });
  await act(async () => {});
  expect(remote.listEvents).not.toHaveBeenCalled();
  expect(result.current.activities).toEqual([]);
  expect(result.current.loading).toBe(false);
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.source).toBe('cloud'));
  rerender({ enabled: false });
  expect(result.current.activities).toEqual([]);
 });

it('retains only Utah events from a legacy global cache when browsing Utah', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify({ items: [event('saved-utah'), { ...event('wrong-region'), latitude: 44.48, longitude: -73.21 }], updatedAt: '2026-10-01T00:00:00Z' }));
  const remote = backend(); (remote.listEvents as jest.Mock).mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useEventCatalog(remote, emptyBundle, 'utah'));
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.activities.map(item => item.id)).toEqual(['saved-utah']);
});

it('stops obsolete pagination and does not cache its late page after a region switch', async () => {
  await AsyncStorage.clear();
  let finish!: (page: { items: CatalogEvent[]; nextCursor: string }) => void;
  const remote = backend();
  (remote.listEvents as jest.Mock).mockImplementation(query => query.serviceRegion === 'asheville'
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ items: [event('current-utah')], nextCursor: null }));
  const { result, rerender } = renderHook(({ region }: { region: 'utah' | 'asheville' }) => useEventCatalog(remote, emptyBundle, region), { initialProps: { region: 'asheville' as 'utah' | 'asheville' } });
  await waitFor(() => expect(finish).toBeDefined()); rerender({ region: 'utah' });
  await waitFor(() => expect(result.current.source).toBe('cloud'));
  await act(async () => { finish({ items: [{ ...event('late-nc'), latitude: 35.6, longitude: -82.55 }], nextCursor: '200' }); });
  expect(result.current.activities.map(item => item.id)).toEqual(['current-utah']);
  expect((remote.listEvents as jest.Mock).mock.calls.filter(([query]) => query.serviceRegion === 'asheville')).toHaveLength(1);
  expect(await AsyncStorage.getItem('onto.catalog.v1.asheville')).toBeNull();
});
