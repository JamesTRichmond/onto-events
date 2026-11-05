import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { PARK_CITY_SPOTS } from '@/data/places/park-city';
import { SPOTS } from '@/data/spots';
import { PARK_CITY, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';

const parkCityAnchor = { lat: 40.6558, lng: -111.5036 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const base = {
  origin: parkCityAnchor,
  weather,
  now: new Date('2026-10-31T18:00:00Z'),
  radiusMi: 15,
  sort: 'nearest' as const,
  mode: 'everyone' as const,
  placeKind: 'all' as const,
};

it('verifies Park City city registry anchor, timezone, and service region', () => {
  const parkCity = cityById('park-city');
  expect(parkCity).toMatchObject({
    id: 'park-city',
    name: 'Park City',
    state: 'Utah',
    serviceRegion: 'park-city',
    timeZone: 'America/Denver',
    availability: 'available',
  });
  expect(parkCity?.anchor).toMatchObject({
    lat: expect.closeTo(40.6558, 3),
    lng: expect.closeTo(-111.5036, 3),
    name: 'Park City Library on Park Ave',
    approximate: true,
  });
  expect(COMING_SOON_CITIES).not.toContain('Park City');
  expect(CITIES.some(c => c.id === 'park-city')).toBe(true);
});

it('verifies park-city service region containment and Summit/Wasatch localities', () => {
  expect(PARK_CITY).toBeDefined();
  expect(PARK_CITY.timezone).toBe('America/Denver');
  const localities = regionLocalities('park-city');
  expect(localities).toEqual(
    expect.arrayContaining([
      'Park City',
      'Snyderville',
      'Kimball Junction',
      'Silver Summit',
      'Silver Creek',
      'Jeremy Ranch',
      'Pinebrook',
      'Promontory',
      'Kamas',
      'Oakley',
      'Coalville',
      'Heber City',
      'Midway',
    ]),
  );
});

it.each([
  ['Park City Library', 40.6558, -111.5036],
  ['Historic Main Street', 40.6445, -111.4982],
  ['Park City Mountain Village', 40.6515, -111.5085],
  ['Deer Valley Snow Park Amphitheater', 40.6372, -111.4785],
  ['Round Valley Trailhead', 40.6812, -111.4725],
  ['Utah Olympic Park', 40.7105, -111.5622],
  ['McPolin Farmstead', 40.6755, -111.5312],
  ['Swaner EcoCenter', 40.7185, -111.5392],
  ['Jordanelle State Park', 40.6385, -111.4285],
  ['Summit Park', 40.7500, -111.6000],
  ['Henefer Weber River', 41.0189, -111.4989],
  ['Wallsburg Main Canyon', 40.3889, -111.4289],
])('routes %s inside park-city and assigns America/Denver time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('park-city');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Denver');
});

it('maps Park City civic anchor to NWS SLC cell 102, 174 (0.1 deg: 40.7, -111.5)', () => {
  const cell = weatherCell(parkCityAnchor.lat, parkCityAnchor.lng);
  expect(cell).toEqual({ lat: 40.7, lng: -111.5, key: '40.7,-111.5' });
});

it('enrolls curated Park City places across 5 kinds with balanced ratings', () => {
  expect(PARK_CITY_SPOTS.length).toBeGreaterThanOrEqual(8);
  const kinds = new Set(PARK_CITY_SPOTS.map(spot => spot.placeKind));
  expect(kinds.size).toBeGreaterThanOrEqual(5);
  expect(kinds).toContain('indoor');
  expect(kinds).toContain('hang');
  expect(kinds).toContain('trail');
  expect(kinds).toContain('view');
  expect(kinds).toContain('water');

  const family = PARK_CITY_SPOTS.filter(s => s.rating === 'family');
  const general = PARK_CITY_SPOTS.filter(s => s.rating === 'general');
  expect(family.length).toBeGreaterThanOrEqual(4);
  expect(general.length).toBeGreaterThanOrEqual(4);

  for (const spot of PARK_CITY_SPOTS) {
    expect(spot.serviceRegion).toBe('park-city');
    expect(spot.lat).toBeGreaterThanOrEqual(40.35);
    expect(spot.lat).toBeLessThanOrEqual(41.05);
    expect(spot.lng).toBeGreaterThanOrEqual(-111.65);
    expect(spot.lng).toBeLessThanOrEqual(-111.00);
    expect(spot.approximate).toBe(true);
    expect(spot.sourceName).toBeTruthy();
    expect(spot.sourceUrl).toMatch(/^https:\/\//);
    expect(SPOTS.some(s => s.id === spot.id)).toBe(true);
  }
});

it('builds places feed around Park City origin', () => {
  const feed = buildPlacesFeed({
    ...base,
    spots: PARK_CITY_SPOTS,
  });
  expect(feed.nearby.length).toBeGreaterThanOrEqual(8);
  expect(feed.nearby.some(row => row.spot.title.includes('Park City Library'))).toBe(true);
  expect(feed.nearby.some(row => row.spot.title.includes('Historic Main Street'))).toBe(true);
});
