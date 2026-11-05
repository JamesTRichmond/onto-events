import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { BROOKLYN_SPOTS } from '@/data/places/brooklyn';
import { SPOTS } from '@/data/spots';
import { NYC, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';
import { LOCAL_ACTIVITIES as BROOKLYN_ACTIVITIES } from '@/data/brooklyn-events';

const origin = { lat: 40.6725, lng: -73.9683 };
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

it('launches Brooklyn in New York within the NYC region on Eastern time', () => {
  expect(cityById('brooklyn')).toMatchObject({
    state: 'New York',
    serviceRegion: 'nyc',
    timeZone: 'America/New_York',
    availability: 'available',
    anchor: {
      lat: 40.6725,
      lng: -73.9683,
      name: 'Brooklyn Public Library Central',
      approximate: true,
    },
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(19);
  expect(COMING_SOON_CITIES).not.toContain('Brooklyn');
  const localities = regionLocalities('nyc');
  expect(localities).toEqual(
    expect.arrayContaining([
      'Williamsburg',
      'Greenpoint',
      'Bushwick',
      'DUMBO',
      'Park Slope',
      'Bed-Stuy',
      'Gowanus',
      'Red Hook',
      'Flatbush',
      'Coney Island',
      'Sunset Park',
      'Bay Ridge',
    ]),
  );
  expect(NYC.timezone).toBe('America/New_York');
});

it.each([
  ['Brooklyn Public Library Central', 40.6725, -73.9683],
  ['Williamsburg Waterfront', 40.7144, -73.9553],
  ['Greenpoint Transmitter Park', 40.7289, -73.9614],
  ['Bushwick Troutman Art Corridor', 40.7042, -73.9272],
  ['DUMBO Empire Fulton Ferry', 40.7033, -73.9897],
  ['Pioneer Works in Red Hook', 40.6797, -74.0135],
  ['Weeksville Heritage Center', 40.6742, -73.9252],
  ['Industry City in Sunset Park', 40.6566, -74.0084],
  ['Coney Island USA / Sideshow', 40.5755, -73.9788],
  ['Bay Ridge 69th St Pier', 40.6406, -74.0381],
])('accepts %s inside Brooklyn / Kings County bounds and assigns Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('nyc');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Princeton in New Jersey', 40.3573, -74.6672],
  ['White Plains in Westchester', 41.0339, -73.7629],
  ['Hempstead in Nassau County', 40.7062, -73.6187],
  ['Stamford in Connecticut', 41.0534, -73.5387],
  ['Philadelphia in Pennsylvania', 39.9526, -75.1652],
])('rejects %s outside NYC service region bounds', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).not.toBe('nyc');
});

it('has authentic local supply across all 5 kinds and retains prior destinations', () => {
  expect(BROOKLYN_SPOTS.length).toBeGreaterThanOrEqual(8);
  const kinds = new Set(BROOKLYN_SPOTS.map((s) => s.placeKind));
  expect(kinds).toEqual(new Set(['indoor', 'view', 'trail', 'water', 'hang']));
  expect(SPOTS.filter((s) => s.serviceRegion === 'utah').length).toBeGreaterThanOrEqual(39);
  expect(SPOTS.filter((s) => s.serviceRegion === 'chicago').length).toBeGreaterThanOrEqual(8);
  expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length);

  for (const spot of BROOKLYN_SPOTS) {
    expect(spot.serviceRegion).toBe('nyc');
    expect(regionForSpot(spot)).toBe('nyc');
    expect(spot.sourceUrl).toMatch(/^https:\/\//);
    expect(spot.hours.trim().length).toBeGreaterThan(0);
    expect(spot.approximate).toBe(true);
  }

  const result = buildPlacesFeed({ ...base, radiusMi: 5 });
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('nyc');
  }
  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('40.7,-74.0');
});

it('provides a balanced offline activity bundle with both family and general ratings', () => {
  expect(BROOKLYN_ACTIVITIES.length).toBeGreaterThanOrEqual(6);
  const ratings = new Set(BROOKLYN_ACTIVITIES.map((a) => a.rating));
  expect(ratings.has('family')).toBe(true);
  expect(ratings.has('general')).toBe(true);
  for (const activity of BROOKLYN_ACTIVITIES) {
    expect(regionForSpot(activity)).toBe('nyc');
    expect(activity.timezone).toBe('America/New_York');
    expect(activity.source).toBe('live');
  }
});

it('keeps local outdoor places in stormy weather and applies indoor boost', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 10 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 10,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 70, windMph: 25 },
  });
  expect(storm.nearby.map((r) => r.spot.id).sort()).toEqual(calm.nearby.map((r) => r.spot.id).sort());
  expect(storm.nearby.some((r) => r.spot.indoorBoost === true)).toBe(true);
  expect(storm.nearby.some((r) => r.spot.setting === 'outdoor' && r.fit === 'poor')).toBe(true);
});

it('keeps Brooklyn / NYC strictly isolated from other service regions', () => {
  const brooklynPoint = { lat: 40.6725, lng: -73.9683 };
  const chicagoPoint = { lat: 41.8763, lng: -87.6281 };
  const austinPoint = { lat: 30.2659, lng: -97.7516 };
  const miamiPoint = { lat: 25.7753, lng: -80.1963 };

  expect(regionForSpot(brooklynPoint)).toBe('nyc');
  expect(regionForSpot(chicagoPoint)).toBe('chicago');
  expect(regionForSpot(austinPoint)).toBe('austin');
  expect(regionForSpot(miamiPoint)).toBe('miami');

  const bkFeed = buildPlacesFeed({ ...base, origin: brooklynPoint, radiusMi: 15 });
  const rows = [...bkFeed.nearby, ...bkFeed.farther];
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.spot.serviceRegion === 'nyc')).toBe(true);
});
