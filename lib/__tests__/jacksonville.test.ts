import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { JACKSONVILLE, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 30.3298, lng: -81.6589 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 1, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Jacksonville in Florida without changing the prior city identities', () => {
  expect(cityById('jacksonville')).toMatchObject({ state: 'Florida', serviceRegion: 'jacksonville', timeZone: 'America/New_York', availability: 'available' });
  expect(CITIES.length).toBeGreaterThanOrEqual(15);
  expect(COMING_SOON_CITIES).not.toContain('Jacksonville');
  expect(regionLocalities('jacksonville')).toEqual(expect.arrayContaining(['Jacksonville', 'Jacksonville Beach', 'Atlantic Beach', 'Neptune Beach', 'Baldwin']));
  expect(JACKSONVILLE.boundaryId).toBe('duval-county-2025');
});

it.each([
  ['downtown', 30.3298, -81.6589], ['Jacksonville Beach', 30.2947, -81.3931],
  ['Atlantic Beach', 30.3344, -81.3987], ['Neptune Beach', 30.3116, -81.3965], ['Baldwin', 30.3027, -81.9754],
])('accepts %s inside Duval and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('jacksonville');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Orange Park in Clay', 30.1661, -81.7065], ['Ponte Vedra Beach in St. Johns', 30.2400, -81.3850],
  ['Bryceville in Nassau', 30.3830, -81.9400],
])('rejects %s, including neighboring points inside the coarse envelope', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local supply in both radius buckets and retains all 39 Utah destinations', () => {
  const local = SPOTS.filter(spot => spot.serviceRegion === 'jacksonville');
  expect(local.length).toBeGreaterThanOrEqual(3);
  expect(new Set(local.map(spot => spot.placeKind)).size).toBeGreaterThanOrEqual(2);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);
  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('jacksonville');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-15' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }
  const result = buildPlacesFeed(base);
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) expect(row.spot.serviceRegion).toBe('jacksonville');
  expect(result.clock.hour).toBe(14);
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('30.3,-81.7');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({ ...base, radiusMi: 100, sort: 'sky', weather: { ...weather, kind: 'thunder', temperatureF: 70, windMph: 30 } });
  expect(storm.nearby.map(row => row.spot.id).sort()).toEqual(calm.nearby.map(row => row.spot.id).sort());
  expect(storm.nearby[0].spot.indoorBoost).toBe(true);
  expect(storm.nearby.some(row => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) expect(row.line).not.toMatch(/open|clear|sky is fine/i);
});

it('keeps Tallahassee supply in its own region after both Florida launches', () => {
  const point = { lat: 30.4383, lng: -84.2807 };
  expect(regionForSpot(point)).toBe('tallahassee');
  const result = buildPlacesFeed({ ...base, origin: point });
  const rows = [...result.nearby, ...result.farther];
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => row.spot.serviceRegion === 'tallahassee')).toBe(true);
});
