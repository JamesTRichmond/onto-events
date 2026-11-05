import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { TOKYO, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const origin = { lat: 35.6528, lng: 139.7289 }; // Tokyo Metropolitan Central Library in Arisugawa Park
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = { origin, weather, now: new Date('2026-10-31T06:00:00Z'), radiusMi: 3, sort: 'nearest' as const, mode: 'everyone' as const, placeKind: 'all' as const };

it('launches Tokyo in Japan without changing prior city identities', () => {
  expect(cityById('tokyo')).toMatchObject({
    state: 'Tokyo',
    serviceRegion: 'tokyo',
    timeZone: 'Asia/Tokyo',
    availability: 'available',
    anchor: {
      lat: 35.6528,
      lng: 139.7289,
      name: 'Tokyo Metropolitan Central Library (東京都立中央図書館)',
      approximate: true,
    },
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(20);
  expect(COMING_SOON_CITIES).not.toContain('Tokyo');
  expect(regionLocalities('tokyo')).toEqual(
    expect.arrayContaining([
      'Tokyo',
      'Shinjuku',
      'Shibuya',
      'Chiyoda',
      'Minato',
      'Taito',
      'Ginza',
      'Asakusa',
      'Ueno',
      'Musashino',
      'Yokohama',
      'Kamakura',
      'Saitama',
      'Chiba',
    ]),
  );
  expect(TOKYO.timezone).toBe('Asia/Tokyo');
  expect(TOKYO.countryCode).toBe('JP');
});

it.each([
  ['Tokyo Central Library (Arisugawa Park)', 35.6528, 139.7289],
  ['Asakusa & Senso-ji in Taito', 35.7148, 139.7967],
  ['Shinjuku Gyoen National Garden', 35.6852, 139.7101],
  ['Meiji Jingu & Yoyogi in Shibuya', 35.6764, 139.6993],
  ['Roppongi & Mori Art Museum in Minato', 35.6605, 139.7292],
  ['Musashino & Inokashira Park', 35.7001, 139.5761],
  ['Hachioji in Western Tama', 35.6558, 139.3239],
  ['Minato Mirai in Yokohama', 35.4578, 139.6312],
  ['Tsurugaoka Hachimangu in Kamakura', 35.3262, 139.5564],
  ['Urawa in Saitama City', 35.8592, 139.6588],
  ['Chiba City Center', 35.6074, 140.1215],
])('accepts %s inside Greater Tokyo bounds and assigns Japan Standard Time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('tokyo');
  expect(timeZoneForSpot({ lat, lng })).toBe('Asia/Tokyo');
});

it.each([
  ['Kyoto Historic Sanctuary', 35.0116, 135.7681],
  ['Osaka Dotonbori', 34.6937, 135.5023],
  ['Nagoya Central', 35.1815, 136.9066],
  ['Sapporo in Hokkaido', 43.0618, 141.3545],
  ['Fukuoka in Kyushu', 33.5904, 130.4017],
  ['Salt Lake City, Utah', 40.7608, -111.8910],
  ['Chicago Loop, Illinois', 41.8763, -87.6281],
])('rejects %s outside Greater Tokyo bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).not.toBe('tokyo');
  if (lat > 30 && lng > 130 && lng < 145) {
    // Other cities in Japan not yet launched return null
    expect(regionForSpot({ lat, lng })).toBeNull();
  }
});

it('has real local supply across 5 kinds and retains accepted US destinations', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'tokyo');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(5);

  const kinds = new Set(local.map((s) => s.placeKind));
  expect(kinds.has('hang')).toBe(true);
  expect(kinds.has('trail')).toBe(true);
  expect(kinds.has('indoor')).toBe(true);
  expect(kinds.has('view')).toBe(true);
  expect(kinds.has('water')).toBe(true);

  // Balanced family vs general
  const familyCount = local.filter((s) => s.rating === 'family').length;
  const generalCount = local.filter((s) => s.rating === 'general').length;
  expect(familyCount).toBeGreaterThanOrEqual(3);
  expect(generalCount).toBeGreaterThanOrEqual(3);

  // Retains existing cities
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'chicago').length).toBeGreaterThanOrEqual(8);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'austin').length).toBeGreaterThanOrEqual(8);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('tokyo');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-31' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 15 });
  expect(result.nearby.length).toBeGreaterThan(0);
  for (const row of result.nearby) {
    expect(row.spot.serviceRegion).toBe('tokyo');
  }

  // 06:00 UTC = 15:00 JST (UTC+9)
  expect(result.clock.hour).toBe(15);
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('35.7,139.7');
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 25 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 25,
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

it('keeps Tokyo strictly isolated from North American service regions', () => {
  const tokyoPoint = { lat: 35.6528, lng: 139.7289 };
  const chicagoPoint = { lat: 41.8763, lng: -87.6281 };
  const slcPoint = { lat: 40.7608, lng: -111.8910 };

  expect(regionForSpot(tokyoPoint)).toBe('tokyo');
  expect(regionForSpot(chicagoPoint)).toBe('chicago');
  expect(regionForSpot(slcPoint)).toBe('utah');

  expect(regionForSpot(tokyoPoint)).not.toBe('chicago');
  expect(regionForSpot(tokyoPoint)).not.toBe('utah');
});
