import hourly from './fixtures/hourly-slc.json';
import observation from './fixtures/observation-kslc.json';
import points from './fixtures/points-slc.json';
import stations from './fixtures/stations-slc.json';

/** Recorded api.weather.gov answers for the Salt Lake City cell (Sep 28, 2026). */
export const NWS_FIXTURES: Record<string, unknown> = {
  'https://api.weather.gov/points/40.8,-111.9': points,
  'https://api.weather.gov/gridpoints/SLC/100,177/stations?limit=3': stations,
  'https://api.weather.gov/stations/KSLC/observations/latest': observation,
  'https://api.weather.gov/gridpoints/SLC/100,177/forecast/hourly': hourly,
};

/** A fetch that answers from the fixtures and records every URL and header it was asked. */
export function fakeNwsFetch(overrides: Record<string, unknown | Error> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = jest.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const answer = url in overrides ? overrides[url] : NWS_FIXTURES[url];
    if (answer instanceof Error) throw answer;
    if (answer === undefined) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => answer };
  });
  return { fetchImpl, calls };
}
