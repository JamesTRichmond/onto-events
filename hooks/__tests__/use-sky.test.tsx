import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';

import * as ephemeris from '@/lib/sky/astronomy';
import { useSky, type SkyPreview } from '../use-sky';

const INPUT = {
  now: Date.parse('2026-09-06T18:00:00Z'), latitude: 40.760812, longitude: -111.891047,
  timeZone: 'America/Denver', placeId: 'slc',
};
let appChanged: (state: AppStateStatus) => void;
let motionChanged: (enabled: boolean) => void;
let appRemove: jest.Mock;
let motionRemove: jest.Mock;
const initialAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  appRemove = jest.fn(); motionRemove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    appChanged = listener; return { remove: appRemove };
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_, listener) => {
    motionChanged = listener as unknown as (enabled: boolean) => void;
    return { remove: motionRemove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(AppState, 'currentState', initialAppState);
});

it('keeps null-clock SSR and first render deterministic without claiming a current sky', async () => {
  let first: ReturnType<typeof useSky> | undefined;
  const calculation = jest.spyOn(ephemeris, 'astronomyAt');
  const { result } = renderHook(() => {
    const value = useSky({ ...INPUT, now: null });
    first ??= value;
    return value;
  });
  expect(first).toMatchObject({ astronomy: null, day: null, reduceMotion: true, active: false });
  expect(first?.sky).toMatchObject({ phase: 'night', weather: 'unavailable', animate: false });
  await waitFor(() => expect(result.current.active).toBe(true));
  expect(result.current.astronomy).toBeNull();
  expect(calculation).not.toHaveBeenCalled();
});

it('uses only the supplied feed place and recalculates no more than once per clock minute', async () => {
  const calculation = jest.spyOn(ephemeris, 'astronomyAt');
  const { result, rerender } = renderHook((props: typeof INPUT) => useSky(props), { initialProps: INPUT });
  await waitFor(() => expect(result.current.reduceMotion).toBe(false));
  expect(calculation).toHaveBeenLastCalledWith(INPUT.now, { latitude: INPUT.latitude, longitude: INPUT.longitude });
  const previous = result.current.astronomy;
  rerender({ ...INPUT, now: INPUT.now + 30_000 });
  expect(result.current.astronomy).toBe(previous);
  expect(calculation).toHaveBeenCalledTimes(1);
  rerender({ ...INPUT, now: INPUT.now + 60_000 });
  expect(calculation).toHaveBeenCalledTimes(2);
  rerender({ ...INPUT, latitude: 35.68, longitude: 139.65, timeZone: 'Asia/Tokyo', placeId: 'device' });
  expect(calculation).toHaveBeenLastCalledWith(INPUT.now, { latitude: 35.68, longitude: 139.65 });
});

it('seeds only a coarse feed center and civil date, distinct from the 04:00 night label', async () => {
  const { result } = renderHook(() => useSky({ ...INPUT, now: Date.parse('2026-09-06T08:00:00Z') }));
  await waitFor(() => expect(result.current.day).not.toBeNull());
  expect(result.current.seed).toBe('40.76,-111.89|2026-09-06');
  expect(result.current.seed).not.toContain(String(INPUT.latitude));
  expect(result.current.day).toEqual({ date: '2026-09-05', weekday: 'Saturday' });
});

it('does not treat content-mode changes as a sky input', async () => {
  const initialProps = { ...INPUT, mode: 'everyone' };
  const { result, rerender } = renderHook((props: typeof initialProps) => useSky(props), { initialProps });
  await waitFor(() => expect(result.current.reduceMotion).toBe(false));
  const previous = result.current.sky;
  rerender({ ...initialProps, mode: 'family' });
  expect(result.current.sky).toBe(previous);
  rerender({ ...initialProps, mode: 'mature' }); // Legacy preference is not a theme switch.
  expect(result.current.sky).toBe(previous);
});

it('freezes calculations and motion while inactive, then refreshes when foregrounded', async () => {
  const calculation = jest.spyOn(ephemeris, 'astronomyAt');
  const { result, rerender } = renderHook((props: typeof INPUT) => useSky(props), { initialProps: INPUT });
  await waitFor(() => expect(result.current.sky.animate).toBe(true));
  act(() => appChanged('background'));
  const previous = result.current.astronomy;
  rerender({ ...INPUT, now: INPUT.now + 600_000 });
  rerender({ ...INPUT, now: INPUT.now + 660_000 });
  expect(result.current.sky.animate).toBe(false);
  expect(result.current.astronomy).toBe(previous);
  expect(calculation).toHaveBeenCalledTimes(1);
  act(() => appChanged('active'));
  expect(result.current.reduceMotion).toBe(true);
  expect(calculation).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(result.current.sky.animate).toBe(true));
});

it('fails closed on a rejected OS preference read and responds to later change events', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(new Error('unavailable'));
  const { result } = renderHook(() => useSky(INPUT));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.reduceMotion).toBe(true);
  expect(result.current.sky.animate).toBe(false);
  act(() => motionChanged(false));
  expect(result.current.sky.animate).toBe(true);
  act(() => motionChanged(true));
  expect(result.current.sky.animate).toBe(false);
});

it('does not let a late read override a newer Reduce Motion event and cleans up', async () => {
  let resolve!: (enabled: boolean) => void;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result, unmount } = renderHook(() => useSky(INPUT));
  act(() => motionChanged(true));
  await act(async () => resolve(false));
  expect(result.current.reduceMotion).toBe(true);
  unmount();
  expect(appRemove).toHaveBeenCalledTimes(1);
  expect(motionRemove).toHaveBeenCalledTimes(1);
  act(() => { appChanged('active'); motionChanged(false); });
  expect(result.current.reduceMotion).toBe(true);
});

it('ignores preview inputs entirely in production', async () => {
  jest.replaceProperty(globalThis as unknown as { __DEV__: boolean }, '__DEV__', false);
  const override: SkyPreview = { sunAltitude: -30, rising: false, moonIllumination: 1, weather: 'snow' };
  const { result } = renderHook(() => useSky({ ...INPUT, override }));
  await waitFor(() => expect(result.current.astronomy).not.toBeNull());
  expect(result.current.astronomy?.sun.altitude).toBeGreaterThan(20);
  expect(result.current.sky.weather).toBe('unavailable');
});

it('accepts development preview only as synthetic local visuals', async () => {
  jest.replaceProperty(globalThis as unknown as { __DEV__: boolean }, '__DEV__', true);
  const override: SkyPreview = { sunAltitude: -30, rising: false, moonIllumination: 1,
    moonAltitude: 45, moonAzimuth: 180, weather: 'snow' };
  const { result } = renderHook(() => useSky({ ...INPUT, override }));
  await waitFor(() => expect(result.current.astronomy).not.toBeNull());
  expect(result.current.astronomy?.sun.altitude).toBe(-30);
  expect(result.current.astronomy?.sun.riseWeight).toBe(0);
  expect(result.current.astronomy?.moon).toMatchObject({ altitude: 45, azimuth: 180 });
  expect(result.current.sky).toMatchObject({ phase: 'night', weather: 'snow', starDensity: 0 });
});

it('ignores a preference promise resolving after unmount', async () => {
  let resolve!: (enabled: boolean) => void;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result, unmount } = renderHook(() => useSky(INPUT));
  unmount();
  await act(async () => resolve(false));
  expect(result.current.reduceMotion).toBe(true);
  expect(motionRemove).toHaveBeenCalledTimes(1);
});

it('stays static if the native preference capability throws synchronously', () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockImplementation(() => { throw new Error('unsupported'); });
  const { result } = renderHook(() => useSky(INPUT));
  expect(result.current.reduceMotion).toBe(true);
  expect(result.current.sky.animate).toBe(false);
});

it('unmounts safely when a platform does not return native listener handles', () => {
  jest.mocked(AppState.addEventListener).mockReturnValue(undefined as unknown as ReturnType<typeof AppState.addEventListener>);
  jest.mocked(AccessibilityInfo.addEventListener).mockReturnValue(undefined as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>);
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockImplementation(() => { throw new Error('unsupported'); });
  const { unmount } = renderHook(() => useSky(INPUT));
  expect(() => unmount()).not.toThrow();
});

it('waits for known active state and never adds a second clock timer', async () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: null });
  const timer = jest.spyOn(globalThis, 'setInterval');
  const { result } = renderHook(() => useSky(INPUT));
  expect(result.current.astronomy).toBeNull();
  await act(async () => appChanged('active'));
  expect(result.current.astronomy).not.toBeNull();
  expect(timer).not.toHaveBeenCalled();
});

it.each([{ ...INPUT, now: NaN }, { ...INPUT, latitude: 100 }, { ...INPUT, timeZone: 'Not/AZone' }])(
  'falls back safely for invalid clock/place/timezone %#', async (input) => {
    const { result } = renderHook(() => useSky(input));
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.astronomy).toBeNull();
    expect(result.current.sky.animate).toBe(false);
  });
