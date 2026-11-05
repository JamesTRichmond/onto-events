import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import {
  BackendError,
  type EventRsvp,
  type RsvpBackend,
} from '@/lib/backend/contracts';
import { joinedForUser, joinedPendingForUser, STORAGE_KEYS } from '@/lib/storage';

import { useJoined } from '../use-joined';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function rsvp(eventId: string, userId = 'user-1'): EventRsvp {
  return {
    userId,
    eventId,
    status: 'going',
    shareWithConnections: false,
    createdAt: '2026-09-02T20:00:00.000Z',
    updatedAt: '2026-09-02T20:00:00.000Z',
  };
}

function rsvpBackend(remote: EventRsvp[] = []): RsvpBackend {
  return {
    listMyRsvps: jest.fn().mockResolvedValue(remote),
    listMyRsvpHistory: jest.fn().mockResolvedValue([]),
    setRsvp: jest.fn(({ eventId }) => Promise.resolve(rsvp(eventId))),
    removeRsvp: jest.fn().mockResolvedValue(undefined),
  };
}

describe('useJoined', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('restores guest plans without an account', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.joined,
      JSON.stringify(['gallivan-concert', 'tm-abc']),
    );

    const { result } = renderHook(() => useJoined());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.joinedIds.has('gallivan-concert')).toBe(true);
    expect(result.current.joinedIds.size).toBe(2);
  });

  it('never treats an Interested RSVP as Going, including refresh from another device', async () => {
    const backend = rsvpBackend([rsvp('going'), { ...rsvp('interested'), status: 'interested' }]);
    let foreground!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      foreground = listener; return { remove: jest.fn() };
    });
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect([...result.current.joinedIds]).toEqual(['going']);
    (backend.listMyRsvps as jest.Mock).mockResolvedValue([{ ...rsvp('going'), status:'interested' }]);
    await act(async()=>foreground('active'));
    await waitFor(()=>expect(result.current.joinedIds.size).toBe(0));
  });

  it('persists a guest join that lands before storage finishes loading', async () => {
    const { result } = renderHook(() => useJoined());
    act(() => result.current.toggleJoin('gallivan-concert'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.joined)) ?? '[]')).toEqual([
        'gallivan-concert',
      ]),
    );
  });

  it('claims guest plans into the signed-in account and clears the guest bucket', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.joined, JSON.stringify(['guest-event']));
    const backend = rsvpBackend([rsvp('cloud-event')]);

    const { result } = renderHook(() => useJoined(backend, 'user-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect([...result.current.joinedIds].sort()).toEqual(['cloud-event', 'guest-event']);
    expect(backend.setRsvp).toHaveBeenCalledWith({
      eventId: 'guest-event',
      status: 'going',
    });
    expect(await AsyncStorage.getItem(STORAGE_KEYS.joined)).toBeNull();
    expect(
      JSON.parse((await AsyncStorage.getItem(joinedForUser('user-1'))) ?? '[]').sort(),
    ).toEqual(['cloud-event', 'guest-event']);
  });

  it('keeps account caches isolated when users switch on one device', async () => {
    await AsyncStorage.setItem(joinedForUser('user-a'), JSON.stringify(['a-event']));
    await AsyncStorage.setItem(joinedForUser('user-b'), JSON.stringify(['b-event']));
    const backendA = rsvpBackend([rsvp('a-event', 'user-a')]);
    const backendB = rsvpBackend([rsvp('b-event', 'user-b')]);

    const { result, rerender } = renderHook(
      (props: { backend: RsvpBackend; userId: string }) =>
        useJoined(props.backend, props.userId),
      { initialProps: { backend: backendA, userId: 'user-a' } },
    );
    await waitFor(() => expect(result.current.joinedIds.has('a-event')).toBe(true));

    rerender({ backend: backendB, userId: 'user-b' });
    await waitFor(() => expect(result.current.joinedIds.has('b-event')).toBe(true));
    expect(result.current.joinedIds.has('a-event')).toBe(false);
  });

  it('does not let an in-flight flush from one account process the next account queue', async () => {
    let resolveUserAWrite!: (value: EventRsvp) => void;
    let resolveUserBWrite!: (value: EventRsvp) => void;
    const userAWrite = new Promise<EventRsvp>((resolve) => {
      resolveUserAWrite = resolve;
    });
    const userBWrite = new Promise<EventRsvp>((resolve) => {
      resolveUserBWrite = resolve;
    });
    const backendA = rsvpBackend();
    const backendB = rsvpBackend([rsvp('b-cloud', 'user-b')]);
    (backendA.setRsvp as jest.Mock).mockImplementation(
      ({ eventId }: { eventId: string }) =>
        eventId === 'a-local'
          ? userAWrite
          : Promise.resolve(rsvp(eventId, 'user-a')),
    );
    (backendB.setRsvp as jest.Mock).mockReturnValue(userBWrite);

    const { result, rerender } = renderHook(
      (props: { backend: RsvpBackend; userId: string }) =>
        useJoined(props.backend, props.userId),
      { initialProps: { backend: backendA, userId: 'user-a' } },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.toggleJoin('a-local'));
    await waitFor(() => expect(backendA.setRsvp).toHaveBeenCalledTimes(1));

    rerender({ backend: backendB, userId: 'user-b' });
    await waitFor(() => expect(result.current.joinedIds.has('b-cloud')).toBe(true));
    act(() => result.current.toggleJoin('b-local'));
    await waitFor(() => expect(backendB.setRsvp).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveUserAWrite(rsvp('a-local', 'user-a'));
      await userAWrite;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(backendA.setRsvp).toHaveBeenCalledTimes(1);
    expect(backendA.setRsvp).not.toHaveBeenCalledWith({
      eventId: 'b-local',
      status: 'going',
    });

    await act(async () => {
      resolveUserBWrite(rsvp('b-local', 'user-b'));
      await userBWrite;
    });
  });

  it('writes optimistic account plans to the cloud and scoped cache', async () => {
    const backend = rsvpBackend();
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.toggleJoin('event-1'));

    expect(result.current.joinedIds.has('event-1')).toBe(true);
    await waitFor(() =>
      expect(backend.setRsvp).toHaveBeenCalledWith({
        eventId: 'event-1',
        status: 'going',
      }),
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(joinedForUser('user-1'))).toBe(
        JSON.stringify(['event-1']),
      ),
    );
  });

  it('keeps the local plan when cloud sync fails', async () => {
    const backend = rsvpBackend();
    (backend.setRsvp as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.toggleJoin('event-1'));

    await waitFor(() => expect(result.current.syncError?.message).toBe('offline'));
    expect(result.current.joinedIds.has('event-1')).toBe(true);
    expect(await AsyncStorage.getItem(joinedForUser('user-1'))).toBe(
      JSON.stringify(['event-1']),
    );
    expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBe(
      JSON.stringify({ 'event-1': true }),
    );
  });

  it('preserves additions and cancellations while the RSVP module is detached', async () => {
    const backend = rsvpBackend([rsvp('cancel-me')]);
    const { result, rerender } = renderHook(
      (props: { remote: RsvpBackend | null }) => useJoined(props.remote, 'user-1'),
      { initialProps: { remote: backend as RsvpBackend | null } },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    rerender({ remote: null });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      result.current.toggleJoin('add-me');
      result.current.toggleJoin('cancel-me');
    });
    await waitFor(async () => {
      expect(JSON.parse((await AsyncStorage.getItem(joinedPendingForUser('user-1'))) ?? '{}'))
        .toEqual({ 'add-me': true, 'cancel-me': false });
    });
    expect(backend.setRsvp).not.toHaveBeenCalled();
    expect(backend.removeRsvp).not.toHaveBeenCalled();

    rerender({ remote: backend });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect([...result.current.joinedIds]).toEqual(['add-me']);
    expect(backend.setRsvp).toHaveBeenCalledWith({ eventId: 'add-me', status: 'going' });
    expect(backend.removeRsvp).toHaveBeenCalledWith('cancel-me');
  });

  it('restores pending account intent without RSVP capability or claiming guest plans', async () => {
    await AsyncStorage.setItem(joinedForUser('user-1'), JSON.stringify(['cancel-me']));
    await AsyncStorage.setItem(joinedPendingForUser('user-1'), JSON.stringify({
      'add-me': true, 'cancel-me': false,
    }));
    await AsyncStorage.setItem(STORAGE_KEYS.joined, JSON.stringify(['guest-plan']));
    const { result } = renderHook(() => useJoined(null, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect([...result.current.joinedIds]).toEqual(['add-me']);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.joined)).toBe(JSON.stringify(['guest-plan']));
    expect(JSON.parse((await AsyncStorage.getItem(joinedPendingForUser('user-1'))) ?? '{}'))
      .toEqual({ 'add-me': true, 'cancel-me': false });
  });

  it('drops a permanently rejected RSVP so later plans still sync', async () => {
    jest.useFakeTimers();
    await AsyncStorage.setItem(
      joinedPendingForUser('user-1'),
      JSON.stringify({ 'bundled-card': true, 'cloud-event': true }),
    );
    const backend = rsvpBackend([]);
    (backend.setRsvp as jest.Mock).mockImplementation(({ eventId }: { eventId: string }) =>
      eventId === 'bundled-card'
        ? Promise.reject(new BackendError('invalid-input', 'unknown event'))
        : Promise.resolve(rsvp(eventId)),
    );

    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() =>
      expect(backend.setRsvp).toHaveBeenCalledWith({
        eventId: 'cloud-event',
        status: 'going',
      }),
    );
    await waitFor(() => expect(result.current.syncing).toBe(false));

    expect(backend.setRsvp).toHaveBeenCalledTimes(2);
    expect(result.current.syncError).toBeInstanceOf(BackendError);
    expect(result.current.syncError?.message).toBe('unknown event');
    expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBeNull();
    expect(result.current.joinedIds.has('bundled-card')).toBe(false);
    expect(result.current.joinedIds.has('cloud-event')).toBe(true);
    await waitFor(async () =>
      expect(
        JSON.parse((await AsyncStorage.getItem(joinedForUser('user-1'))) ?? '[]'),
      ).not.toContain('bundled-card'),
    );

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(backend.setRsvp).toHaveBeenCalledTimes(2);
  });

  it('keeps a transiently rejected RSVP queued and schedules a retry', async () => {
    jest.useFakeTimers();
    const backend = rsvpBackend();
    (backend.setRsvp as jest.Mock).mockRejectedValue(
      new BackendError('network', 'offline'),
    );
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.toggleJoin('event-1'));

    await waitFor(() => expect(result.current.syncError?.message).toBe('offline'));
    expect(backend.setRsvp).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBe(
      JSON.stringify({ 'event-1': true }),
    );

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    await waitFor(() => expect(backend.setRsvp).toHaveBeenCalledTimes(2));
    expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBe(
      JSON.stringify({ 'event-1': true }),
    );
  });

  it('accepts a remote deletion instead of reviving it from cache', async () => {
    await AsyncStorage.setItem(joinedForUser('user-1'), JSON.stringify(['deleted-elsewhere']));
    const backend = rsvpBackend([]);

    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.joinedIds.has('deleted-elsewhere')).toBe(false);
    expect(await AsyncStorage.getItem(joinedForUser('user-1'))).toBeNull();
  });

  it('retries a saved offline change on the next launch', async () => {
    await AsyncStorage.setItem(
      joinedPendingForUser('user-1'),
      JSON.stringify({ 'offline-event': true }),
    );
    const backend = rsvpBackend([]);

    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() =>
      expect(backend.setRsvp).toHaveBeenCalledWith({
        eventId: 'offline-event',
        status: 'going',
      }),
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBeNull(),
    );
  });

  it('refreshes remote changes when the app returns to the foreground', async () => {
    let onAppStateChange: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onAppStateChange = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    const remote = [rsvp('removed-on-another-device')];
    const backend = rsvpBackend(remote);
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.joinedIds.has('removed-on-another-device')).toBe(true));

    remote.splice(0);
    act(() => onAppStateChange?.('active'));

    await waitFor(() =>
      expect(result.current.joinedIds.has('removed-on-another-device')).toBe(false),
    );
  });

  it('clears a previous sync error after a successful remote refresh', async () => {
    let onAppStateChange: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onAppStateChange = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    const backend = rsvpBackend();
    (backend.listMyRsvps as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([rsvp('restored')]);
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.syncError?.message).toBe('offline'));

    act(() => onAppStateChange?.('active'));

    await waitFor(() => expect(result.current.joinedIds.has('restored')).toBe(true));
    expect(result.current.syncError).toBeNull();
  });

  it('keeps a local RSVP ahead of an older foreground response after its write completes', async () => {
    let onAppStateChange: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onAppStateChange = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    let resolveStaleRefresh!: (value: EventRsvp[]) => void;
    const staleRefresh = new Promise<EventRsvp[]>((resolve) => {
      resolveStaleRefresh = resolve;
    });
    const backend = rsvpBackend();
    (backend.listMyRsvps as jest.Mock)
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(staleRefresh);
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => onAppStateChange?.('active'));
    await waitFor(() => expect(backend.listMyRsvps).toHaveBeenCalledTimes(2));
    act(() => result.current.toggleJoin('new-plan'));
    await waitFor(() => expect(backend.setRsvp).toHaveBeenCalled());
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBeNull(),
    );

    await act(async () => {
      resolveStaleRefresh([]);
      await staleRefresh;
    });

    expect(result.current.joinedIds.has('new-plan')).toBe(true);
    expect(await AsyncStorage.getItem(joinedForUser('user-1'))).toBe(
      JSON.stringify(['new-plan']),
    );
  });

  it('removes a cloud RSVP without delaying the local state change', async () => {
    const backend = rsvpBackend();
    const { result } = renderHook(() => useJoined(backend, 'user-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.toggleJoin('event-1'));
    await waitFor(() => expect(backend.setRsvp).toHaveBeenCalled());
    act(() => result.current.toggleJoin('event-1'));

    expect(result.current.joinedIds.has('event-1')).toBe(false);
    await waitFor(() => expect(backend.removeRsvp).toHaveBeenCalledWith('event-1'));
  });
});
