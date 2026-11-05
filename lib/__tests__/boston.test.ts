import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { BOSTON, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 42.3493, lng: -71.0784 }; // BPL Central Library in Copley Square
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 2, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Boston in Massachusetts without changing the prior city identities', () => {
  expect(cityById('boston')).toMatchObject({
    state: 'Massachusetts',
    serviceRegion: 'boston',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(20);
  expect(COMING_SOON_CITIES).not.toContain('Boston');
  expect(regionLocalities('boston')).toEqual(
    expect.arrayContaining(['Boston', 'Cambridge', 'Somerville', 'Brookline', 'Newton', 'Quincy', 'Salem', 'Concord']),
  );
  expect(BOSTON.timezone).toBe('America/New_York');
});

it.each([
  ['Copley Square Back Bay', 42.3493, -71.0784],
  ['Harvard Square Cambridge', 42.3736, -71.1202],
  ['Davis Square Somerville', 42.3967, -71.1226],
  ['Coolidge Corner Brookline', 42.3421, -71.1219],
  ['Newton Centre', 42.3361, -71.2062],
  ['Quincy Adams Historic', 42.2514, -71.0028],
  ['Historic Salem Maritime', 42.5218, -70.8924],
  ['Walden Pond Concord', 42.4440, -71.3411],
  ['Gloucester Harbor Cape Ann', 42.6159, -70.6620],
  ['Newburyport Waterfront', 42.8123, -70.8773],
  ['Haverhill Downtown', 42.7762, -71.0773],
])('accepts %s inside Greater Boston envelope and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('boston');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Nashua New Hampshire', 42.7654, -71.4676],
  ['Providence Rhode Island', 41.8240, -71.4128],
  ['Worcester Central Mass', 42.2626, -71.8023],
  ['Springfield Western Mass', 42.1015, -72.5898],
  ['Portsmouth New Hampshire', 43.0718, -70.7626],
])('rejects %s outside Greater Boston bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local supply meeting diversity thresholds and retains other state destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'boston');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(4);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'chicago').length).toBeGreaterThanOrEqual(8);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(3);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('boston');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-31' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 2 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('boston');
  }
  expect(result.clock.hour).toBe(14); // 18:00 UTC = 14:00 EDT (Eastern Time)
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('42.3,-71.1');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 62, windMph: 28 },
  });
  expect(storm.nearby.map((row) => row.spot.id).sort()).toEqual(calm.nearby.map((row) => row.spot.id).sort());
  expect(storm.nearby.some((row) => row.spot.indoorBoost === true)).toBe(true);
  expect(storm.nearby.some((row) => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) {
    expect(row.line).not.toMatch(/open|clear|sky is fine/i);
  }
});

it('keeps Boston strictly isolated from New York and Florida regions', () => {
  const bostonPoint = { lat: 42.3493, lng: -71.0784 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };
  const nycPoint = { lat: 40.7531, lng: -73.9819 };

  expect(regionForSpot(bostonPoint)).toBe('boston');
  expect(regionForSpot(miamiPoint)).toBe('miami');
  expect(regionForSpot(nycPoint)).toBe('nyc');

  const bostonFeed = buildPlacesFeed({ ...base, origin: bostonPoint, radiusMi: 50 });
  const bostonRows = [...bostonFeed.nearby, ...bostonFeed.farther];
  expect(bostonRows.length).toBeGreaterThan(0);
  expect(bostonRows.every((row) => row.spot.serviceRegion === 'boston')).toBe(true);
});
