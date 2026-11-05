import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useUserLocation } from '../use-user-location';
import { SLC_ANCHOR } from '@/data/activities';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Location = require('expo-location');

describe('useUserLocation', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('returns GPS coordinates when permission is granted and a fix arrives', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.75, longitude: -111.9 },
    });

    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toEqual({
      lat: 40.8,
      lng: -111.9,
      source: 'gps',
      loading: false,
      fallbackReason: null,
      refresh: expect.any(Function),
    });
  });

  it('falls back to the SLC anchor when permission is denied', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.source).toBe('fallback');
    expect(result.current.lat).toBe(40.8);
    expect(result.current.lng).toBe(-111.9);
    expect(result.current.lat).not.toBe(SLC_ANCHOR.lat);
    expect(result.current.fallbackReason).toBe('permission-denied');
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('starts the 4s timeout only after Allow, so a slow reader on the permission prompt still gets a fix', async () => {
    jest.useFakeTimers();
    let answerPrompt!: (value: { status: string }) => void;
    Location.requestForegroundPermissionsAsync.mockReturnValue(
      new Promise((resolve) => {
        answerPrompt = resolve;
      }),
    );
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.75, longitude: -111.9 },
    });

    const { result } = renderHook(() => useUserLocation());
    expect(result.current.loading).toBe(true);

    // Spend 6s reading the permission dialog before tapping Allow.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(6_000);
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.fallbackReason).toBeNull();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();

    await act(async () => {
      answerPrompt({ status: 'granted' });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.source).toBe('gps');
    expect(result.current.lat).toBe(40.8);
    expect(result.current.lng).toBe(-111.9);
  });

  it('settles to the fallback when the position fix never arrives within 4s after Allow', async () => {
    jest.useFakeTimers();
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useUserLocation());

    await act(async () => {
      await jest.advanceTimersByTimeAsync(4_100);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.source).toBe('fallback');
    expect(result.current.fallbackReason).toBe('timeout');
  });

  it('asks for one fresh fix when refreshed (Find me)', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync
      .mockResolvedValueOnce({ coords: { latitude: 40.75, longitude: -111.9 } })
      .mockResolvedValueOnce({ coords: { latitude: 40.7, longitude: -111.85 } });

    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.lat).toBe(40.8));

    act(() => result.current.refresh());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.lat).toBe(40.7));
    expect(result.current.lng).toBe(-111.8);
    expect(result.current.loading).toBe(false);
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  });

  it('never touches Location while disabled, then asks once when enabled', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.75, longitude: -111.9 },
    });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useUserLocation(enabled),
      { initialProps: { enabled: false } },
    );
    await act(async () => {});
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.source).toBe('gps'));
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('takes no fix when the gate closes while the permission prompt is up', async () => {
    let answerPrompt: (value: { status: string }) => void = () => {};
    Location.requestForegroundPermissionsAsync.mockReturnValue(
      new Promise((resolve) => {
        answerPrompt = resolve;
      }),
    );
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.75, longitude: -111.9 },
    });

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useUserLocation(enabled),
      { initialProps: { enabled: true } },
    );
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);

    // The viewer picks Salt Lake City or a pin before answering the prompt.
    rerender({ enabled: false });
    await act(async () => {
      answerPrompt({ status: 'granted' });
    });

    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('re-offers the permission when an Allow Once grant has lapsed', async () => {
    Location.requestForegroundPermissionsAsync
      .mockResolvedValueOnce({ status: 'denied' })
      .mockResolvedValueOnce({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.75, longitude: -111.9 },
    });

    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.fallbackReason).toBe('permission-denied'));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.source).toBe('gps'));
  });

  it('never exposes more than one decimal place from an exact GPS fix', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.760812, longitude: -111.891047 },
    });

    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lat).toBe(40.8);
    expect(result.current.lng).toBe(-111.9);
    expect(result.current.lat).not.toBe(40.760812);
    expect(result.current.lng).not.toBe(-111.891047);
  });

});