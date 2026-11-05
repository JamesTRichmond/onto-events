import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { TAMPA_BAY, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 27.9510, lng: -82.4632 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-15T18:00:00Z'), radiusMi: 1, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Tampa Bay in Florida without changing the prior city identities', () => {
  expect(cityById('tampa-bay')).toMatchObject({
    state: 'Florida',
    serviceRegion: 'tampa-bay',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(18);
  expect(CITIES.length).toBeGreaterThanOrEqual(19);
  expect(COMING_SOON_CITIES).not.toContain('Tampa Bay');
  expect(regionLocalities('tampa-bay')).toEqual(
    expect.arrayContaining(['Tampa', 'St. Petersburg', 'Clearwater', 'Temple Terrace', 'Plant City', 'Brandon', 'Bradenton', 'Lakeland', 'New Port Richey']),
  );
  expect(TAMPA_BAY.timezone).toBe('America/New_York');
});

it.each([
  ['Downtown Tampa', 27.9510, -82.4632],
  ['Ybor City', 27.9602, -82.4385],
  ['Temple Terrace', 28.0353, -82.3893],
  ['Plant City', 28.0170, -82.1165],
  ['St. Petersburg', 27.7676, -82.6403],
  ['Clearwater', 27.9659, -82.8001],
  ['Bradenton in Manatee', 27.4989, -82.5748],
  ['Lakeland in Polk', 28.0395, -81.9498],
  ['New Port Richey in Pasco', 28.2442, -82.7193],
])('accepts %s inside Tampa Bay bounds and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('tampa-bay');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Sarasota in Sarasota', 27.3364, -82.5307],
  ['Venice in Sarasota', 27.0998, -82.4543],
  ['Brooksville in Hernando', 28.5553, -82.3879],
  ['Orlando in Orange', 28.5383, -81.3792],
])('rejects %s outside Tampa Bay bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).not.toBe('tampa-bay');
  if (!['Orlando in Orange'].includes(_name)) {
    expect(timeZoneForSpot({ lat, lng })).toBeNull();
    const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
    expect(result.nearby).toEqual([]);
    expect(result.farther).toEqual([]);
  }
});

it('has real local supply in both radius buckets and retains Utah, Tallahassee, Jacksonville, and Miami destinations', () => {
  const local = SPOTS.filter(spot => spot.serviceRegion === 'tampa-bay');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map(spot => spot.placeKind)).size).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'tallahassee').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'jacksonville').length).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter(spot => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(6);
  expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('tampa-bay');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-15' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 3 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('tampa-bay');
  }
  expect(result.clock.hour).toBe(14); // 18:00 UTC = 14:00 EDT
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('28.0,-82.5');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 78, windMph: 24 },
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
  const tampaPoint = { lat: 27.9510, lng: -82.4632 };

  expect(regionForSpot(tallahasseePoint)).toBe('tallahassee');
  expect(regionForSpot(jacksonvillePoint)).toBe('jacksonville');
  expect(regionForSpot(miamiPoint)).toBe('miami');
  expect(regionForSpot(tampaPoint)).toBe('tampa-bay');

  const tampaFeed = buildPlacesFeed({ ...base, origin: tampaPoint, radiusMi: 50 });
  const tampaRows = [...tampaFeed.nearby, ...tampaFeed.farther];
  expect(tampaRows.length).toBeGreaterThan(0);
  expect(tampaRows.every(row => row.spot.serviceRegion === 'tampa-bay')).toBe(true);
});
