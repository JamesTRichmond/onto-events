import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { MIDDLEBURY_SPOTS } from '@/data/places/middlebury';
import { SPOTS } from '@/data/spots';
import { VERMONT, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const middleburyAnchor = { lat: 44.005319487507, lng: -73.173741481911 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = {
  origin: middleburyAnchor,
  weather,
  now: new Date('2026-10-31T18:00:00Z'),
  radiusMi: 15,
  sort: 'nearest' as const,
  mode: 'everyone' as const,
  placeKind: 'all' as const,
};

it('verifies Middlebury city registry anchor, timezone, and service region', () => {
  const middlebury = cityById('middlebury');
  expect(middlebury).toMatchObject({
    id: 'middlebury',
    name: 'Middlebury',
    state: 'Vermont',
    serviceRegion: 'vermont-corridor',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(middlebury?.anchor).toMatchObject({
    lat: expect.closeTo(44.0053, 3),
    lng: expect.closeTo(-73.1737, 3),
    name: 'Mahaney Arts Center',
    approximate: true,
  });
  expect(COMING_SOON_CITIES).not.toContain('Middlebury');
  expect(CITIES.some(c => c.id === 'middlebury')).toBe(true);
});

it('verifies vermont-corridor containment and Addison County localities', () => {
  expect(VERMONT).toBeDefined();
  expect(VERMONT.timezone).toBe('America/New_York');
  const localities = regionLocalities('vermont-corridor');
  expect(localities).toEqual(
    expect.arrayContaining([
      'Middlebury',
      'Bristol',
      'Vergennes',
      'Brandon',
      'Salisbury',
      'Cornwall',
      'Weybridge',
      'Ripton',
      'Ferrisburgh',
      'Shoreham',
      'Bridport',
      'Lincoln',
      'Monkton',
      'New Haven',
      'Orwell',
    ]),
  );
});

it.each([
  ['Mahaney Arts Center', 44.0053, -73.1737],
  ['Otter Creek Falls', 44.0135, -73.1698],
  ['Ilsley Public Library', 44.0125, -73.1695],
  ['Henry Sheldon Museum', 44.0132, -73.1685],
  ['Chipman Hill', 44.0245, -73.1622],
  ['Robert Frost Trail (Ripton)', 43.9482, -73.0035],
  ['Lake Dunmore (Salisbury)', 43.9025, -73.0858],
  ['Vergennes Opera House', 44.1671, -73.2539],
  ['Bristol Town Green', 44.1335, -73.0789],
])('routes %s inside vermont-corridor and assigns America/New_York time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('vermont-corridor');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it('maps Middlebury civic anchor to NWS BTV cell 55, 42 (44.0, -73.2)', () => {
  const cell = weatherCell(middleburyAnchor.lat, middleburyAnchor.lng);
  expect(cell).toEqual({ lat: 44.0, lng: -73.2, key: '44.0,-73.2' });
});

it('enrolls 8 curated Middlebury places across 5 kinds with balanced ratings', () => {
  expect(MIDDLEBURY_SPOTS).toHaveLength(8);
  const kinds = new Set(MIDDLEBURY_SPOTS.map(spot => spot.placeKind));
  expect(kinds.size).toBeGreaterThanOrEqual(5);
  expect(kinds).toContain('indoor');
  expect(kinds).toContain('water');
  expect(kinds).toContain('trail');
  expect(kinds).toContain('hang');
  expect(kinds).toContain('view');

  const family = MIDDLEBURY_SPOTS.filter(s => s.rating === 'family');
  const general = MIDDLEBURY_SPOTS.filter(s => s.rating === 'general');
  expect(family.length).toBe(4);
  expect(general.length).toBe(4);

  for (const spot of MIDDLEBURY_SPOTS) {
    expect(spot.serviceRegion).toBe('vermont-corridor');
    expect(spot.lat).toBeGreaterThanOrEqual(43.85);
    expect(spot.lat).toBeLessThanOrEqual(44.25);
    expect(spot.lng).toBeGreaterThanOrEqual(-73.45);
    expect(spot.lng).toBeLessThanOrEqual(-72.90);
    expect(spot.approximate).toBe(true);
    expect(spot.sourceName).toBeTruthy();
    expect(spot.sourceUrl).toMatch(/^https:\/\//);
    expect(SPOTS.some(s => s.id === spot.id)).toBe(true);
  }
});

it('builds places feed around Middlebury origin', () => {
  const feed = buildPlacesFeed({
    ...base,
    spots: MIDDLEBURY_SPOTS,
  });
  expect(feed.nearby.length).toBe(8);
  expect(feed.nearby.some(row => row.spot.title.includes('Mahaney Arts Center'))).toBe(true);
  expect(feed.nearby.some(row => row.spot.title.includes('Otter Creek Falls'))).toBe(true);
});
