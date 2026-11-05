import { YONKERS_SPOTS } from '@/data/places/yonkers';
import { SPOTS } from '@/data/spots';
import { NYC, WESTCHESTER, regionForSpot } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };
const yonkersOrigin = { lat: 40.93574, lng: -73.8994 };
const manhattanOrigin = { lat: 40.7531, lng: -73.9819 };

it('keeps the Westchester box off the NYC rectangle', () => {
  expect(NYC.bounds.latMax).toBe(40.92);
  expect(WESTCHESTER.bounds.latMin).toBeGreaterThan(NYC.bounds.latMax);
  expect(WESTCHESTER.timezone).toBe('America/New_York');
});

it('reaches a Yonkers spot from inside Westchester and not from Manhattan', () => {
  const westchesterSpots = YONKERS_SPOTS.filter((spot) => spot.serviceRegion === 'westchester');
  const mountVernon = YONKERS_SPOTS.filter((spot) => spot.area === 'Mount Vernon');
  expect(YONKERS_SPOTS).toHaveLength(26);
  expect(westchesterSpots).toHaveLength(24);
  expect(mountVernon).toHaveLength(2);

  for (const spot of westchesterSpots) {
    expect(regionForSpot(spot)).toBe('westchester');
    expect(SPOTS.filter((item) => item.id === spot.id)).toHaveLength(1);
  }
  for (const spot of mountVernon) {
    expect(spot.serviceRegion).toBe('nyc');
    expect(regionForSpot(spot)).toBe('nyc');
  }

  expect(regionForSpot(yonkersOrigin)).toBe('westchester');
  expect(regionForSpot(manhattanOrigin)).toBe('nyc');

  const fromYonkers = buildPlacesFeed({
    origin: yonkersOrigin,
    weather,
    now: new Date('2026-10-24T15:00:00Z'),
    radiusMi: 15,
    sort: 'nearest',
    mode: 'everyone',
    placeKind: 'all',
    spots: YONKERS_SPOTS,
  });
  const yonkersRows = [...fromYonkers.nearby, ...fromYonkers.farther];
  expect(yonkersRows.some((row) => row.spot.id === 'spot-yonkers-philipse-manor-hall')).toBe(true);
  expect(yonkersRows.every((row) => row.spot.serviceRegion === 'westchester')).toBe(true);
  expect(yonkersRows.some((row) => row.spot.area === 'Mount Vernon')).toBe(false);

  const fromManhattan = buildPlacesFeed({
    origin: manhattanOrigin,
    weather,
    now: new Date('2026-10-24T15:00:00Z'),
    radiusMi: 30,
    sort: 'nearest',
    mode: 'everyone',
    placeKind: 'all',
    spots: YONKERS_SPOTS,
  });
  const manhattanRows = [...fromManhattan.nearby, ...fromManhattan.farther];
  expect(manhattanRows.some((row) => row.spot.serviceRegion === 'westchester')).toBe(false);
});
