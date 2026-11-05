import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SARATOGA_SPRINGS_SPOTS } from '@/data/places/saratoga-springs';
import { SPOTS } from '@/data/spots';
import { SARATOGA_SPRINGS, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const saratogaAnchor = { lat: 43.0825, lng: -73.7844 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = {
  origin: saratogaAnchor,
  weather,
  now: new Date('2026-10-31T18:00:00Z'),
  radiusMi: 15,
  sort: 'nearest' as const,
  mode: 'everyone' as const,
  placeKind: 'all' as const,
};

it('verifies Saratoga Springs city registry anchor, timezone, and service region', () => {
  const saratoga = cityById('saratoga-springs');
  expect(saratoga).toMatchObject({
    id: 'saratoga-springs',
    name: 'Saratoga Springs',
    state: 'New York',
    serviceRegion: 'saratoga-springs',
    timeZone: 'America/New_York',
    availability: 'available',
  });
  expect(saratoga?.anchor).toMatchObject({
    lat: expect.closeTo(43.0825, 3),
    lng: expect.closeTo(-73.7844, 3),
    name: 'Saratoga Springs Public Library',
    approximate: true,
  });
  expect(COMING_SOON_CITIES).not.toContain('Saratoga Springs');
  expect(CITIES.some(c => c.id === 'saratoga-springs')).toBe(true);
});

it('verifies saratoga-springs containment and multi-county localities', () => {
  expect(SARATOGA_SPRINGS).toBeDefined();
  expect(SARATOGA_SPRINGS.timezone).toBe('America/New_York');
  const localities = regionLocalities('saratoga-springs');
  expect(localities).toEqual(
    expect.arrayContaining([
      'Saratoga Springs',
      'Ballston Spa',
      'Clifton Park',
      'Wilton',
      'Malta',
      'Halfmoon',
      'Round Lake',
      'Schuylerville',
      'Corinth',
      'Glens Falls',
      'Queensbury',
      'Lake George',
      'Bolton',
      'Hudson Falls',
      'Fort Edward',
      'Greenwich',
      'Cambridge',
      'Whitehall',
    ]),
  );
});

it.each([
  ['Saratoga Springs Public Library', 43.0825, -73.7844],
  ['Saratoga Spa State Park', 43.0538, -73.8012],
  ['Congress Park', 43.0785, -73.7848],
  ['Saratoga Race Course', 43.0722, -73.7712],
  ['Yaddo Gardens', 43.0682, -73.7585],
  ['SPAC Amphitheater', 43.0556, -73.8062],
  ['Caffè Lena', 43.0829, -73.7831],
  ['Saratoga Lake Waterfront Park', 43.0545, -73.7312],
  ['Clifton Park-Halfmoon Library', 42.8625, -73.8078],
  ['Crandall Public Library (Glens Falls)', 43.3089, -73.6444],
  ['The Hyde Collection (Glens Falls)', 43.3075, -73.6382],
  ['Lake George Arts Project', 43.4244, -73.7136],
  ['Greenwich Free Library', 43.0917, -73.4994],
])('routes %s inside saratoga-springs and assigns America/New_York time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('saratoga-springs');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it('rejects points outside the Saratoga-Adirondack regional envelope', () => {
  const outOfBoundsNorth = { lat: 44.50, lng: -73.50 };
  const outOfBoundsSouth = { lat: 41.50, lng: -73.50 };
  const outOfBoundsWest = { lat: 43.00, lng: -75.50 };
  expect(regionForSpot(outOfBoundsNorth)).not.toBe('saratoga-springs');
  expect(regionForSpot(outOfBoundsSouth)).not.toBe('saratoga-springs');
  expect(regionForSpot(outOfBoundsWest)).not.toBe('saratoga-springs');
});

it('maps Saratoga Springs civic anchor to NWS ALY cell 68, 92 (43.1, -73.8)', () => {
  const cell = weatherCell(saratogaAnchor.lat, saratogaAnchor.lng);
  expect(cell).toEqual({ lat: 43.1, lng: -73.8, key: '43.1,-73.8' });
});

it('enrolls 8 curated Saratoga Springs places across 4+ kinds with balanced ratings', () => {
  expect(SARATOGA_SPRINGS_SPOTS).toHaveLength(8);
  const kinds = new Set(SARATOGA_SPRINGS_SPOTS.map(spot => spot.placeKind));
  expect(kinds.size).toBeGreaterThanOrEqual(4);
  expect(kinds).toContain('indoor');
  expect(kinds).toContain('water');
  expect(kinds).toContain('trail');
  expect(kinds).toContain('hang');

  const family = SARATOGA_SPRINGS_SPOTS.filter(s => s.rating === 'family');
  const general = SARATOGA_SPRINGS_SPOTS.filter(s => s.rating === 'general');
  expect(family.length).toBe(4);
  expect(general.length).toBe(4);

  for (const spot of SARATOGA_SPRINGS_SPOTS) {
    expect(spot.serviceRegion).toBe('saratoga-springs');
    expect(spot.lat).toBeGreaterThanOrEqual(42.75);
    expect(spot.lat).toBeLessThanOrEqual(43.85);
    expect(spot.lng).toBeGreaterThanOrEqual(-74.25);
    expect(spot.lng).toBeLessThanOrEqual(-73.30);
    expect(spot.approximate).toBe(true);
    expect(spot.sourceName).toBeTruthy();
    expect(spot.sourceUrl).toMatch(/^https:\/\//);
    expect(SPOTS.some(s => s.id === spot.id)).toBe(true);
  }
});

it('builds places feed around Saratoga Springs origin', () => {
  const feed = buildPlacesFeed({
    ...base,
    spots: SARATOGA_SPRINGS_SPOTS,
  });
  expect(feed.nearby.length).toBe(8);
  expect(feed.nearby.some(row => row.spot.title.includes('Congress Park'))).toBe(true);
  expect(feed.nearby.some(row => row.spot.title.includes('Saratoga Spa State Park'))).toBe(true);
  expect(feed.nearby.some(row => row.spot.title.includes('Caffè Lena'))).toBe(true);
});
