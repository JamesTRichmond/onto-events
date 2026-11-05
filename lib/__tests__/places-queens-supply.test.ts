import { CITIES } from '@/data/cities';
import { QUEENS_SPOTS } from '@/data/places/queens';
import { SPOTS } from '@/data/spots';
import { regionForSpot } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

const queens = CITIES.find(city => city.id === 'queens');
if (!queens) throw new Error('Queens city anchor missing');

const weather: PlaceSky = {
  kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null,
};

describe('Queens Places supply', () => {
  it('shows a nearby mix from the Queens library anchor', () => {
    const feed = buildPlacesFeed({
      now: new Date('2026-10-18T16:00:00Z'),
      origin: queens.anchor,
      radiusMi: 15,
      sort: 'nearest',
      mode: 'everyone',
      placeKind: 'all',
      weather,
      includeFar: false,
      timeZone: queens.timeZone,
    });
    expect(feed.nearby.length).toBeGreaterThanOrEqual(40);
    for (const kind of ['view', 'water', 'trail', 'hang', 'indoor'] as const) {
      expect(feed.nearby.filter(row => row.spot.placeKind === kind).length).toBeGreaterThanOrEqual(2);
    }
    expect(feed.nearby.every(row => row.miles <= 15 && row.spot.rating !== 'mature')).toBe(true);
    expect(feed.farther).toEqual([]);
  });

  it('keeps the catalog inside the live New York City region', () => {
    expect(QUEENS_SPOTS.length).toBe(50);
    expect(SPOTS).toEqual(expect.arrayContaining(QUEENS_SPOTS));
    expect(new Set(QUEENS_SPOTS.map(spot => spot.id)).size).toBe(QUEENS_SPOTS.length);
    expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);
    for (const spot of QUEENS_SPOTS) {
      expect(spot.serviceRegion).toBe('nyc');
      expect(regionForSpot(spot)).toBe('nyc');
      expect(spot.sourceUrl).toMatch(/^https:\/\//);
      expect(spot.sourceName).toBeTruthy();
      expect(spot.checkedOn).toBe('2026-10-18');
      expect(spot.approximate).toBe(true);
      expect(spot.address).toBeTruthy();
      expect(spot.hours).toBeTruthy();
      expect(spot.lat).toBeGreaterThanOrEqual(40.49);
      expect(spot.lat).toBeLessThanOrEqual(40.92);
      expect(spot.lng).toBeGreaterThanOrEqual(-74.26);
      expect(spot.lng).toBeLessThanOrEqual(-73.7);
      expect(['family', 'general']).toContain(spot.rating);
    }
    expect(regionForSpot({ lat: 40.77854, lng: -73.92326 })).toBe('nyc');
  });
});
