import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { LOS_ANGELES, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 34.0503, lng: -118.2553 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 5, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Los Angeles in California without changing the prior city identities', () => {
  expect(cityById('los-angeles')).toMatchObject({
    state: 'California',
    serviceRegion: 'los-angeles',
    timeZone: 'America/Los_Angeles',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(20);
  expect(COMING_SOON_CITIES).not.toContain('Los Angeles');
  expect(regionLocalities('los-angeles')).toEqual(
    expect.arrayContaining(['Los Angeles', 'Long Beach', 'Pasadena', 'Glendale', 'Santa Monica', 'Culver City', 'West Hollywood', 'Torrance', 'Lancaster', 'Palmdale']),
  );
  expect(LOS_ANGELES.timezone).toBe('America/Los_Angeles');
});

it.each([
  ['Downtown Los Angeles', 34.0503, -118.2553],
  ['Santa Monica', 34.0195, -118.4912],
  ['Long Beach', 33.7701, -118.1937],
  ['Pasadena', 34.1478, -118.1445],
  ['Lancaster in Antelope Valley', 34.6868, -118.1542],
  ['Avalon on Santa Catalina Island', 33.3428, -118.3282],
])('accepts %s inside Los Angeles County bounds and assigns Pacific time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('los-angeles');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Los_Angeles');
});

it.each([
  ['San Diego in San Diego County', 32.7157, -117.1611],
  ['Santa Barbara in Santa Barbara County', 34.4208, -119.6982],
  ['Bakersfield in Kern County', 35.3733, -119.0187],
  ['Palm Springs in Riverside County', 33.8303, -116.5453],
  ['Fresno in Central Valley', 36.7468, -119.7726],
])('rejects %s outside Los Angeles County bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local supply in both radius buckets and retains Utah, Florida, and prior destinations', () => {
  const local = SPOTS.filter(spot => spot.serviceRegion === 'los-angeles');
  expect(local.length).toBeGreaterThanOrEqual(6);
  expect(new Set(local.map(spot => spot.placeKind)).size).toBeGreaterThanOrEqual(3);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'tallahassee').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'jacksonville').length).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'tampa-bay').length).toBeGreaterThanOrEqual(3);
  expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('los-angeles');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-18' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 3 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('los-angeles');
  }
  expect(result.clock.hour).toBe(11); // 18:00 UTC = 11:00 PDT
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('34.1,-118.3');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 68, windMph: 20 },
  });
  expect(storm.nearby.map(row => row.spot.id).sort()).toEqual(calm.nearby.map(row => row.spot.id).sort());
  expect(storm.nearby.some(row => row.spot.indoorBoost === true)).toBe(true);
  expect(storm.nearby.some(row => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) {
    expect(row.line).not.toMatch(/open|clear|sky is fine/i);
  }
});

it('keeps Los Angeles region strictly isolated from other regions', () => {
  const utahPoint = { lat: 40.7608, lng: -111.8910 };
  const tallahasseePoint = { lat: 30.4383, lng: -84.2807 };
  const jacksonvillePoint = { lat: 30.3298, lng: -81.6589 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };
  const tampaPoint = { lat: 27.9510, lng: -82.4632 };
  const laPoint = { lat: 34.0503, lng: -118.2553 };

  expect(regionForSpot(utahPoint)).toBe('utah');
  expect(regionForSpot(tallahasseePoint)).toBe('tallahassee');
  expect(regionForSpot(jacksonvillePoint)).toBe('jacksonville');
  expect(regionForSpot(miamiPoint)).toBe('miami');
  expect(regionForSpot(tampaPoint)).toBe('tampa-bay');
  expect(regionForSpot(laPoint)).toBe('los-angeles');

  const laFeed = buildPlacesFeed({ ...base, origin: laPoint, radiusMi: 50 });
  const laRows = [...laFeed.nearby, ...laFeed.farther];
  expect(laRows.length).toBeGreaterThan(0);
  expect(laRows.every(row => row.spot.serviceRegion === 'los-angeles')).toBe(true);
});
