import { CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import regions from '@/data/service-regions.json';
import { PENSACOLA, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';
import { LOCAL_ACTIVITIES as PENSACOLA_ACTIVITIES } from '@/data/pensacola-events';

const origin = { lat: 30.4158, lng: -87.2189 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-17T16:00:00Z'), radiusMi: 15, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Pensacola and the Florida Panhandle on Central time', () => {
  expect(cityById('pensacola')).toMatchObject({
    state: 'Florida',
    serviceRegion: 'pensacola',
    timeZone: 'America/Chicago',
    availability: 'available',
  });
  expect(CITIES.filter((city) => city.serviceRegion === 'pensacola').map((city) => city.id)).toEqual(['pensacola']);
  expect(PENSACOLA.timezone).toBe('America/Chicago');
  expect(regionLocalities('pensacola')).toEqual(
    expect.arrayContaining([
      'Pensacola',
      'Pensacola Beach',
      'Perdido Key',
      'Gulf Breeze',
      'Milton',
      'Navarre',
      'Pace',
      'Century',
      'Jay',
      'Fort Walton Beach',
      'Destin',
      'Niceville',
      'DeFuniak Springs',
      'Santa Rosa Beach',
      'Seaside',
      'Panama City',
      'Panama City Beach',
    ]),
  );
});

it('keeps the Pensacola box disjoint from every other region, edges inclusive', () => {
  const p = PENSACOLA.bounds;
  for (const other of regions.filter((region) => region.id !== 'pensacola')) {
    const b = other.bounds;
    const overlaps = b.latMin <= p.latMax && p.latMin <= b.latMax && b.lngMin <= p.lngMax && p.lngMin <= b.lngMax;
    expect([other.id, overlaps]).toEqual([other.id, false]);
  }
});

it.each([
  ['Downtown Pensacola', 30.4158, -87.2189],
  ['UWF main campus', 30.5492, -87.2175],
  ['Milton', 30.6324, -87.0397],
  ['Gulf Breeze', 30.3571, -87.1639],
  ['Navarre Beach', 30.3800, -86.8636],
  ['Fort Walton Beach', 30.4058, -86.6188],
  ['Destin', 30.3935, -86.4958],
  ['Niceville', 30.5169, -86.4822],
  ['DeFuniak Springs', 30.7207, -86.1169],
  ['Santa Rosa Beach', 30.3960, -86.2288],
  ['Seaside / 30A', 30.3194, -86.1378],
  ['Panama City', 30.1588, -85.6602],
  ['Panama City Beach', 30.1766, -85.8055],
])('places %s in pensacola on Central time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('pensacola');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Chicago');
});

it.each([
  ['Mobile, Alabama', 30.6954, -88.0399],
  ['Foley, Alabama', 30.4066, -87.6836],
  ['Brewton, Alabama', 31.1052, -87.0722],
  ['Dothan, Alabama', 31.2232, -85.3905],
])('leaves %s outside every region', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
});

it('pins the Pensacola places across 5 kinds and marks entrance fee policies honestly', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'pensacola');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(5);

  const priceMap = Object.fromEntries(local.map((s) => [s.id, s.price]));
  expect(priceMap['spot-pensacola-naval-aviation-museum']).toBe('Free');
  expect(priceMap['spot-pensacola-fort-pickens']).toBe('Entrance fee');

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('pensacola');
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.hours).toBeTruthy();
  }
});

it('serves only Pensacola places from a Pensacola origin', () => {
  const feed = buildPlacesFeed(base);
  const rows = [...feed.nearby, ...feed.farther];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.spot.serviceRegion).toBe('pensacola');
  expect(feed.clock.hour).toBe(11); // 16:00 UTC = 11:00 CDT (America/Chicago)
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('30.4,-87.2');
});

it('contains balanced family and general ratings in the Pensacola offline bundle', () => {
  const ratings = new Set(PENSACOLA_ACTIVITIES.map((activity) => activity.rating));
  expect(ratings.has('family')).toBe(true);
  expect(ratings.has('general')).toBe(true);
});
