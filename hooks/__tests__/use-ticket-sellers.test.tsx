import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { eraseAllOntoData } from '@/lib/storage';

import { useTicketSellers } from '../use-ticket-sellers';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(async () => { await AsyncStorage.clear(); });

it('starts hidden and reads only the exact confirmed value as shown', async () => {
  const fresh = renderHook(() => useTicketSellers());
  expect(fresh.result.current.shown).toBe(false);
  await waitFor(() => expect(fresh.result.current).toMatchObject({ shown: false, loaded: true }));
  fresh.unmount();
  for (const [stored, shown] of [['on', true], ['true', false], ['ON', false], ['1', false]] as const) {
    await AsyncStorage.setItem('onto.ticketSellers.v1', stored);
    const { result, unmount } = renderHook(() => useTicketSellers());
    await waitFor(() => expect(result.current).toMatchObject({ shown, loaded: true }));
    unmount();
  }
});

it('a request alone changes nothing; only the confirmation turns sellers on', async () => {
  const { result } = renderHook(() => useTicketSellers());
  await waitFor(() => expect(result.current.loaded).toBe(true));

  act(() => result.current.requestShow());
  expect(result.current).toMatchObject({ shown: false, pendingConfirm: true });
  act(() => result.current.cancelShow());
  expect(result.current).toMatchObject({ shown: false, pendingConfirm: false });
  expect(await AsyncStorage.getItem('onto.ticketSellers.v1')).toBeNull();

  act(() => result.current.requestShow());
  act(() => result.current.confirmShow());
  expect(result.current).toMatchObject({ shown: true, pendingConfirm: false });
  await waitFor(async () => expect(await AsyncStorage.getItem('onto.ticketSellers.v1')).toBe('on'));

  act(() => result.current.hide());
  expect(result.current.shown).toBe(false);
  await waitFor(async () => expect(await AsyncStorage.getItem('onto.ticketSellers.v1')).toBeNull());
});

it('erasing local data hides ticket sellers again', async () => {
  await AsyncStorage.setItem('onto.ticketSellers.v1', 'on');
  const { result } = renderHook(() => useTicketSellers());
  await waitFor(() => expect(result.current.shown).toBe(true));
  await act(async () => { await eraseAllOntoData(); });
  expect(result.current.shown).toBe(false);
  expect(await AsyncStorage.getItem('onto.ticketSellers.v1')).toBeNull();
});
