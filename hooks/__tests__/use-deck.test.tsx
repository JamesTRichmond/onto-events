import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { eraseAllOntoData } from '@/lib/storage';
import { useDeck } from '../use-deck';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const stored = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) ?? 'null');

describe('useDeck', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('restores both lists from their own keys', async () => {
    await AsyncStorage.setItem('onto.passed.v1', '["p1"]');
    await AsyncStorage.setItem('onto.maybes.v1', '["m1"]');

    const { result } = renderHook(() => useDeck());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.lists).toEqual({ passed: ['p1'], maybes: ['m1'], fromMaybes: [] });
  });

  it('persists swipes through the storage choke point, ids only', async () => {
    const { result } = renderHook(() => useDeck());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.pass('a'));
    act(() => result.current.keepMaybe('b'));

    await waitFor(async () => expect(await stored('onto.passed.v1')).toEqual(['a']));
    expect(await stored('onto.maybes.v1')).toEqual(['b']);

    act(() => result.current.restore(['a']));
    act(() => result.current.dropMaybe('b'));
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.passed.v1')).toBeNull());
    expect(await AsyncStorage.getItem('onto.maybes.v1')).toBeNull();
  });

  it('a plain load never writes back over storage', async () => {
    await AsyncStorage.setItem('onto.maybes.v1', '["m1"]');
    (AsyncStorage.setItem as jest.Mock).mockClear();
    const { result } = renderHook(() => useDeck());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith('onto.maybes.v1', expect.anything());
  });

  it('a swipe that lands before the load is replayed on top of stored lists', async () => {
    await AsyncStorage.setItem('onto.maybes.v1', '["m1"]');
    const { result } = renderHook(() => useDeck());

    act(() => result.current.keepMaybe('early'));

    await waitFor(() => expect(result.current.lists.maybes).toEqual(['m1', 'early']));
    await waitFor(async () => expect(await stored('onto.maybes.v1')).toEqual(['m1', 'early']));
  });

  it('erase-my-data empties both lists in memory and on disk', async () => {
    const { result } = renderHook(() => useDeck());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.keepMaybe('b'));
    await waitFor(async () => expect(await stored('onto.maybes.v1')).toEqual(['b']));

    await act(async () => {
      await eraseAllOntoData();
    });

    expect(result.current.lists).toEqual({ passed: [], maybes: [], fromMaybes: [] });
    expect(await AsyncStorage.getItem('onto.maybes.v1')).toBeNull();
  });
});
