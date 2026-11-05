import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { MIAMI, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 25.7753, lng: -80.1963 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 1, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Miami in Florida without changing the prior city identities', () => {
  expect(cityById('miami')).toMatchObject({
    state: 'Florida',
    serviceRegion: 'miami',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(18);
  expect(CITIES.length).toBeGreaterThanOrEqual(19);
  expect(COMING_SOON_CITIES).not.toContain('Miami');
  expect(regionLocalities('miami')).toEqual(
    expect.arrayContaining(['Miami', 'Miami Beach', 'Coral Gables', 'Doral', 'Aventura', 'Key Biscayne']),
  );
  expect(MIAMI.timezone).toBe('America/New_York');
});

it.each([
  ['Downtown Miami', 25.7753, -80.1963],
  ['Miami Beach', 25.7656, -80.1325],
  ['Coral Gables', 25.6792, -80.2742],
  ['Doral', 25.8195, -80.3553],
  ['Aventura', 25.9565, -80.1392],
  ['Key Biscayne', 25.6938, -80.1628],
])('accepts %s inside Miami-Dade County and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('miami');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Fort Lauderdale in Broward', 26.1224, -80.1373],
  ['Hollywood in Broward', 26.0112, -80.1495],
  ['Boca Raton in Palm Beach', 26.3683, -80.1289],
  ['West Palm Beach in Palm Beach', 26.7153, -80.0534],
])('rejects %s outside Miami-Dade County bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local supply in both radius buckets and retains Utah, Tallahassee, and Jacksonville destinations', () => {
  const local = SPOTS.filter(spot => spot.serviceRegion === 'miami');
  expect(local.length).toBeGreaterThanOrEqual(3);
  expect(new Set(local.map(spot => spot.placeKind)).size).toBeGreaterThanOrEqual(2);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'tallahassee').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'jacksonville').length).toBeGreaterThanOrEqual(5);
  expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('miami');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-15' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 3 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('miami');
  }
  expect(result.clock.hour).toBe(14); // 18:00 UTC = 14:00 EDT
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('25.8,-80.2');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 75, windMph: 25 },
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

  expect(regionForSpot(tallahasseePoint)).toBe('tallahassee');
  expect(regionForSpot(jacksonvillePoint)).toBe('jacksonville');
  expect(regionForSpot(miamiPoint)).toBe('miami');

  const miamiFeed = buildPlacesFeed({ ...base, origin: miamiPoint, radiusMi: 50 });
  const miamiRows = [...miamiFeed.nearby, ...miamiFeed.farther];
  expect(miamiRows.length).toBeGreaterThan(0);
  expect(miamiRows.every(row => row.spot.serviceRegion === 'miami')).toBe(true);
});
