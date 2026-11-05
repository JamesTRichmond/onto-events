import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { SAN_FRANCISCO, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 37.7793, lng: -122.4161 }; // San Francisco Public Library (Main Library)
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 1, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches San Francisco in California without changing the prior city identities', () => {
  expect(cityById('san-francisco')).toMatchObject({
    state: 'California',
    serviceRegion: 'san-francisco',
    timeZone: 'America/Los_Angeles',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(20);
  expect(COMING_SOON_CITIES).not.toContain('San Francisco');
  expect(regionLocalities('san-francisco')).toEqual(
    expect.arrayContaining(['San Francisco', 'Oakland', 'Berkeley', 'San Mateo', 'San Rafael']),
  );
  expect(SAN_FRANCISCO.timezone).toBe('America/Los_Angeles');
  expect(SAN_FRANCISCO.boundaryId).toBe('san-francisco-bay-core-2026');
});

it.each([
  ['Downtown San Francisco Civic Center', 37.7793, -122.4161],
  ['Mission District Dolores Park', 37.7596, -122.4269],
  ['Presidio East Beach', 37.8048, -122.4645],
  ['Downtown Oakland', 37.8044, -122.2712],
  ['Downtown Berkeley', 37.8710, -122.2698],
  ['San Carlos in San Mateo County', 37.5065, -122.2605],
  ['San Rafael in Marin County', 37.9735, -122.5311],
])('accepts %s inside Bay Area Core bounds and assigns Pacific time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('san-francisco');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Los_Angeles');
});

it.each([
  ['Richmond in Contra Costa County', 37.9358, -122.3477],
  ['Concord in Contra Costa County', 37.9780, -122.0311],
  ['Sacramento in Sacramento County', 38.5816, -121.4944],
  ['San Jose south in Santa Clara County', 37.3382, -121.8863],
  ['Santa Cruz on Central Coast', 36.9741, -122.0308],
  ['Reno in Nevada', 39.5296, -119.8138],
  ['Fresno in Central Valley', 36.7468, -119.7726],
])('rejects %s outside Bay Area Core bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local supply in both radius buckets and retains Utah, Chicago, and Miami destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'san-francisco');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'chicago').length).toBeGreaterThanOrEqual(8);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(3);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('san-francisco');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-31' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 3 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('san-francisco');
  }
  expect(result.clock.hour).toBe(11); // 18:00 UTC = 11:00 PDT (Pacific Time)
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('37.8,-122.4');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 65, windMph: 35 },
  });
  expect(storm.nearby.map((row) => row.spot.id).sort()).toEqual(calm.nearby.map((row) => row.spot.id).sort());
  expect(storm.nearby.some((row) => row.spot.indoorBoost === true)).toBe(true);
  expect(storm.nearby.some((row) => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) {
    expect(row.line).not.toMatch(/open|clear|sky is fine/i);
  }
});

it('keeps San Francisco and California strictly isolated from Chicago and Utah regions', () => {
  const sfPoint = { lat: 37.7793, lng: -122.4161 };
  const chicagoPoint = { lat: 41.8763, lng: -87.6281 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };

  expect(regionForSpot(sfPoint)).toBe('san-francisco');
  expect(regionForSpot(chicagoPoint)).toBe('chicago');
  expect(regionForSpot(miamiPoint)).toBe('miami');

  const sfFeed = buildPlacesFeed({ ...base, origin: sfPoint, radiusMi: 50 });
  const sfRows = [...sfFeed.nearby, ...sfFeed.farther];
  expect(sfRows.length).toBeGreaterThan(0);
  expect(sfRows.every((row) => row.spot.serviceRegion === 'san-francisco')).toBe(true);
});
