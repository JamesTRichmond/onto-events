import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { AUSTIN, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 30.2659, lng: -97.7516 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = {
  origin,
  weather,
  now: new Date('2026-10-18T18:00:00Z'),
  radiusMi: 1,
  sort: 'nearest' as const,
  mode: 'everyone' as const,
  placeKind: 'all' as const,
};

it('launches Austin in Texas without changing prior city identities', () => {
  expect(cityById('austin')).toMatchObject({
    state: 'Texas',
    serviceRegion: 'austin',
    timeZone: 'America/Chicago',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(19);
  expect(COMING_SOON_CITIES).not.toContain('Austin');
  expect(regionLocalities('austin')).toEqual(
    expect.arrayContaining(['Austin', 'Pflugerville', 'Manor', 'Bee Cave', 'Lakeway', 'West Lake Hills', 'Rollingwood', 'Sunset Valley']),
  );
  expect(AUSTIN.timezone).toBe('America/Chicago');
});

it.each([
  ['Austin Central Library (Downtown)', 30.2659, -97.7516],
  ['Pflugerville', 30.4548, -97.6223],
  ['Manor', 30.3405, -97.5567],
  ['Bee Cave', 30.3060, -97.9542],
  ['Lakeway', 30.3644, -97.9797],
  ['West Lake Hills', 30.2927, -97.8078],
  ['Creedmoor', 30.0894, -97.7447],
  ['Lago Vista', 30.4602, -97.9883],
  ['Jonestown', 30.4955, -97.9233],
  ['Round Rock in Williamson County', 30.5083, -97.6789],
  ['Georgetown in Williamson County', 30.6328, -97.6772],
  ['San Marcos in Hays County', 29.8833, -97.9414],
  ['Buda in Hays County', 30.0827, -97.8439],
  ['Bastrop in Bastrop County', 30.1105, -97.3153],
  ['Cedar Park in Williamson County', 30.5052, -97.8203],
  ['Dripping Springs in Hays County', 30.1902, -98.0867],
  ['Elgin in Bastrop County', 30.3497, -97.3703],
  ['Lockhart in Caldwell County', 29.8849, -97.6700],
])('accepts %s inside Austin and Hill Country metro and assigns Central time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('austin');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Chicago');
});

it.each([
  ['San Antonio in Bexar County', 29.4241, -98.4936],
  ['Temple in Bell County', 31.0982, -97.3428],
  ['Waco in McLennan County', 31.5493, -97.1467],
  ['Houston', 29.7604, -95.3698],
  ['Dallas', 32.7767, -96.7970],
])('rejects %s outside Austin and Hill Country regional bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('uses the expanded 5-county regional bounds containing the entire Hill Country corridor', () => {
  expect(AUSTIN.bounds).toEqual({
    latMin: 29.65,
    latMax: 30.85,
    lngMin: -98.45,
    lngMax: -97.10,
  });
  expect(regionLocalities('austin')).toEqual(
    expect.arrayContaining([
      'Austin',
      'Round Rock',
      'Georgetown',
      'San Marcos',
      'Buda',
      'Kyle',
      'Dripping Springs',
      'Wimberley',
      'Bastrop',
      'Elgin',
      'Lockhart',
      'Luling',
    ]),
  );
});

it('has real local supply in both radius buckets and retains prior destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'austin');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(4);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah').length).toBeGreaterThanOrEqual(39);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'miami').length).toBeGreaterThanOrEqual(3);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'tampa-bay').length).toBeGreaterThanOrEqual(4);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('austin');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-18' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 5 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('austin');
  }
  expect(result.clock.hour).toBe(13); // 18:00 UTC = 13:00 CDT
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('30.3,-97.8');
});

it('keeps local outdoor places in stormy weather and applies indoor boost', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 75, windMph: 25 },
  });
  expect(storm.nearby.map((row) => row.spot.id).sort()).toEqual(calm.nearby.map((row) => row.spot.id).sort());
  expect(storm.nearby.some((row) => row.spot.indoorBoost === true)).toBe(true);
  expect(storm.nearby.some((row) => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
});

it('keeps Austin isolated from other regions', () => {
  const austinPoint = { lat: 30.2659, lng: -97.7516 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };
  const tampaPoint = { lat: 27.9510, lng: -82.4632 };
  const tallahasseePoint = { lat: 30.4383, lng: -84.2807 };

  expect(regionForSpot(austinPoint)).toBe('austin');
  expect(regionForSpot(miamiPoint)).toBe('miami');
  expect(regionForSpot(tampaPoint)).toBe('tampa-bay');
  expect(regionForSpot(tallahasseePoint)).toBe('tallahassee');
});

it('keeps the Mount Bonnell destination tied to Covert Park rather than Mount Barker', () => {
  expect(SPOTS.find((spot) => spot.id === 'spot-austin-mount-bonnell')).toMatchObject({
    venue: 'Mount Bonnell at Covert Park',
    address: '3800 Mount Bonnell Rd, Austin, TX 78731',
  });
});
