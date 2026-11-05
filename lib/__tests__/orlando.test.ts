import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { ORLANDO, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';
import { LOCAL_ACTIVITIES as ORLANDO_ACTIVITIES } from '@/data/orlando-events';

const origin = { lat: 28.5412, lng: -81.3789 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = {
  origin,
  weather,
  now: new Date('2026-10-15T18:00:00Z'),
  radiusMi: 5,
  sort: 'nearest' as const,
  mode: 'everyone' as const,
  placeKind: 'all' as const,
};

it('launches Orlando in Florida without changing prior city identities', () => {
  expect(cityById('orlando')).toMatchObject({
    state: 'Florida',
    serviceRegion: 'orlando',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(16);
  expect(COMING_SOON_CITIES).not.toContain('Orlando');
  expect(regionLocalities('orlando')).toEqual(
    expect.arrayContaining([
      'Orlando',
      'Winter Park',
      'Winter Garden',
      'Apopka',
      'Maitland',
      'Windermere',
      'Eatonville',
    ]),
  );
  expect(ORLANDO).toBeDefined();
  expect(ORLANDO.timezone).toBe('America/New_York');
});

it.each([
  ['Downtown Orlando', 28.5412, -81.3789],
  ['Winter Park', 28.5997, -81.3516],
  ['Winter Garden', 28.5658, -81.5862],
  ['Apopka', 28.6756, -81.4921],
  ['Windermere', 28.4969, -81.5347],
  ['Eatonville', 28.6186, -81.3855],
])('accepts %s inside Orange County and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('orlando');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Kissimmee in Osceola', 28.2911, -81.4089],
  ['Sanford in Seminole', 28.8105, -81.2678],
  ['Clermont in Lake', 28.5494, -81.7728],
  ['Daytona Beach in Volusia', 29.2108, -81.0228],
])('rejects %s outside Orange County', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local evergreen supply in both radius buckets and retains all prior destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'orlando');
  expect(local.length).toBeGreaterThanOrEqual(6);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(3);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('orlando');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-15' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed(base);
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('orlando');
  }
  expect(result.clock.hour).toBe(14); // 18:00 UTC = 14:00 EDT
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('28.5,-81.4');
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

it('contains balanced family and general ratings in the Orlando offline bundle', () => {
  const ratings = new Set(ORLANDO_ACTIVITIES.map((activity) => activity.rating));
  expect(ratings.has('family')).toBe(true);
  expect(ratings.has('general')).toBe(true);
});
