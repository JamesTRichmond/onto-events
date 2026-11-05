import { BUNDLED_ACTIVITIES } from '@/data/bundled-activities';
import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { ATLANTA, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';
import { LOCAL_ACTIVITIES as ATLANTA_ACTIVITIES } from '@/data/atlanta-events';

const origin = { lat: 33.7573, lng: -84.3892 }; // Atlanta Central Library (Marcel Breuer)
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = {
  origin,
  weather,
  now: new Date('2026-10-31T18:00:00Z'),
  radiusMi: 3,
  sort: 'nearest' as const,
  mode: 'everyone' as const,
  placeKind: 'all' as const,
};

it('launches Atlanta in Georgia without changing prior city identities', () => {
  expect(cityById('atlanta')).toMatchObject({
    state: 'Georgia',
    serviceRegion: 'atlanta',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(19);
  expect(COMING_SOON_CITIES).not.toContain('Atlanta');
  expect(regionLocalities('atlanta')).toEqual(
    expect.arrayContaining([
      'Atlanta',
      'Decatur',
      'Marietta',
      'Lawrenceville',
      'Jonesboro',
      'Sandy Springs',
      'Roswell',
      'Alpharetta',
      'East Point',
      'Smyrna',
      'Duluth',
      'Norcross',
    ]),
  );
  expect(ATLANTA.timezone).toBe('America/New_York');
});

it.each([
  ['Atlanta Central Library (Downtown)', 33.7573, -84.3892],
  ['Decatur in DeKalb County', 33.7748, -84.2963],
  ['Marietta in Cobb County', 33.9526, -84.5499],
  ['Lawrenceville in Gwinnett County', 33.9564, -83.9882],
  ['Jonesboro in Clayton County', 33.5218, -84.3541],
  ['Sandy Springs in North Fulton', 33.9304, -84.3733],
  ['Roswell in Fulton County', 34.0232, -84.3616],
  ['Smyrna in Cobb County', 33.8839, -84.5144],
  ['Dacula near the eastern edge of Gwinnett County', 33.9887, -83.8979],
  ['Duluth in Gwinnett County', 34.0029, -84.1446],
  ['East Point in South Fulton', 33.6795, -84.4394],
])('accepts %s inside Atlanta 5-county bounds and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('atlanta');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Athens in Clarke County', 33.9519, -83.3576],
  ['Macon in Bibb County', 32.8407, -83.6324],
  ['Rome in Floyd County', 34.2570, -85.1647],
  ['Gainesville in Hall County', 34.2979, -83.8241],
  ['Griffin in Spalding County', 33.2468, -84.2641],
  ['Conyers in Rockdale County inside the envelope', 33.6676, -84.0177],
  ['McDonough in Henry County inside the envelope', 33.4473, -84.1469],
  ['Douglasville in Douglas County inside the envelope', 33.7515, -84.7477],
  ['Chattanooga in Tennessee', 35.0456, -85.3097],
])('rejects %s outside Atlanta 5-county bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local supply in both radius buckets and retains prior destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'atlanta');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'tallahassee').length).toBeGreaterThanOrEqual(6);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'jacksonville').length).toBeGreaterThanOrEqual(5);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('atlanta');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-11-01' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 3 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('atlanta');
  }
  expect(result.clock.hour).toBe(14); // 18:00 UTC = 14:00 EDT (Eastern Daylight Time)
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('33.8,-84.4');
});

it('keeps indoor spots during stormy weather and boosts indoor recommendations', () => {
  const stormyWeather: PlaceSky = {
    kind: 'thunder',
    temperatureF: 68,
    windMph: 24,
    sunriseAt: Date.parse('2026-10-31T11:45:00Z'),
    sunsetAt: Date.parse('2026-10-31T22:45:00Z'),
  };
  const result = buildPlacesFeed({ ...base, weather: stormyWeather });
  const allRows = [...result.nearby, ...result.farther];
  const indoorRows = allRows.filter((r) => r.spot.placeKind === 'indoor');
  expect(indoorRows.length).toBeGreaterThanOrEqual(2);
  const centralLibrary = allRows.find((r) => r.spot.id === 'spot-atlanta-central-library');
  expect(centralLibrary).toBeDefined();
  expect(centralLibrary?.fit).toBe('now');
});

it('excludes invented Atlanta events from both regional and global offline supply', () => {
  expect(ATLANTA_ACTIVITIES).toEqual([]);
  expect(BUNDLED_ACTIVITIES.length).toBeGreaterThan(0);
  expect(BUNDLED_ACTIVITIES.filter(a => regionForSpot(a) === 'atlanta')).toEqual([]);
});
