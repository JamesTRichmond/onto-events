import { cityClock } from '@/lib/daypart';
import { placeSky } from '@/lib/place-sky';
import { localSunTimes } from '@/lib/sky/astronomy';
import type { LocationOrigin } from '@/lib/location-choice';
import type { WeatherNow } from '@/lib/weather/nws';

const origin: LocationOrigin = { lat: 30.3298, lng: -81.6589, source: 'city', label: 'Jacksonville', serviceRegion: 'jacksonville', timeZone: 'America/New_York' };
const place = { latitude: origin.lat, longitude: origin.lng };
const local = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: origin.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
const minutes = (at: number) => { const p = local(at); return Number(p.find(p => p.type === 'hour')!.value) * 60 + Number(p.find(p => p.type === 'minute')!.value); };

it('uses the selected local date at a UTC date boundary and calculates plausible local sun crossings', () => {
  const sun = localSunTimes(Date.parse('2026-10-16T02:00:00Z'), place, origin.timeZone);
  expect(local(sun.sunriseAt!).find(p => p.type === 'day')?.value).toBe('15');
  expect(minutes(sun.sunriseAt!)).toBeGreaterThan(7 * 60);
  expect(minutes(sun.sunriseAt!)).toBeLessThan(8 * 60);
  expect(minutes(sun.sunsetAt!)).toBeGreaterThan(18 * 60);
  expect(minutes(sun.sunsetAt!)).toBeLessThan(20 * 60);
  expect(sun.nextSunriseAt!).toBeGreaterThan(sun.sunsetAt!);
});

it.each([
  ['2026-10-31T16:00:00Z', '2026-11-01T17:00:00Z', -1],
  ['2026-03-07T17:00:00Z', '2026-03-08T16:00:00Z', 1],
])('moves the civil sun clock across DST while preserving real instants', (before, after, direction) => {
  const a = localSunTimes(Date.parse(before), place, origin.timeZone);
  const b = localSunTimes(Date.parse(after), place, origin.timeZone);
  expect((minutes(b.sunriseAt!) - minutes(a.sunriseAt!)) * direction).toBeGreaterThan(45);
  expect((minutes(b.sunriseAt!) - minutes(a.sunriseAt!)) * direction).toBeLessThan(75);
  expect((b.sunriseAt! - a.sunriseAt!) / 3_600_000).toBeGreaterThan(23.8);
  expect((b.sunriseAt! - a.sunriseAt!) / 3_600_000).toBeLessThan(24.2);
});

it('keeps Eastern and Mountain clocks distinct and handles the local year boundary', () => {
  const now = new Date('2026-10-15T18:00:00Z');
  expect(cityClock(now, null, null, 'America/New_York').hour).toBe(14);
  expect(cityClock(now, null, null, 'America/Denver').hour).toBe(12);
  expect(cityClock(new Date('2027-01-01T01:00:00Z'), null, null, 'America/New_York').weekday).toBe(4);
  const beforeFold = Date.parse('2026-11-01T04:30:00Z');
  const sun = localSunTimes(beforeFold, place, origin.timeZone);
  expect(cityClock(new Date(beforeFold), sun.sunriseAt, sun.sunsetAt, origin.timeZone, sun.nextSunriseAt).minutesToSunrise)
    .toBeCloseTo((sun.sunriseAt! - beforeFold) / 60_000);
});

it('preserves unknown weather and drops stale observations without inventing temperature or wind', () => {
  const now = Date.parse('2026-10-15T18:00:00Z');
  const observation: WeatherNow = { observedAt: now, word: 'Unknown', description: '', tempF: null, feelsF: null, windMph: null, gustMph: null, windFrom: null, humidityPct: null, station: 'KJAX' };
  expect(placeSky(now, origin, observation)).toMatchObject({ kind: null, temperatureF: null, windMph: null });
  expect(placeSky(now, origin, { ...observation, observedAt: now - 61 * 60_000, word: 'Clear', tempF: 80, windMph: 10 }))
    .toMatchObject({ kind: null, temperatureF: null, windMph: null });
  expect(placeSky(now, origin, { ...observation, word: 'Thunderstorm' }).kind).toBe('thunder');
  expect(placeSky(now, origin, null).sunriseAt).not.toBeNull();
});
