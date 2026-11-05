import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { CHICAGO, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 41.8763, lng: -87.6281 }; // Harold Washington Library Center
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 1, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Chicago in Illinois without changing the prior city identities', () => {
  expect(cityById('chicago')).toMatchObject({
    state: 'Illinois',
    serviceRegion: 'chicago',
    timeZone: 'America/Chicago',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(19);
  expect(COMING_SOON_CITIES).not.toContain('Chicago');
  expect(regionLocalities('chicago')).toEqual(
    expect.arrayContaining(['Chicago', 'Evanston', 'Oak Park', 'Naperville', 'Waukegan', 'Joliet', 'Aurora', 'Northalsted']),
  );
  expect(CHICAGO.timezone).toBe('America/Chicago');
});

it.each([
  ['Downtown Chicago Loop', 41.8763, -87.6281],
  ['Northalsted / Boystown', 41.9482, -87.6495],
  ['Evanston in Cook County', 42.0451, -87.6877],
  ['Naperville in DuPage County', 41.7508, -88.1535],
  ['Waukegan in Lake County', 42.3636, -87.8448],
  ['Joliet in Will County', 41.5250, -88.0817],
  ['Aurora in Kane County', 41.7606, -88.3201],
])('accepts %s inside Greater Chicagoland 5-county bounds and assigns Central time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('chicago');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Chicago');
});

it.each([
  ['Kenosha in Wisconsin', 42.5847, -87.8212],
  ['Kankakee in Kankakee County', 41.1200, -87.8611],
  ['Rockford in Winnebago County', 42.2711, -89.0940],
  ['DeKalb in DeKalb County', 41.9295, -88.7504],
  ['Gary in Lake County Indiana', 41.5934, -87.3464],
])('rejects %s outside Greater Chicagoland 5-county bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local supply in both radius buckets and retains Utah, Tallahassee, Jacksonville, and Miami destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'chicago');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(4);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'tallahassee').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'jacksonville').length).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(3);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('chicago');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-31' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 3 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('chicago');
  }
  expect(result.clock.hour).toBe(13); // 18:00 UTC = 13:00 CDT (Central Time)
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('41.9,-87.6');
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

it('keeps Chicago and Illinois strictly isolated from Florida and Utah regions', () => {
  const chicagoPoint = { lat: 41.8763, lng: -87.6281 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };
  const tallahasseePoint = { lat: 30.4383, lng: -84.2807 };
  const jacksonvillePoint = { lat: 30.3298, lng: -81.6589 };

  expect(regionForSpot(chicagoPoint)).toBe('chicago');
  expect(regionForSpot(miamiPoint)).toBe('miami');
  expect(regionForSpot(tallahasseePoint)).toBe('tallahassee');
  expect(regionForSpot(jacksonvillePoint)).toBe('jacksonville');

  const chicagoFeed = buildPlacesFeed({ ...base, origin: chicagoPoint, radiusMi: 50 });
  const chicagoRows = [...chicagoFeed.nearby, ...chicagoFeed.farther];
  expect(chicagoRows.length).toBeGreaterThan(0);
  expect(chicagoRows.every((row) => row.spot.serviceRegion === 'chicago')).toBe(true);
});
