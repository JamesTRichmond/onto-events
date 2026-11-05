import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useArrivalFeedback } from '../use-arrival-feedback';
import { eraseAllOntoData, STORAGE_KEYS } from '@/lib/storage';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
it('keeps a private answer across restart and rejects corrupt values', async () => {
  await AsyncStorage.setItem(
    STORAGE_KEYS.arrivalFeedback,
    JSON.stringify({ a: 'easy', b: 'location', c: { lat: 1 } }),
  );
  const hook = renderHook(() => useArrivalFeedback('a'));
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  expect(hook.result.current.answered).toBe(true);
  act(() => hook.result.current.answer('hard'));
  await waitFor(async () =>
    expect(
      JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.arrivalFeedback))!),
    ).toEqual({ a: 'hard' }),
  );
});
it('merges an answer made before loading finishes', async () => {
  let release!: (value: string) => void;
  const gate = new Promise<string>((resolve) => {
    release = resolve;
  });
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => gate);
  const hook = renderHook(() => useArrivalFeedback('new'));
  act(() => hook.result.current.answer('skipped'));
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await act(async () => {
    release(JSON.stringify({ previous: 'easy' }));
    await gate;
  });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  await waitFor(async () =>
    expect(
      JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.arrivalFeedback))!),
    ).toEqual({ previous: 'easy', new: 'skipped' }),
  );
});
it('clears a mounted answer and prevents an old load resurrecting erased data', async () => {
  let release!: (value: string) => void;
  const gate = new Promise<string>((resolve) => {
    release = resolve;
  });
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => gate);
  const hook = renderHook(() => useArrivalFeedback('a'));
  await act(async () => {
    await eraseAllOntoData();
  });
  await act(async () => {
    release(JSON.stringify({ a: 'easy' }));
    await gate;
  });
  expect(hook.result.current.answered).toBe(false);
  expect(await AsyncStorage.getItem(STORAGE_KEYS.arrivalFeedback)).toBeNull();
});
