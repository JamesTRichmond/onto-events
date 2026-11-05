import { useEffect, useMemo, useState } from 'react';

import { weatherCell, type WeatherCell } from '@/lib/weather/cell';
import { fetchWeather, type FetchLike, type WeatherReport } from '@/lib/weather/nws';

/** NWS observations land about hourly; asking more often only costs their servers. */
export const WEATHER_REFRESH_MS = 10 * 60_000;

// Memory only, keyed by cell: never written to storage, gone when onto closes.
const cache = new Map<string, WeatherReport>();
const inFlight = new Map<string, Promise<WeatherReport>>();

/** Tests start each case with no remembered weather. */
export function resetWeatherCache() {
  cache.clear();
  inFlight.clear();
}

function load(cell: WeatherCell, nowMs: number): Promise<WeatherReport> {
  const pending = inFlight.get(cell.key);
  if (pending) return pending;
  const request = fetchWeather(cell, globalThis.fetch as unknown as FetchLike, nowMs)
    .then((report) => {
      cache.set(cell.key, report);
      return report;
    })
    .finally(() => inFlight.delete(cell.key));
  inFlight.set(cell.key, request);
  return request;
}

export type WeatherState = {
  cell: WeatherCell | null;
  report: WeatherReport | null;
  loading: boolean;
  /** True when the last try failed and there is nothing to show. */
  unavailable: boolean;
};

/**
 * Weather for the place the feed is looking at (James, 2026-09-05: "you see
 * the weather of the place you are looking at"), asked of NWS by grid cell.
 * `now` is the screen's clock; a new minute past the refresh window asks again.
 */
export function useWeather(lat: number, lng: number, now: number | null, enabled = true): WeatherState {
  const cell = useMemo(() => weatherCell(lat, lng), [lat, lng]);
  const key = cell?.key ?? null;
  const [state, setState] = useState<{ key: string | null; report: WeatherReport | null; failedAt: number | null }>(
    () => ({ key, report: key ? cache.get(key) ?? null : null, failedAt: null }),
  );
  const cached = key ? cache.get(key) ?? null : null;
  const due = now !== null && (!cached || now - cached.fetchedAt >= WEATHER_REFRESH_MS);
  // After a failure, one more try per refresh window — never a retry loop.
  const failedAt = state.key === key ? state.failedAt : null;
  const retryReady = failedAt === null || (now !== null && now - failedAt >= WEATHER_REFRESH_MS);

  useEffect(() => {
    if (!enabled || !cell || !due || !retryReady || now === null) return;
    let active = true;
    const askedAt = now;
    load(cell, askedAt).then(
      (report) => active && setState({ key: cell.key, report, failedAt: null }),
      () => active && setState((prev) => ({
        key: cell.key,
        report: prev.key === cell.key ? prev.report : null,
        failedAt: askedAt,
      })),
    );
    return () => {
      active = false;
    };
    // `due` and `retryReady` flip only when a fetch is owed; `now` alone must not refire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, due, retryReady]);

  const report = state.key === key ? state.report ?? cached : cached;
  return {
    cell,
    report: enabled ? report : null,
    loading: enabled && !report && failedAt === null,
    unavailable: enabled && !report && failedAt !== null,
  };
}
