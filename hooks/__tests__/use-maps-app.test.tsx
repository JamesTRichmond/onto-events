import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMapsApp } from '../use-maps-app';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const KEY = 'onto.mapsApp.v1';

describe('useMapsApp', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('defaults to the phone default and never writes on a plain load', async () => {
    const { result } = renderHook(() => useMapsApp());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.app).toBe('system');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('loads and saves a choice', async () => {
    await AsyncStorage.setItem(KEY, 'waze');
    const { result } = renderHook(() => useMapsApp());
    await waitFor(() => expect(result.current.app).toBe('waze'));

    act(() => result.current.choose('google'));
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe('google'));
  });

  it('treats unknown stored bytes as the phone default', async () => {
    await AsyncStorage.setItem(KEY, 'mapquest');
    const { result } = renderHook(() => useMapsApp());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.app).toBe('system');
  });
});
