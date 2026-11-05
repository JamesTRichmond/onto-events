import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { MONTREAL, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 45.5154, lng: -73.5623 }; // Grande Bibliothèque (BAnQ)
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-11-01T17:00:00Z'), radiusMi: 2, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Montreal in Quebec without changing prior city identities', () => {
  expect(cityById('montreal')).toMatchObject({
    state: 'Quebec',
    serviceRegion: 'montreal',
    timeZone: 'America/Toronto',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(20);
  expect(COMING_SOON_CITIES).not.toContain('Montreal');
  expect(regionLocalities('montreal')).toEqual(
    expect.arrayContaining(['Montreal', 'Laval', 'Longueuil', 'Westmount', 'Brossard', 'Terrebonne']),
  );
  expect(MONTREAL.timezone).toBe('America/Toronto');
});

it.each([
  ['Downtown Montreal Core', 45.5017, -73.5673],
  ['Old Montreal Port', 45.5045, -73.5560],
  ['Mile End & Plateau', 45.5226, -73.5908],
  ['Laval across Rivière des Prairies', 45.5604, -73.7225],
  ['Longueuil across Saint-Laurent', 45.5348, -73.4988],
  ['Brossard South Shore', 45.4431, -73.4389],
])('accepts %s inside Greater Montreal bounds and assigns Toronto/Montreal civil time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('montreal');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Toronto');
});

it.each([
  ['Quebec City capital', 46.8139, -71.2080],
  ['Ottawa National Capital', 45.4215, -75.6972],
  ['Burlington across the US border', 44.4759, -73.2121],
  ['Plattsburgh NY', 44.6995, -73.4529],
  ['Trois-Rivières', 46.3432, -72.5432],
])('rejects %s outside Greater Montreal envelope', (_name, lat, lng) => {
  const region = regionForSpot({ lat, lng });
  expect(region === null || region !== 'montreal').toBe(true);
});

it('has real local supply across at least 5 kinds and retains Utah, NYC, and Florida destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'montreal');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'tallahassee').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'jacksonville').length).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(3);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('montreal');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-31' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 2 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('montreal');
  }
  expect(result.clock.hour).toBe(12); // 17:00 UTC = 12:00 EST (DST ended Nov 1, 2026)
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('45.5,-73.6');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 50, windMph: 30 },
  });
  expect(storm.nearby.map((row) => row.spot.id).sort()).toEqual(calm.nearby.map((row) => row.spot.id).sort());
  expect(storm.nearby.some((row) => row.spot.indoorBoost === true)).toBe(true);
  expect(storm.nearby.some((row) => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) {
    expect(row.line).not.toMatch(/open|clear|sky is fine/i);
  }
});

it('keeps Montreal strictly isolated from other regions', () => {
  const montrealPoint = { lat: 45.5154, lng: -73.5623 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };
  const tallahasseePoint = { lat: 30.4383, lng: -84.2807 };
  const slcPoint = { lat: 40.7608, lng: -111.8910 };

  expect(regionForSpot(montrealPoint)).toBe('montreal');
  expect(regionForSpot(miamiPoint)).toBe('miami');
  expect(regionForSpot(tallahasseePoint)).toBe('tallahassee');
  expect(regionForSpot(slcPoint)).toBe('utah');

  const montrealFeed = buildPlacesFeed({ ...base, origin: montrealPoint, radiusMi: 50 });
  for (const row of [...montrealFeed.nearby, ...montrealFeed.farther]) {
    expect(row.spot.serviceRegion).toBe('montreal');
  }
});
