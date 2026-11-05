import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useInterests } from '../use-interests';
import { eraseAllOntoData } from '@/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const KEY = 'onto.interests.v1';

describe('useInterests', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('loads valid stored interests', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(['music', 'outdoors']));

    const { result } = renderHook(() => useInterests());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect([...result.current.interests].sort()).toEqual(['music', 'outdoors']);
  });

  it('drops unknown members and rejects non-array JSON', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(['music', 'EVIL', 42, null]));
    const first = renderHook(() => useInterests());
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    expect([...first.result.current.interests]).toEqual(['music']);
    first.unmount();

    await AsyncStorage.setItem(KEY, JSON.stringify({ music: true }));
    const second = renderHook(() => useInterests());
    await waitFor(() => expect(second.result.current.loaded).toBe(true));
    expect(second.result.current.interests.size).toBe(0);
  });

  it('survives corrupted (unparseable) storage', async () => {
    await AsyncStorage.setItem(KEY, '{not json');

    const { result } = renderHook(() => useInterests());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.interests.size).toBe(0);
  });


  it('merges a toggle made before the load settles instead of clobbering storage', async () => {
    let releaseLoad!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      releaseLoad = resolve;
    });
    const realGetItem = AsyncStorage.getItem;
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => gate);

    const { result } = renderHook(() => useInterests());

    act(() => {
      result.current.toggle('fitness');
    });
    expect(result.current.interests.has('fitness')).toBe(true);
    // Pre-load toggles must not write: storage still holds the truth.
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await act(async () => {
      releaseLoad(JSON.stringify(['music']));
      await gate;
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect([...result.current.interests].sort()).toEqual(['fitness', 'music']);
    await waitFor(async () => {
      const persisted = JSON.parse((await realGetItem(KEY)) ?? '[]');
      expect(persisted.sort()).toEqual(['fitness', 'music']);
    });
  });

  it('persists a pre-load toggle when storage is empty', async () => {
    const { result } = renderHook(() => useInterests());

    act(() => {
      result.current.toggle('music');
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(KEY)).toBe(JSON.stringify(['music']));
    });
  });

  it('persists toggles after load', async () => {
    const { result } = renderHook(() => useInterests());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.toggle('games');
    });

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(KEY)).toBe(JSON.stringify(['games']));
    });
  });

  it('clears mounted interests without writing them back after local erasure', async () => {
    const { result } = renderHook(() => useInterests());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.toggle('music'));
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe('["music"]'));

    await act(async () => { await eraseAllOntoData(); });
    expect(result.current.interests.size).toBe(0);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('does not restore an in-flight saved selection after erasure', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => pending);
    const { result } = renderHook(() => useInterests());
    await act(async () => { await eraseAllOntoData(); });
    await act(async () => { release('["music"]'); });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.interests.size).toBe(0);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
