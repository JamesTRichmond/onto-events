import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useLocationChoice } from '../use-location-choice';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const KEY = 'onto.locationChoice.v2';
const LEGACY = 'onto.locationChoice.v1';

describe('useLocationChoice', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('defaults to the device and never writes on a plain load', async () => {
    const { result } = renderHook(() => useLocationChoice());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.choice).toBe('device');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('loads a stored Salt Lake City choice', async () => {
    await AsyncStorage.setItem(LEGACY, 'slc');

    const { result } = renderHook(() => useLocationChoice());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.choice).toBe('city');
  });

  it('treats anything but slc as the device (no coordinates are ever read)', async () => {
    await AsyncStorage.setItem(KEY, '{"lat":44.0,"lng":-73.1}');

    const { result } = renderHook(() => useLocationChoice());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.choice).toBe('device');
  });

  it('persists the city choice and the return to the device', async () => {
    const { result } = renderHook(() => useLocationChoice());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.chooseCity('salt-lake-city'));
    expect(result.current.choice).toBe('city');
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ mode: 'city', cityId: 'salt-lake-city' }));

    act(() => result.current.followDevice());
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ mode: 'device', cityId: 'salt-lake-city' }));
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
    expect((AsyncStorage.setItem as jest.Mock).mock.calls).toEqual([
      [KEY, JSON.stringify({ mode: 'city', cityId: 'salt-lake-city' })],
      [KEY, JSON.stringify({ mode: 'device', cityId: 'salt-lake-city' })],
    ]);
  });

  it('a tap made before the load settles wins over stored state', async () => {
    let releaseLoad!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      releaseLoad = resolve;
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => gate);

    const { result } = renderHook(() => useLocationChoice());
    act(() => result.current.chooseCity('salt-lake-city'));

    await act(async () => {
      releaseLoad(JSON.stringify({ mode: 'device', cityId: 'burlington' }));
      await gate;
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.choice).toBe('city');
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ mode: 'city', cityId: 'salt-lake-city' }));
  });

 it('remembers a selected city through a temporary pin and reopening', async () => {
  const first = renderHook(() => useLocationChoice());
  await waitFor(() => expect(first.result.current.loaded).toBe(true));
  act(() => first.result.current.chooseCity('middlebury'));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ mode: 'city', cityId: 'middlebury' }));
  act(() => first.result.current.choosePin({ lat: 44.48, lng: -73.21 }));
  expect(first.result.current.choice).toBe('pin');
  expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ mode: 'city', cityId: 'middlebury' });
  first.unmount();
  const second = renderHook(() => useLocationChoice());
  await waitFor(() => expect(second.result.current.loaded).toBe(true));
  expect(second.result.current.choice).toBe('city');
  expect(second.result.current.city.id).toBe('middlebury');
  expect(second.result.current.pin).toBeNull();
 });
 it('ignores unsupported pins and upcoming cities', async () => {
  const { result } = renderHook(() => useLocationChoice());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  act(() => { result.current.chooseCity('unlaunched-city'); result.current.choosePin({ lat: 0, lng: 0 }); });
  expect(result.current.choice).toBe('device');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
 });

});
