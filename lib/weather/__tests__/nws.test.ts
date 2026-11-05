import { weatherCell } from '../cell';
import {
  compassPoint,
  currentConditions,
  fetchWeather,
  NWS_USER_AGENT,
  nwsUrl,
  parseHourly,
  parseObservation,
  parsePoints,
  parseStation,
  upcomingHours,
} from '../nws';
import hourly from './fixtures/hourly-slc.json';
import observation from './fixtures/observation-kslc.json';
import points from './fixtures/points-slc.json';
import stations from './fixtures/stations-slc.json';
import { fakeNwsFetch } from './fake-nws';

const cell = weatherCell(40.7608, -111.891)!;
const AT = Date.parse('2026-09-28T20:30:00Z');

describe('NWS parsers (recorded responses)', () => {
  it('points: follows only api.weather.gov links, and names the place', () => {
    expect(parsePoints(points)).toEqual({
      hourlyUrl: 'https://api.weather.gov/gridpoints/SLC/100,177/forecast/hourly',
      stationsUrl: 'https://api.weather.gov/gridpoints/SLC/100,177/stations',
      place: 'Salt Lake City, UT',
    });
    expect(parsePoints({ properties: { forecastHourly: 'https://evil.example/x', observationStations: 'http://api.weather.gov/x' } }))
      .toEqual({ hourlyUrl: null, stationsUrl: null, place: null });
    expect(nwsUrl('https://api.weather.gov/a b')).toBeNull();
  });

  it('stations: the nearest well-formed station id', () => {
    expect(parseStation(stations)).toBe('KSLC');
    expect(parseStation({ features: [{ properties: { stationIdentifier: 'KTAE' } }] })).toBe('KTAE');
    expect(parseStation({ features: [{ properties: { stationIdentifier: '../x' } }] })).toBeNull();
    expect(parseStation(null)).toBeNull();
  });

  it('observation: converts units and keeps missing values missing', () => {
    const now = parseObservation(observation, 'KSLC')!;
    expect(now).toMatchObject({
      description: 'Cloudy',
      word: 'Clouds',
      tempF: 61,
      feelsF: 61,
      windMph: 11,
      gustMph: null,
      windFrom: 'S',
      humidityPct: 77,
      station: 'KSLC',
    });
    expect(now.observedAt).toBe(Date.parse('2026-09-28T20:15:00+00:00'));
    expect(parseObservation({ properties: { timestamp: 'nope' } }, 'KSLC')).toBeNull();
    expect(parseObservation({ properties: { timestamp: '2026-09-28T20:15:00Z', temperature: { value: 10, unitCode: 'wmoUnit:K' } } }, 'KSLC')?.tempF)
      .toBeNull();
  });

  it('hourly: soonest first, with rain chances and NWS words', () => {
    const hours = parseHourly(hourly);
    expect(hours).toHaveLength(12);
    expect(hours[0]).toMatchObject({ tempF: 68, description: 'Showers And Thunderstorms', word: 'Thunderstorm', rainPct: 78 });
    expect(hours.every((h, i) => i === 0 || h.startsAt > hours[i - 1].startsAt)).toBe(true);
    expect(parseHourly({ properties: { periods: 'x' } })).toEqual([]);
  });

  it('compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(350)).toBe('N');
    expect(compassPoint(225)).toBe('SW');
    expect(compassPoint(null)).toBeNull();
    expect(compassPoint(400)).toBeNull();
  });
});

describe('fetchWeather', () => {
  it('asks by grid cell only: no request carries the position it came from', async () => {
    const { fetchImpl, calls } = fakeNwsFetch();
    const report = await fetchWeather(cell, fetchImpl, AT);

    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining([
      'https://api.weather.gov/points/40.8,-111.9',
      'https://api.weather.gov/stations/KSLC/observations/latest',
    ]));
    for (const { url, headers } of calls) {
      expect(url.startsWith('https://api.weather.gov/')).toBe(true);
      expect(url).not.toMatch(/40\.76|111\.89/);
      expect(headers['User-Agent']).toBe(NWS_USER_AGENT);
    }
    expect(report.place).toBe('Salt Lake City, UT');
    expect(report.now?.tempF).toBe(61);
    expect(report.hours.length).toBe(12);
  });

  it('a quiet station still leaves the forecast, and the reverse', async () => {
    const noObs = fakeNwsFetch({ 'https://api.weather.gov/stations/KSLC/observations/latest': new Error('down') });
    const a = await fetchWeather(cell, noObs.fetchImpl, AT);
    expect(a.now).toBeNull();
    expect(a.hours.length).toBe(12);

    const noHourly = fakeNwsFetch({ 'https://api.weather.gov/gridpoints/SLC/100,177/forecast/hourly': new Error('down') });
    const b = await fetchWeather(cell, noHourly.fetchImpl, AT);
    expect(b.now?.word).toBe('Clouds');
    expect(b.hours).toEqual([]);
  });

  it('throws when there is nothing to show, so the strip stays quiet', async () => {
    const outside = fakeNwsFetch({ 'https://api.weather.gov/points/40.8,-111.9': undefined });
    await expect(fetchWeather(cell, outside.fetchImpl, AT)).rejects.toThrow();
    const both = fakeNwsFetch({
      'https://api.weather.gov/stations/KSLC/observations/latest': new Error('down'),
      'https://api.weather.gov/gridpoints/SLC/100,177/forecast/hourly': new Error('down'),
    });
    await expect(fetchWeather(cell, both.fetchImpl, AT)).rejects.toThrow('weather unavailable');
  });

  it('never follows a link the response points outside NWS', async () => {
    const hijack = fakeNwsFetch({
      'https://api.weather.gov/points/40.8,-111.9': {
        properties: { forecastHourly: 'https://tracker.example/h', observationStations: 'https://tracker.example/s' },
      },
    });
    await expect(fetchWeather(cell, hijack.fetchImpl, AT)).rejects.toThrow();
    expect(hijack.calls.map((c) => c.url)).toEqual(['https://api.weather.gov/points/40.8,-111.9']);
  });
});

describe('freshness', () => {
  it('an observation is "now" for 90 minutes, and forecast hours drop off once over', async () => {
    const { fetchImpl } = fakeNwsFetch();
    const report = await fetchWeather(cell, fetchImpl, AT);
    expect(currentConditions(report, AT)?.tempF).toBe(61);
    expect(currentConditions(report, Date.parse('2026-09-28T21:46:00Z'))).toBeNull();
    // 14:00 MDT = 20:00Z; at 21:30Z the 20:00Z hour is over, 21:00Z is current.
    const later = upcomingHours(report, Date.parse('2026-09-28T21:30:00Z'), 3);
    expect(later[0].startsAt).toBe(Date.parse('2026-09-28T21:00:00Z'));
    expect(later).toHaveLength(3);
  });
});
