import { CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { TALLAHASSEE, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 30.4383, lng: -84.2807 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 25, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Tallahassee and the Capital Region in Florida on Eastern time', () => {
  expect(cityById('tallahassee')).toMatchObject({
    state: 'Florida',
    serviceRegion: 'tallahassee',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.filter(city => city.serviceRegion === 'tallahassee').map(city => city.id)).toEqual(['tallahassee']);
  expect(TALLAHASSEE.timezone).toBe('America/New_York');
  const localities = regionLocalities('tallahassee');
  expect(localities).toEqual(
    expect.arrayContaining([
      'Tallahassee',
      'Woodville',
      'Bradfordville',
      'Crawfordville',
      'St. Marks',
      'Quincy',
      'Havana',
      'Monticello',
    ])
  );
});

it.each([
  ['Downtown Tallahassee', 30.4383, -84.2807],
  ['Bradfordville', 30.5658, -84.2185],
  ['Woodville', 30.3077, -84.2505],
  ['Crawfordville in Wakulla', 30.1760, -84.3757],
  ['St. Marks Port & Refuge', 30.1610, -84.2046],
  ['Quincy in Gadsden', 30.5871, -84.5830],
  ['Havana Arts District', 30.6244, -84.4149],
  ['Monticello Historic Courthouse', 30.5452, -83.8702],
])('places %s in tallahassee on Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('tallahassee');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Thomasville across the Georgia state line', 30.8366, -83.9788],
  ['Perry in Taylor County', 30.1174, -83.5824],
  ['Blountstown in Calhoun County', 30.4435, -85.0438],
])('rejects %s outside the expanded Big Bend boundary', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has 8 evergreen places across at least 5 distinct kinds', () => {
  const local = SPOTS.filter(spot => spot.serviceRegion === 'tallahassee');
  expect(local.length).toBeGreaterThanOrEqual(8);
  const kinds = new Set(local.map(spot => spot.placeKind));
  expect(kinds.size).toBeGreaterThanOrEqual(5);
  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('tallahassee');
    expect(spot.sourceUrl).toMatch(/^https?:/);
    expect(spot.hours).toBeTruthy();
  }
  const result = buildPlacesFeed(base);
  expect(result.nearby.length + result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('tallahassee');
  }
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('30.4,-84.3');
});
