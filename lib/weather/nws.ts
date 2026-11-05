import type { WeatherCell } from './cell';
import { weatherWord, type WeatherWord } from './condition';

/**
 * The National Weather Service adapter (api.weather.gov): free, keyless,
 * public-domain US government data, the provider DECISIONS 2026-09-14 named.
 *
 * Every request carries the weather cell's grid point and nothing else — no
 * account, no device id, no position (lib/weather/cell.ts). Responses are
 * untrusted input: only https://api.weather.gov links are ever followed, and
 * every field is read defensively so a missing or odd value becomes null
 * instead of a wrong number on screen.
 */

export const NWS_ROOT = 'https://api.weather.gov/';
// NWS asks every client to name itself and give a contact.
export const NWS_USER_AGENT = 'onto.events (support@onto.events)';
const TIMEOUT_MS = 8000;
/** An observation older than this is not "now" any more. */
export const OBSERVATION_FRESH_MS = 90 * 60_000;

export type WeatherNow = {
  observedAt: number;
  description: string;
  word: WeatherWord;
  tempF: number | null;
  feelsF: number | null;
  windMph: number | null;
  gustMph: number | null;
  /** Where the wind blows from, as a compass point ("S", "NW"). */
  windFrom: string | null;
  humidityPct: number | null;
  station: string;
};

export type HourForecast = {
  startsAt: number;
  tempF: number | null;
  description: string;
  word: WeatherWord;
  rainPct: number | null;
  isDaytime: boolean;
};

export type WeatherReport = {
  cell: WeatherCell;
  /** The nearest named place NWS reports for the grid point ("Salt Lake City, UT"). */
  place: string | null;
  now: WeatherNow | null;
  hours: HourForecast[];
  fetchedAt: number;
};

type Json = Record<string, unknown>;
const obj = (value: unknown): Json | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
/** A quantitative NWS value ({ value, unitCode }), in its reported unit. */
const quantity = (value: unknown): { value: number; unit: string } | null => {
  const q = obj(value);
  const v = finite(q?.value);
  return q && v !== null ? { value: v, unit: str(q.unitCode) ?? '' } : null;
};
const round = (value: number | null) => (value === null ? null : Math.round(value));

function toF(q: { value: number; unit: string } | null): number | null {
  if (!q) return null;
  if (/degC$/.test(q.unit)) return q.value * 1.8 + 32;
  if (/degF$/.test(q.unit)) return q.value;
  return null;
}

function toMph(q: { value: number; unit: string } | null): number | null {
  if (!q) return null;
  if (/km_h-1$/.test(q.unit)) return q.value / 1.609344;
  if (/m_s-1$/.test(q.unit)) return q.value * 2.236936;
  return null;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export function compassPoint(degrees: number | null): string | null {
  if (degrees === null || degrees < 0 || degrees > 360) return null;
  return COMPASS[Math.round(degrees / 45) % 8];
}

/** Only NWS links are followed; anything else in a response is ignored. */
export function nwsUrl(value: unknown): string | null {
  const url = str(value);
  return url && url.startsWith(NWS_ROOT) && !/\s/.test(url) ? url : null;
}

export function parsePoints(json: unknown): { hourlyUrl: string | null; stationsUrl: string | null; place: string | null } {
  const props = obj(obj(json)?.properties);
  const where = obj(obj(obj(props?.relativeLocation)?.properties));
  const city = str(where?.city);
  const state = str(where?.state);
  return {
    hourlyUrl: nwsUrl(props?.forecastHourly),
    stationsUrl: nwsUrl(props?.observationStations),
    place: city ? (state ? `${city}, ${state}` : city) : null,
  };
}

/** The nearest observation station's id (the list is nearest first). */
export function parseStation(json: unknown): string | null {
  const features = obj(json)?.features;
  if (!Array.isArray(features)) return null;
  for (const feature of features) {
    const id = str(obj(obj(feature)?.properties)?.stationIdentifier);
    if (id && /^[A-Z0-9]{3,6}$/.test(id)) return id;
  }
  return null;
}

export function parseObservation(json: unknown, station: string): WeatherNow | null {
  const props = obj(obj(json)?.properties);
  const observedAt = Date.parse(str(props?.timestamp) ?? '');
  if (!props || !Number.isFinite(observedAt)) return null;
  const description = str(props.textDescription) ?? '';
  const tempF = toF(quantity(props.temperature));
  // Heat index or wind chill when NWS reports one; otherwise the air itself.
  const feelsF = toF(quantity(props.heatIndex)) ?? toF(quantity(props.windChill)) ?? tempF;
  const direction = quantity(props.windDirection);
  const humidity = quantity(props.relativeHumidity);
  return {
    observedAt,
    description,
    word: weatherWord(description),
    tempF: round(tempF),
    feelsF: round(feelsF),
    windMph: round(toMph(quantity(props.windSpeed))),
    gustMph: round(toMph(quantity(props.windGust))),
    windFrom: compassPoint(direction?.value ?? null),
    humidityPct: humidity && humidity.value >= 0 && humidity.value <= 100 ? Math.round(humidity.value) : null,
    station,
  };
}

export function parseHourly(json: unknown): HourForecast[] {
  const periods = obj(obj(json)?.properties)?.periods;
  if (!Array.isArray(periods)) return [];
  const hours: HourForecast[] = [];
  for (const raw of periods) {
    const period = obj(raw);
    const startsAt = Date.parse(str(period?.startTime) ?? '');
    if (!period || !Number.isFinite(startsAt)) continue;
    const temperature = finite(period.temperature);
    const unit = str(period.temperatureUnit);
    const tempF = temperature === null ? null : unit === 'C' ? temperature * 1.8 + 32 : unit === 'F' ? temperature : null;
    const rain = finite(obj(period.probabilityOfPrecipitation)?.value);
    const description = str(period.shortForecast) ?? '';
    hours.push({
      startsAt,
      tempF: round(tempF),
      description,
      word: weatherWord(description),
      rainPct: rain !== null && rain >= 0 && rain <= 100 ? Math.round(rain) : null,
      isDaytime: period.isDaytime === true,
    });
  }
  return hours.sort((a, b) => a.startsAt - b.startsAt);
}

/** The observation, only while it is still fresh enough to call "now". */
export function currentConditions(report: WeatherReport | null, nowMs: number): WeatherNow | null {
  const current = report?.now;
  if (!current) return null;
  const age = nowMs - current.observedAt;
  return age >= -5 * 60_000 && age <= OBSERVATION_FRESH_MS ? current : null;
}

/** Forecast hours not yet over, soonest first. */
export function upcomingHours(report: WeatherReport | null, nowMs: number, count: number): HourForecast[] {
  if (!report) return [];
  return report.hours.filter((hour) => hour.startsAt + 60 * 60_000 > nowMs).slice(0, count);
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    // Browsers set their own User-Agent, and naming one there costs a CORS
    // preflight; the phone app names itself as NWS asks.
    const headers: Record<string, string> = process.env.EXPO_OS === 'web'
      ? { Accept: 'application/geo+json' }
      : { Accept: 'application/geo+json', 'User-Agent': NWS_USER_AGENT };
    const response = await fetchImpl(url, {
      headers,
      signal: controller?.signal,
    });
    if (!response.ok) throw new Error('weather service answered with an error');
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Four small requests, all keyed by the cell: the grid point's links, its
 * nearest station, that station's latest observation, and the hourly
 * forecast. The observation and the forecast fail independently, so a quiet
 * station still leaves the forecast (and the reverse). Throws only when the
 * grid point itself cannot be resolved.
 */
export async function fetchWeather(cell: WeatherCell, fetchImpl: FetchLike, nowMs: number): Promise<WeatherReport> {
  const points = parsePoints(await getJson(fetchImpl, `${NWS_ROOT}points/${cell.key}`));
  if (!points.hourlyUrl && !points.stationsUrl) throw new Error('no forecast for this area');

  const observation = (async () => {
    if (!points.stationsUrl) return null;
    const station = parseStation(await getJson(fetchImpl, `${points.stationsUrl}?limit=3`));
    if (!station) return null;
    return parseObservation(
      await getJson(fetchImpl, `${NWS_ROOT}stations/${station}/observations/latest`),
      station,
    );
  })();
  const hourly = points.hourlyUrl ? getJson(fetchImpl, points.hourlyUrl).then(parseHourly) : Promise.resolve([]);

  const [now, hours] = await Promise.allSettled([observation, hourly]);
  const report: WeatherReport = {
    cell,
    place: points.place,
    now: now.status === 'fulfilled' ? now.value : null,
    hours: hours.status === 'fulfilled' ? hours.value : [],
    fetchedAt: nowMs,
  };
  if (!report.now && report.hours.length === 0) throw new Error('weather unavailable');
  return report;
}
