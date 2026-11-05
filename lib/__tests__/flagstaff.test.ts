import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { FLAGSTAFF, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';
import { LOCAL_ACTIVITIES as FLAGSTAFF_ACTIVITIES } from '@/data/flagstaff-events';

const origin = { lat: 35.1995, lng: -111.6534 };
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

it('launches Flagstaff in Arizona on Mountain Standard Time (no DST) without altering prior city identities', () => {
  expect(cityById('flagstaff')).toMatchObject({
    state: 'Arizona',
    serviceRegion: 'flagstaff',
    timeZone: 'America/Phoenix',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(20);
  expect(COMING_SOON_CITIES).not.toContain('Flagstaff');
  expect(regionLocalities('flagstaff')).toEqual(
    expect.arrayContaining([
      'Flagstaff',
      'Williams',
      'Tusayan',
      'Sedona',
      'Grand Canyon Village',
      'Munds Park',
      'Doney Park',
      'Fort Valley',
      'Bellemont',
      'Parks',
      'Mormon Lake',
      'Winona',
    ]),
  );
  expect(FLAGSTAFF).toBeDefined();
  expect(FLAGSTAFF.timezone).toBe('America/Phoenix');
});

it.each([
  ['Downtown Flagstaff (Main Library)', 35.1995, -111.6534],
  ['Mars Hill / Lowell Observatory', 35.2028, -111.6646],
  ['Museum of Northern Arizona', 35.2344, -111.6655],
  ['Williams', 35.2494, -112.1910],
  ['Tusayan', 35.9736, -112.1266],
  ['Grand Canyon Village (South Rim)', 36.0544, -112.1401],
  ['Munds Park', 34.9411, -111.6382],
  ['Slide Rock / Oak Creek Canyon', 34.9436, -111.7533],
  ['Walnut Canyon National Monument', 35.1714, -111.5106],
  ['Cottonwood in Verde Valley', 34.7392, -112.0099],
  ['Jerome in Verde Valley', 34.7486, -112.1138],
  ['Page on North Plateau', 36.9147, -111.4558],
])('accepts %s inside Coconino High Country and assigns America/Phoenix time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('flagstaff');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Phoenix');
});

it.each([
  ['Winslow in Navajo County', 35.0242, -110.6974],
  ['Phoenix in Maricopa County', 33.4484, -112.0740],
  ['Kingman in Mohave County', 35.1894, -114.0530],
  ['Yuma in Yuma County', 32.6927, -114.6277],
  ['Las Vegas in Nevada', 36.1699, -115.1398],
])('rejects %s outside Coconino High Country', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBeNull();
  expect(timeZoneForSpot({ lat, lng })).toBeNull();
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  expect(result.nearby).toEqual([]);
  expect(result.farther).toEqual([]);
});

it('has real local evergreen supply in both radius buckets and retains strict regional containment against Utah', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'flagstaff');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('flagstaff');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-18' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed(base);
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('flagstaff');
  }

  // 18:00 UTC = 11:00 MST in America/Phoenix (UTC-7)
  expect(result.clock.hour).toBe(11);

  // Non-DST invariance: November 15 (after US DST change) still yields 11:00 MST
  const postDstResult = buildPlacesFeed({ ...base, now: new Date('2026-11-15T18:00:00Z') });
  expect(postDstResult.clock.hour).toBe(11);

  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('35.2,-111.7');

  // Verify zero Utah bleed even with wide 100-mile search radius
  const wideResult = buildPlacesFeed({ ...base, radiusMi: 100 });
  const wideSpots = [...wideResult.nearby, ...wideResult.farther];
  expect(wideSpots.length).toBeGreaterThanOrEqual(8);
  expect(wideSpots.every((row) => row.spot.serviceRegion === 'flagstaff')).toBe(true);
  expect(wideSpots.some((row) => row.spot.serviceRegion === 'utah')).toBe(false);
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 52, windMph: 25 },
  });
  expect(storm.nearby.map((row) => row.spot.id).sort()).toEqual(calm.nearby.map((row) => row.spot.id).sort());
  expect(storm.nearby[0].spot.indoorBoost).toBe(true);
  expect(storm.nearby.some((row) => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) expect(row.line).not.toMatch(/open|clear|sky is fine/i);
});

it('contains balanced family and general ratings in the Flagstaff offline bundle', () => {
  const ratings = new Set(FLAGSTAFF_ACTIVITIES.map((activity) => activity.rating));
  expect(ratings.has('family')).toBe(true);
  expect(ratings.has('general')).toBe(true);
  expect(FLAGSTAFF_ACTIVITIES.length).toBeGreaterThanOrEqual(5);
  for (const activity of FLAGSTAFF_ACTIVITIES) {
    expect(activity.timezone).toBe('America/Phoenix');
    expect(regionForSpot({ lat: activity.lat, lng: activity.lng })).toBe('flagstaff');
  }
});
