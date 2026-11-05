import { BROOKLYN_SPOTS } from '@/data/places/brooklyn';
import { SPOTS } from '@/data/spots';
import { NYC, regionForSpot } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

const plaza = { lat: 40.674922, lng: -73.970816 };
const weather: PlaceSky = { kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null };

it('keeps Brooklyn places inside the NYC region on Eastern time', () => {
  expect(NYC.timezone).toBe('America/New_York');
  expect(NYC.bounds).toMatchObject({ latMin: 40.49, latMax: 40.92, lngMin: -74.26, lngMax: -73.7 });
  expect(BROOKLYN_SPOTS.length).toBe(20);
  expect(new Set(BROOKLYN_SPOTS.map(spot => spot.id)).size).toBe(20);
  for (const spot of BROOKLYN_SPOTS) {
    expect(spot.serviceRegion).toBe('nyc');
    expect(regionForSpot(spot)).toBe('nyc');
    expect(spot.sourceUrl).toMatch(/^https:\/\//);
    expect(spot.hours.trim().length).toBeGreaterThan(0);
    expect(spot.lat).toBeGreaterThanOrEqual(NYC.bounds.latMin);
    expect(spot.lat).toBeLessThanOrEqual(NYC.bounds.latMax);
    expect(spot.lng).toBeGreaterThanOrEqual(NYC.bounds.lngMin);
    expect(spot.lng).toBeLessThanOrEqual(NYC.bounds.lngMax);
    expect(SPOTS.filter(item => item.id === spot.id)).toHaveLength(1);
  }
});

it('serves Brooklyn places from a Grand Army Plaza origin and no other region', () => {
  const feed = buildPlacesFeed({
    origin: plaza,
    weather,
    now: new Date('2026-10-21T15:00:00Z'),
    radiusMi: 15,
    sort: 'nearest',
    mode: 'everyone',
    placeKind: 'all',
  });
  const rows = [...feed.nearby, ...feed.farther];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.spot.serviceRegion).toBe('nyc');
  expect(regionForSpot(plaza)).toBe('nyc');
});
