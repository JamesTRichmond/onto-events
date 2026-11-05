jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { AuthBackend, AuthState } from '@/lib/backend/contracts';
import { BackendError } from '@/lib/backend/contracts';

import { useAuth } from '../use-auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { joinedForUser, joinedPendingForUser, STORAGE_KEYS } from '@/lib/storage';

function signedIn(id: string): AuthState {
  return { kind: 'signed-in', user: { id, email: null, createdAt: '' }, session: { userId: id, accessToken: `token-${id}`, expiresAt: null } };
}

function fakeBackend(
  initial: AuthState = { kind: 'signed-out' },
): AuthBackend & { emit(state: AuthState): void; unsubscribe: jest.Mock } {
  let listener: ((state: AuthState) => void) | null = null;
  const unsubscribe = jest.fn();

  return {
    getState: jest.fn().mockResolvedValue(initial),
    signInWithEmail: jest.fn().mockResolvedValue(undefined),
    verifyEmailOtp: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    onStateChange: jest.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
    emit(next) {
      listener?.(next);
    },
    unsubscribe,
  };
}

describe('useAuth', () => {
  it('keeps discovery available in explicit offline mode', async () => {
    const { result } = renderHook(() => useAuth(null));

    await waitFor(() => expect(result.current.state.kind).toBe('signed-out'));
    expect(result.current.available).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads state, follows auth changes, and unsubscribes', async () => {
    const backend = fakeBackend();
    const { result, unmount } = renderHook(() => useAuth(backend));

    await waitFor(() => expect(result.current.state.kind).toBe('signed-out'));

    act(() =>
      backend.emit({
        kind: 'signed-in',
        user: {
          id: 'user-1',
          email: 'james@example.com',
          createdAt: '2026-09-02T20:00:00.000Z',
        },
        session: {
          userId: 'user-1',
          accessToken: 'token',
          expiresAt: null,
        },
      }),
    );
    expect(result.current.state.kind).toBe('signed-in');

    unmount();
    expect(backend.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('runs the passwordless email flow', async () => {
    const backend = fakeBackend();
    const { result } = renderHook(() => useAuth(backend));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-out'));

    let requested = false;
    await act(async () => {
      requested = await result.current.requestCode('james@example.com');
    });
    expect(requested).toBe(true);
    expect(backend.signInWithEmail).toHaveBeenCalledWith('james@example.com');

    let verified = false;
    await act(async () => {
      verified = await result.current.verifyCode('james@example.com', '123456');
    });
    expect(verified).toBe(true);
    expect(backend.verifyEmailOtp).toHaveBeenCalledWith(
      'james@example.com',
      '123456',
    );
  });

  it('permanently deletes the signed-in account through the backend', async () => {
    const backend = fakeBackend(signedIn('user-1'));
    const { result } = renderHook(() => useAuth(backend));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-in'));

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteAccount('user-1');
    });

    expect(deleted).toBe(true);
    expect(backend.deleteAccount).toHaveBeenCalledWith('user-1');
    expect(result.current.state.kind).toBe('signed-out');
  });

  it('returns a stable error instead of throwing through the UI', async () => {
    const backend = fakeBackend();
    (backend.signInWithEmail as jest.Mock).mockRejectedValue(
      new BackendError('rate-limited', 'Try again later'),
    );
    const { result } = renderHook(() => useAuth(backend));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-out'));

    let requested = true;
    await act(async () => {
      requested = await result.current.requestCode('james@example.com');
    });

    expect(requested).toBe(false);
    expect(result.current.error).toMatchObject({
      code: 'rate-limited',
      message: 'Try again later',
    });
    expect(result.current.pendingAction).toBeNull();
  });

  it('ignores late state and action results after swapping the account module', async () => {
    const oldBackend = fakeBackend();
    let resolveState!: (state: AuthState) => void;
    let rejectAction!: (error: Error) => void;
    (oldBackend.getState as jest.Mock).mockReturnValue(new Promise<AuthState>((resolve) => {
      resolveState = resolve;
    }));
    (oldBackend.signInWithEmail as jest.Mock).mockReturnValue(new Promise<void>((_, reject) => {
      rejectAction = reject;
    }));
    const { result, rerender } = renderHook(
      ({ backend }: { backend: AuthBackend | null }) => useAuth(backend),
      { initialProps: { backend: oldBackend as AuthBackend | null } },
    );
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.requestCode('person@example.com'); });
    const nextBackend = fakeBackend();
    rerender({ backend: nextBackend });
    await waitFor(() => expect(result.current.state.kind).toBe('signed-out'));
    await act(async () => {
      resolveState({
        kind: 'signed-in',
        user: { id: 'old-user', email: null, createdAt: '2026-09-01T00:00:00Z' },
        session: { userId: 'old-user', accessToken: 'test-token', expiresAt: null },
      });
      rejectAction(new Error('late failure'));
      expect(await pending).toBe(false);
    });
    expect(result.current.state.kind).toBe('signed-out');
    expect(result.current.error).toBeNull();
    expect(result.current.pendingAction).toBeNull();
    expect(oldBackend.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cleans refresh listeners even if auth unsubscribe throws', async () => {
    const backend = fakeBackend();
    backend.unsubscribe.mockImplementation(() => { throw new Error('cleanup failed'); });
    const stop = jest.fn();
    const start = jest.fn(() => stop);
    const { result, unmount } = renderHook(() => useAuth(backend, start));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-out'));
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('refuses a deletion confirmation belonging to the previous account', async () => {
    const backend = fakeBackend(signedIn('user-1'));
    const { result } = renderHook(() => useAuth(backend));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-in'));
    const confirmedDelete = result.current.deleteAccount;
    act(() => backend.emit(signedIn('user-2')));
    await act(async () => { expect(await confirmedDelete('user-1')).toBe(false); });
    expect(backend.deleteAccount).not.toHaveBeenCalled();
    expect(result.current.state).toEqual(signedIn('user-2'));
  });

  it('erases only the deleted account cache and preserves a switched account after late completion', async () => {
    const backend = fakeBackend(signedIn('user-1'));
    let finish!: () => void;
    (backend.deleteAccount as jest.Mock).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    await AsyncStorage.multiSet([
      [joinedForUser('user-1'), 'old plans'], [joinedPendingForUser('user-1'), 'old queue'],
      [joinedForUser('user-2'), 'new plans'], [STORAGE_KEYS.joined, 'guest plans'], [STORAGE_KEYS.feedRadius, 'saved radius'],
    ]);
    const { result } = renderHook(() => useAuth(backend));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-in'));
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.deleteAccount('user-1'); });
    act(() => backend.emit(signedIn('user-2')));
    await act(async () => { finish(); expect(await operation).toBe(false); });
    expect(result.current.state).toEqual(signedIn('user-2'));
    expect(await AsyncStorage.getItem(joinedForUser('user-1'))).toBeNull();
    expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBeNull();
    expect(await AsyncStorage.getItem(joinedForUser('user-2'))).toBe('new plans');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.joined)).toBe('guest plans');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.feedRadius)).toBe('saved radius');
  });

  it('does not attach a previous account deletion failure to the newly selected account', async () => {
    const backend = fakeBackend(signedIn('user-1'));
    let fail!: (reason: Error) => void;
    (backend.deleteAccount as jest.Mock).mockReturnValue(new Promise<void>((_, reject) => { fail = reject; }));
    const { result } = renderHook(() => useAuth(backend));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-in'));
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.deleteAccount('user-1'); });
    act(() => backend.emit(signedIn('user-2')));
    await act(async () => { fail(new Error('old deletion failed')); expect(await operation).toBe(false); });
    expect(result.current.state).toEqual(signedIn('user-2'));
    expect(result.current.error).toBeNull();
  });

  it('does not replace a new pending Apple identity with signed-out after old deletion completes', async () => {
    const backend = fakeBackend(signedIn('user-1'));
    let finish!: () => void;
    (backend.deleteAccount as jest.Mock).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useAuth(backend));
    await waitFor(() => expect(result.current.state.kind).toBe('signed-in'));
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.deleteAccount('user-1'); });
    act(() => backend.emit({ kind: 'loading' }));
    await act(async () => { finish(); expect(await operation).toBe(false); });
    expect(result.current.state).toEqual({ kind: 'loading' });
  });

  it('ignores a retained callback from a detached module when confirming the new account', async () => {
    const oldBackend = fakeBackend(signedIn('user-1'));
    const nextBackend = fakeBackend(signedIn('user-2'));
    const { result, rerender } = renderHook(({ backend }: { backend: AuthBackend }) => useAuth(backend), { initialProps: { backend: oldBackend } });
    await waitFor(() => expect(result.current.state).toEqual(signedIn('user-1')));
    rerender({ backend: nextBackend });
    await waitFor(() => expect(result.current.state).toEqual(signedIn('user-2')));
    // Model an already queued transport callback that survives unsubscribe.
    act(() => oldBackend.emit(signedIn('user-1')));
    await act(async () => { expect(await result.current.deleteAccount('user-2')).toBe(true); });
    expect(nextBackend.deleteAccount).toHaveBeenCalledWith('user-2');
    expect(oldBackend.deleteAccount).not.toHaveBeenCalled();
  });

  it('finishes confirmed-owner erasure after the account module is replaced', async () => {
    const oldBackend = fakeBackend(signedIn('detached-owner'));
    const nextBackend = fakeBackend(signedIn('replacement-owner'));
    let finish!: () => void;
    (oldBackend.deleteAccount as jest.Mock).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    await AsyncStorage.multiSet([
      [joinedForUser('detached-owner'), 'old plans'],
      [joinedForUser('replacement-owner'), 'new plans'],
    ]);
    const { result, rerender } = renderHook(({ backend }: { backend: AuthBackend }) => useAuth(backend),
      { initialProps: { backend: oldBackend } });
    await waitFor(() => expect(result.current.state).toEqual(signedIn('detached-owner')));
    let operation!: Promise<boolean>;
    act(() => { operation = result.current.deleteAccount('detached-owner'); });
    rerender({ backend: nextBackend });
    await waitFor(() => expect(result.current.state).toEqual(signedIn('replacement-owner')));
    await act(async () => { finish(); expect(await operation).toBe(false); });
    expect(await AsyncStorage.getItem(joinedForUser('detached-owner'))).toBeNull();
    expect(await AsyncStorage.getItem(joinedForUser('replacement-owner'))).toBe('new plans');
    expect(result.current.state).toEqual(signedIn('replacement-owner'));
  });
});
