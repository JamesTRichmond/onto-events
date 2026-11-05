import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useAffinities } from '../use-affinities';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const KEY = 'onto.affinities.v1';
const stored = (weights: Record<string, number>, updatedAt = new Date().toISOString()) =>
  AsyncStorage.setItem(KEY, JSON.stringify({ weights, updatedAt }));

const readStored = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');

describe('useAffinities', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('restores stored taste', async () => {
    await stored({ music: 4 });

    const { result } = renderHook(() => useAffinities());
    await waitFor(() => expect(result.current.weights.music).toBeCloseTo(4, 3));
  });

  it('decays stored taste by the elapsed time', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    await stored({ music: 8 }, sixtyDaysAgo);

    // Two 30-day half-lives: 8 -> 2.
    const { result } = renderHook(() => useAffinities());
    await waitFor(() => expect(result.current.weights.music).toBeCloseTo(2, 3));
  });

  it('persists decayed taste when loading without new signals', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    await stored({ music: 8 }, sixtyDaysAgo);

    renderHook(() => useAffinities());

    await waitFor(async () => {
      const state = await readStored();
      expect(state.weights.music).toBeCloseTo(2, 3);
      expect(Date.parse(state.updatedAt)).toBeGreaterThan(Date.parse(sixtyDaysAgo));
    });
  });

  it('adds a signal landing before the load to the stored weight, never replacing it', async () => {
    await stored({ music: 4 });

    const { result } = renderHook(() => useAffinities());
    // Tap lands before the async load settles.
    act(() => result.current.record('music', 'join'));

    await waitFor(() => expect(result.current.weights.music).toBeCloseTo(5, 3));
  });

  it('persists a pre-load signal instead of dropping it', async () => {
    await stored({ music: 4 });

    const { result } = renderHook(() => useAffinities());
    act(() => result.current.record('music', 'join'));
    await waitFor(() => expect(result.current.weights.music).toBeCloseTo(5, 3));

    await waitFor(async () => expect((await readStored()).weights.music).toBeCloseTo(5, 3));
  });

  it('persists signals recorded after load', async () => {
    const { result } = renderHook(() => useAffinities());
    await waitFor(() => expect(result.current.weights).toEqual({}));

    act(() => result.current.record('outdoors', 'action'));

    await waitFor(async () => expect((await readStored()).weights.outdoors).toBeCloseTo(0.5, 3));
  });
});
