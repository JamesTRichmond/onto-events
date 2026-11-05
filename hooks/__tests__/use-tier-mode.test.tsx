import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { STORAGE_KEYS } from '@/lib/storage';

import { TierModeProvider, useTierMode } from '../use-tier-mode';

function wrapper({ children }: PropsWithChildren) {
  return <TierModeProvider>{children}</TierModeProvider>;
}

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('useTierMode', () => {
  beforeEach(async () => {
    delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('defaults to everyone with mature content disabled', async () => {
    const { result } = renderHook(() => useTierMode(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.mode).toBe('everyone');
    expect(result.current.matureEnabled).toBe(false);
  });

  it('persists a family choice made before storage settles', async () => {
    const { result } = renderHook(() => useTierMode(), { wrapper });
    act(() => result.current.requestMode('family'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('family'),
    );
  });

  it('keeps a family choice visible when an older stored mode resolves later', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.mode, 'everyone');
    let resolveStoredMode!: (value: string | null) => void;
    let resolveStoredAck!: (value: string | null) => void;
    const storedMode = new Promise<string | null>((resolve) => {
      resolveStoredMode = resolve;
    });
    const storedAck = new Promise<string | null>((resolve) => {
      resolveStoredAck = resolve;
    });
    const getItem = AsyncStorage.getItem as jest.MockedFunction<
      typeof AsyncStorage.getItem
    >;
    const originalGetItem = getItem.getMockImplementation();
    getItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.mode) return storedMode;
        if (key === STORAGE_KEYS.adultConfirmed) return storedAck;
        return Promise.resolve(null);
      });
    const { result } = renderHook(() => useTierMode(), { wrapper });

    act(() => result.current.requestMode('family'));
    await act(async () => {
      resolveStoredMode('everyone');
      resolveStoredAck(null);
      await Promise.all([storedMode, storedAck]);
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.mode).toBe('family');
    if (originalGetItem) getItem.mockImplementation(originalGetItem);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('family'),
    );
  });

  it('resets a stored mature mode and removes the old adult acknowledgement', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.mode, 'mature');
    await AsyncStorage.setItem(STORAGE_KEYS.adultConfirmed, 'true');

    const { result } = renderHook(() => useTierMode(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.mode).toBe('everyone');
    expect(result.current.pendingAdultConfirm).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('everyone');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.adultConfirmed)).toBeNull();
  });

  it('does not restore over an explicit default-mode choice made before loading', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.mode, 'family');
    const { result } = renderHook(() => useTierMode(), { wrapper });

    act(() => result.current.requestMode('everyone'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.mode).toBe('everyone');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('everyone'),
    );
  });

  it('collapses a 21+ request made before loading to everyone when mature is disabled', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.mode, 'family');
    const { result } = renderHook(() => useTierMode(), { wrapper });

    act(() => result.current.requestMode('mature'));
    expect(result.current.mode).toBe('everyone');
    expect(result.current.pendingAdultConfirm).toBe(false);

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.mode).toBe('everyone');
    expect(result.current.pendingAdultConfirm).toBe(false);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('everyone'),
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.adultConfirmed)).toBeNull();
  });

  it('fails closed when code requests mature mode in v1', async () => {
    const { result } = renderHook(() => useTierMode(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.requestMode('mature'));

    expect(result.current.mode).toBe('everyone');
    expect(result.current.pendingAdultConfirm).toBe(false);
  });

  it('replays a 21+ request made before restoring a stored ack and persists it', async () => {
    process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
    await AsyncStorage.setItem(STORAGE_KEYS.adultConfirmed, 'true');
    const { result } = renderHook(() => useTierMode(), { wrapper });

    act(() => result.current.requestMode('mature'));

    expect(result.current.pendingAdultConfirm).toBe(false);
    expect(result.current.mode).toBe('everyone');
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.mode).toBe('mature');
    expect(result.current.adultConfirmed).toBe(true);
    expect(result.current.pendingAdultConfirm).toBe(false);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('mature'),
    );
  });

  it('asks for the acknowledgement after loading when a 21+ request precedes it without one', async () => {
    process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
    await AsyncStorage.setItem(STORAGE_KEYS.mode, 'family');
    const { result } = renderHook(() => useTierMode(), { wrapper });

    act(() => result.current.requestMode('mature'));

    expect(result.current.pendingAdultConfirm).toBe(false);
    expect(result.current.mode).toBe('everyone');
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.mode).toBe('family');
    expect(result.current.adultConfirmed).toBe(false);
    expect(result.current.pendingAdultConfirm).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('family');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.adultConfirmed)).toBeNull();

    act(() => result.current.confirmAdult());
    expect(result.current.mode).toBe('mature');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('mature'),
    );
  });

  it('keeps an acknowledgement given before the load and persists the 21+ choice', async () => {
    process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
    await AsyncStorage.setItem(STORAGE_KEYS.mode, 'family');
    const { result } = renderHook(() => useTierMode(), { wrapper });

    act(() => result.current.confirmAdult());
    expect(result.current.mode).toBe('mature');

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.mode).toBe('mature');
    expect(result.current.adultConfirmed).toBe(true);
    expect(result.current.pendingAdultConfirm).toBe(false);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBe('mature'),
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.adultConfirmed)).toBe('true');
  });

  it('retains the gated mature implementation only when explicitly enabled', async () => {
    process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
    const { result } = renderHook(() => useTierMode(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.requestMode('mature'));
    expect(result.current.pendingAdultConfirm).toBe(true);
    expect(result.current.mode).toBe('everyone');

    act(() => result.current.confirmAdult());
    expect(result.current.mode).toBe('mature');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.adultConfirmed)).toBe('true'),
    );
  });

  it('shares mode changes with other tab consumers', async () => {
    const { result } = renderHook(
      () => {
        const account = useTierMode();
        const discover = useTierMode();
        return { account, discover };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.account.loaded).toBe(true));

    act(() => result.current.account.requestMode('family'));

    expect(result.current.discover.mode).toBe('family');
  });
});
