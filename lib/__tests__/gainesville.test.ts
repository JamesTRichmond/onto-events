import { CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import regions from '@/data/service-regions.json';
import { GAINESVILLE, regionForSpot } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

const origin = { lat: 29.6515, lng: -82.3216 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-17T16:00:00Z'), radiusMi: 15, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Gainesville in Florida on Eastern time', () => {
  expect(cityById('gainesville')).toMatchObject({ state: 'Florida', serviceRegion: 'gainesville', timeZone: 'America/New_York', availability: 'available' });
  expect(CITIES.filter(city => city.serviceRegion === 'gainesville').map(city => city.id)).toEqual(['gainesville']);
  expect(GAINESVILLE.timezone).toBe('America/New_York');
});

it('keeps the Gainesville box disjoint from every other region, edges inclusive', () => {
  const g = GAINESVILLE.bounds;
  for (const other of regions.filter(region => region.id !== 'gainesville')) {
    const b = other.bounds;
    const overlaps = b.latMin <= g.latMax && g.latMin <= b.latMax && b.lngMin <= g.lngMax && g.lngMin <= b.lngMax;
    expect([other.id, overlaps]).toEqual([other.id, false]);
  }
});

it.each([
  ['Downtown Gainesville', 29.6515, -82.3216],
  ['Library West', 29.6513, -82.3429],
  ['High Springs', 29.8268, -82.5968],
  ['Micanopy', 29.5047, -82.2818],
])('places %s in gainesville on Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('gainesville');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Ocala in Marion', 29.1872, -82.1401],
  ['Lake City in Columbia', 30.1897, -82.6393],
])('leaves %s outside every region', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
});

it('serves only Gainesville places from a Gainesville origin', () => {
  const local = SPOTS.filter(spot => spot.serviceRegion === 'gainesville');
  expect(local.length).toBeGreaterThan(0);
  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('gainesville');
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.hours).toBeTruthy();
  }
  const feed = buildPlacesFeed(base);
  const rows = [...feed.nearby, ...feed.farther];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.spot.serviceRegion).toBe('gainesville');
});
