import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { KEY_WEST, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 24.5574, lng: -81.7997 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 1, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Key West in Florida without changing the prior city identities', () => {
  expect(cityById('key-west')).toMatchObject({
    state: 'Florida',
    serviceRegion: 'key-west',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(18);
  expect(CITIES.length).toBeGreaterThanOrEqual(19);
  expect(COMING_SOON_CITIES).not.toContain('Key West');
  expect(regionLocalities('key-west')).toEqual(
    expect.arrayContaining(['Key West', 'Marathon', 'Islamorada', 'Key Largo', 'Big Pine Key', 'Stock Island']),
  );
  expect(KEY_WEST.timezone).toBe('America/New_York');
});

it.each([
  ['Key West Old Town', 24.5574, -81.7997],
  ['Stock Island', 24.5683, -81.7412],
  ['Big Pine Key', 24.6625, -81.2778],
  ['Marathon', 24.7208, -81.0435],
  ['Islamorada', 24.9243, -80.6278],
  ['Key Largo', 25.0865, -80.4473],
])('accepts %s inside Monroe County / Florida Keys and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('key-west');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Fort Lauderdale in Broward', 26.1224, -80.1373],
  ['Hollywood in Broward', 26.0112, -80.1495],
  ['Naples in Collier', 26.1420, -81.7948],
])('rejects unlaunched Florida points %s', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it.each([
  ['Downtown Miami in Miami-Dade', 25.7753, -80.1963],
  ['Miami Beach in Miami-Dade', 25.7656, -80.1325],
])('isolates other launched regions like %s from Key West feed', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).not.toBe('key-west');
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby.some(row => row.spot.serviceRegion === 'key-west')).toBe(false);
  expect(result.farther.some(row => row.spot.serviceRegion === 'key-west')).toBe(false);
});

it('has real local supply in both radius buckets and retains Utah, Tallahassee, Jacksonville, and Miami destinations', () => {
  const local = SPOTS.filter(spot => spot.serviceRegion === 'key-west');
  expect(local.length).toBeGreaterThanOrEqual(10);
  expect(new Set(local.map(spot => spot.placeKind)).size).toBeGreaterThanOrEqual(4);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'tallahassee').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'jacksonville').length).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(6);
  expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('key-west');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-15' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 1 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('key-west');
  }
  expect(result.clock.hour).toBe(14); // 18:00 UTC = 14:00 EDT
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('24.6,-81.8');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 80, windMph: 30 },
  });
  expect(storm.nearby.map(row => row.spot.id).sort()).toEqual(calm.nearby.map(row => row.spot.id).sort());
  expect(storm.nearby.some(row => row.spot.indoorBoost === true)).toBe(true);
  expect(storm.nearby.some(row => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) {
    expect(row.line).not.toMatch(/open|clear|sky is fine/i);
  }
});

it('keeps Florida regions strictly isolated from one another', () => {
  const tallahasseePoint = { lat: 30.4383, lng: -84.2807 };
  const jacksonvillePoint = { lat: 30.3298, lng: -81.6589 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };
  const keyWestPoint = { lat: 24.5574, lng: -81.7997 };

  expect(regionForSpot(tallahasseePoint)).toBe('tallahassee');
  expect(regionForSpot(jacksonvillePoint)).toBe('jacksonville');
  expect(regionForSpot(miamiPoint)).toBe('miami');
  expect(regionForSpot(keyWestPoint)).toBe('key-west');

  const keyWestFeed = buildPlacesFeed({ ...base, origin: keyWestPoint, radiusMi: 50 });
  const keyWestRows = [...keyWestFeed.nearby, ...keyWestFeed.farther];
  expect(keyWestRows.length).toBeGreaterThan(0);
  expect(keyWestRows.every(row => row.spot.serviceRegion === 'key-west')).toBe(true);
});
