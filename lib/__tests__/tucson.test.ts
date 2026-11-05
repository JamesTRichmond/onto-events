import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { TUCSON, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';
import { weatherCell } from '@/lib/weather/cell';
import { LOCAL_ACTIVITIES as TUCSON_ACTIVITIES } from '@/data/tucson-events';

const origin = { lat: 32.2229, lng: -110.9718 }; // Joel D. Valdez Main Library
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

it('launches Tucson & Southern Arizona on Mountain Standard Time (no DST) without altering prior city identities', () => {
  expect(cityById('tucson')).toMatchObject({
    state: 'Arizona',
    serviceRegion: 'tucson',
    timeZone: 'America/Phoenix',
    availability: 'available',
  });
  expect(CITIES.length).toBeGreaterThanOrEqual(21);
  expect(COMING_SOON_CITIES).not.toContain('Tucson');
  expect(regionLocalities('tucson')).toEqual(
    expect.arrayContaining([
      'Tucson',
      'Oro Valley',
      'Marana',
      'Sahuarita',
      'Green Valley',
      'Tubac',
      'Nogales',
      'Bisbee',
      'Sierra Vista',
      'Tombstone',
      'Casa Grande',
      'Florence',
    ]),
  );
  expect(TUCSON).toBeDefined();
  expect(TUCSON.timezone).toBe('America/Phoenix');
});

it.each([
  ['Downtown Tucson (Valdez Main Library)', 32.2229, -110.9718],
  ['Arizona-Sonora Desert Museum', 32.2431, -111.1678],
  ['Sabino Canyon', 32.3115, -110.8217],
  ['Mission San Xavier del Bac', 32.1072, -111.0084],
  ['Tubac in Santa Cruz County', 31.6111, -111.0450],
  ['Nogales at International Border', 31.3404, -110.9343],
  ['Bisbee in Cochise County', 31.4482, -109.9284],
  ['Sierra Vista near Fort Huachuca', 31.5545, -110.3037],
  ['Tombstone Historic District', 31.7129, -110.0676],
  ['Oracle in Southern Pinal County', 32.6106, -110.7709],
])('accepts %s inside Southern Arizona Corridor and assigns America/Phoenix time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('tucson');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/Phoenix');
});

it.each([
  ['Phoenix in Maricopa County', 33.4484, -112.0740],
  ['Flagstaff in Coconino County', 35.1995, -111.6534],
  ['Prescott in Yavapai County', 34.5400, -112.4685],
  ['Yuma in Yuma County', 32.6927, -114.6277],
  ['Salt Lake City in Utah', 40.7608, -111.8910],
  ['El Paso in Texas', 31.7619, -106.4850],
])('rejects %s outside Southern Arizona Corridor', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).not.toBe('tucson');
  const result = buildPlacesFeed({ ...base, origin: { lat, lng } });
  if (regionForSpot({ lat, lng }) === null) {
    expect(result.nearby).toEqual([]);
    expect(result.farther).toEqual([]);
  }
});

it('has real local evergreen supply in both radius buckets and retains strict regional containment against Utah', () => {
  const local = SPOTS.filter((spot) => spot.serviceRegion === 'tucson');
  expect(local.length).toBeGreaterThanOrEqual(8);
  expect(new Set(local.map((spot) => spot.placeKind)).size).toBeGreaterThanOrEqual(5);
  expect(SPOTS.filter((spot) => spot.serviceRegion === 'utah')).toHaveLength(39);
  expect(new Set(SPOTS.map((spot) => spot.id)).size).toBe(SPOTS.length);

  for (const spot of local) {
    expect(regionForSpot(spot)).toBe('tucson');
    expect(spot).toMatchObject({ approximate: true, checkedOn: '2026-10-31' });
    expect(spot.sourceUrl).toMatch(/^https:/);
    expect(spot.address).toBeTruthy();
  }

  const result = buildPlacesFeed(base);
  expect(result.nearby.length).toBeGreaterThan(0);
  expect(result.farther.length).toBeGreaterThan(0);
  for (const row of [...result.nearby, ...result.farther]) {
    expect(row.spot.serviceRegion).toBe('tucson');
  }

  // 18:00 UTC = 11:00 MST in America/Phoenix (UTC-7)
  expect(result.clock.hour).toBe(11);

  // Non-DST invariance: November 15 (after US DST change) still yields 11:00 MST
  const postDstResult = buildPlacesFeed({ ...base, now: new Date('2026-11-15T18:00:00Z') });
  expect(postDstResult.clock.hour).toBe(11);

  expect(weatherCell(origin.lat, origin.lng)?.key).toBe('32.2,-111.0');

  // Verify zero Utah bleed even with wide 100-mile search radius
  const wideResult = buildPlacesFeed({ ...base, radiusMi: 100 });
  const wideSpots = [...wideResult.nearby, ...wideResult.farther];
  expect(wideSpots.length).toBeGreaterThanOrEqual(8);
  expect(wideSpots.every((row) => row.spot.serviceRegion === 'tucson')).toBe(true);
  expect(wideSpots.some((row) => row.spot.serviceRegion === 'utah')).toBe(false);
});

it('keeps local outdoor places in stormy weather and uses honest missing-weather copy', () => {
  const calm = buildPlacesFeed({ ...base, radiusMi: 100 });
  const storm = buildPlacesFeed({
    ...base,
    radiusMi: 100,
    sort: 'sky',
    weather: { ...weather, kind: 'thunder', temperatureF: 75, windMph: 25 },
  });
  expect(storm.nearby.map((row) => row.spot.id).sort()).toEqual(calm.nearby.map((row) => row.spot.id).sort());
  expect(storm.nearby[0].spot.indoorBoost).toBe(true);
  expect(storm.nearby.some((row) => row.spot.setting === 'outdoor' && row.fit === 'poor')).toBe(true);
  for (const row of calm.nearby) expect(row.line).not.toMatch(/open|clear|sky is fine/i);
});

it('contains balanced family and general ratings in the Tucson offline bundle', () => {
  const ratings = new Set(TUCSON_ACTIVITIES.map((activity) => activity.rating));
  expect(ratings.has('family')).toBe(true);
  expect(ratings.has('general')).toBe(true);
  expect(TUCSON_ACTIVITIES.length).toBeGreaterThanOrEqual(5);
  for (const activity of TUCSON_ACTIVITIES) {
    expect(activity.timezone).toBe('America/Phoenix');
    expect(regionForSpot({ lat: activity.lat, lng: activity.lng })).toBe('tucson');
  }
});
