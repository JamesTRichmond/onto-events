import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDiscoveryPreferences } from '../use-discovery-preferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); });

it('preserves valid saved radius and sorting without writing on load', async () => {
  await AsyncStorage.setItem('onto.feedRadius.v1', '7.5');
  await AsyncStorage.setItem('onto.feedSort.v1', 'nearest');
  jest.clearAllMocks();
  const { result } = renderHook(() => useDiscoveryPreferences());
  await waitFor(() => expect(result.current).toMatchObject({ radiusMi: 7.5, sort: 'nearest', loaded: true }));
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('defaults to soonest, and reads a saved sort no longer offered as soonest', async () => {
  const fresh = renderHook(() => useDiscoveryPreferences());
  expect(fresh.result.current.sort).toBe('soonest');
  await waitFor(() => expect(fresh.result.current).toMatchObject({ sort: 'soonest', loaded: true }));
  fresh.unmount();
  for (const saved of ['foryou', 'type']) {
    await AsyncStorage.setItem('onto.feedSort.v1', saved);
    const { result, unmount } = renderHook(() => useDiscoveryPreferences());
    await waitFor(() => expect(result.current).toMatchObject({ sort: 'soonest', loaded: true }));
    unmount();
  }
});

it('a fast radius choice wins over a late saved preference', async () => {
  let resolve!: (value: string) => void;
  const held = new Promise<string>((done) => { resolve = done; });
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => held);
  const { result } = renderHook(() => useDiscoveryPreferences());
  act(() => result.current.chooseRadius(2));
  await act(async () => { resolve('100'); await held; });
  expect(result.current.radiusMi).toBe(2);
  await waitFor(async () => expect(await AsyncStorage.getItem('onto.feedRadius.v1')).toBe('2'));
});
