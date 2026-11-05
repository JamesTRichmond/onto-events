import { renderHook, waitFor } from '@testing-library/react-native';

import { fakeNwsFetch } from '@/lib/weather/__tests__/fake-nws';
import { resetWeatherCache, useWeather, WEATHER_REFRESH_MS } from '../use-weather';

const AT = Date.parse('2026-09-28T20:30:00Z');
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  resetWeatherCache();
});

describe('useWeather', () => {
  it('loads the cell’s weather once and shares it across screens', async () => {
    const { fetchImpl } = fakeNwsFetch();
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    const first = renderHook(() => useWeather(40.7608, -111.891, AT));
    expect(first.result.current.loading).toBe(true);
    await waitFor(() => expect(first.result.current.report?.now?.tempF).toBe(61));
    const callsAfterFirst = fetchImpl.mock.calls.length;

    const second = renderHook(() => useWeather(40.79, -111.93, AT + 60_000));
    expect(second.result.current.report?.now?.tempF).toBe(61);
    expect(second.result.current.cell?.key).toBe('40.8,-111.9');
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
  });

  it('asks again only after the refresh window', async () => {
    const { fetchImpl } = fakeNwsFetch();
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    const { result, rerender } = renderHook(({ now }: { now: number }) => useWeather(40.76, -111.89, now), {
      initialProps: { now: AT },
    });
    await waitFor(() => expect(result.current.report).not.toBeNull());
    const n = fetchImpl.mock.calls.length;

    rerender({ now: AT + 5 * 60_000 });
    expect(fetchImpl.mock.calls.length).toBe(n);
    rerender({ now: AT + WEATHER_REFRESH_MS });
    await waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThan(n));
  });

  it('says unavailable when NWS cannot answer, and never guesses', async () => {
    // The jest setup's fetch refuses every request, like an offline phone.
    const { result } = renderHook(() => useWeather(40.76, -111.89, AT));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.report).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('after a failure it tries once more per refresh window, not in a loop', async () => {
    const calls: string[] = [];
    globalThis.fetch = ((url: string) => {
      calls.push(url);
      return Promise.reject(new Error('offline'));
    }) as unknown as typeof fetch;
    const { result, rerender } = renderHook(({ now }: { now: number }) => useWeather(40.76, -111.89, now), {
      initialProps: { now: AT },
    });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    rerender({ now: AT + 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(1);

    rerender({ now: AT + WEATHER_REFRESH_MS });
    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it('disabled asks nothing', () => {
    const { fetchImpl } = fakeNwsFetch();
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    const { result } = renderHook(() => useWeather(40.76, -111.89, AT, false));
    expect(result.current.report).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
