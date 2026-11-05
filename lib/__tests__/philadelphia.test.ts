import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { PHILADELPHIA, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';
import { LOCAL_ACTIVITIES as PHILADELPHIA_ACTIVITIES } from '@/data/philadelphia-events';

const origin = { lat: 39.9598, lng: -75.1710 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = {
  origin,
  weather,
  now: new Date('2026-10-18T18:00:00Z'),
  radiusMi: 5,
  sort: 'nearest' as const,
  mode: 'everyone' as const,
  placeKind: 'all' as const,
};

it('launches Philadelphia in Pennsylvania without changing prior city identities', () => {
  expect(cityById('philadelphia')).toMatchObject({
    state: 'Pennsylvania',
    serviceRegion: 'philadelphia',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(18);
  expect(COMING_SOON_CITIES).not.toContain('Philadelphia');
  expect(regionLocalities('philadelphia')).toEqual(
    expect.arrayContaining([
      'Philadelphia',
      'Center City',
      'University City',
      'Fishtown',
      'Old City',
      'South Philadelphia',
      'Chestnut Hill',
      'Manayunk',
      'Roxborough',
      'Germantown',
    ]),
  );
  expect(PHILADELPHIA).toBeDefined();
  expect(PHILADELPHIA.timezone).toBe('America/New_York');
});

it.each([
  ['Center City Philadelphia', 39.9526, -75.1652],
  ['University City', 39.9538, -75.1930],
  ['Old City', 39.9496, -75.1448],
  ['Fishtown', 39.9723, -75.1311],
  ['Chestnut Hill', 40.0784, -75.2078],
  ['Manayunk', 40.0264, -75.2255],
  ['South Philadelphia', 39.9242, -75.1685],
  ['Northeast Philadelphia', 40.0436, -75.0592],
  ['Media in Delaware County', 39.9168, -75.3879],
  ['King of Prussia in Montgomery County', 40.0899, -75.3963],
  ['Chester in Delaware County', 39.8496, -75.3557],
  ['Doylestown in Bucks County', 40.3101, -75.1299],
  ['Camden Waterfront in Camden County NJ', 39.9431, -75.1278],
])('accepts %s inside Greater Delaware Valley and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('philadelphia');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Wilmington in New Castle County DE', 39.7447, -75.5484],
  ['Trenton in Mercer County NJ', 40.2171, -74.7429],
  ['Allentown in Lehigh County PA', 40.6023, -75.4714],
  ['Reading in Berks County PA', 40.3356, -75.9269],
  ['Atlantic City in Atlantic County NJ', 39.3643, -74.4229],
])('rejects %s outside Philadelphia bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local evergreen supply in both radius buckets and retains all prior destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'philadelphia');
  expect(local.length).toBeGreaterThanOrEqual(6);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(3);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('philadelphia');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-18' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed(base);
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('philadelphia');
  }
  expect(result.clock.hour).toBe(14); // 18:00 UTC = 14:00 EDT
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('40.0,-75.2');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 70, windMph: 30 },
  });
  expect(storm.nearby.map((row) => row.spot.id).sort()).toEqual(calm.nearby.map((row) => row.spot.id).sort());
  expect(storm.nearby[0].spot.indoorBoost).toBe(true);
  expect(storm.nearby.some((row) => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) expect(row.line).not.toMatch(/open|clear|sky is fine/i);
});

it('contains balanced family and general ratings in the Philadelphia offline bundle', () => {
  const ratings = new Set(PHILADELPHIA_ACTIVITIES.map((activity) => activity.rating));
  expect(ratings.has('family')).toBe(true);
  expect(ratings.has('general')).toBe(true);
});
