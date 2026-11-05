import { BRONX_SPOTS } from '@/data/places/bronx';
import { MANHATTAN_SPOTS } from '@/data/places/manhattan';
import { STATEN_ISLAND_SPOTS } from '@/data/places/staten-island';
import { CITIES } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { NYC, regionForSpot } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

const catalogs = [
  ['Manhattan', MANHATTAN_SPOTS, 14],
  ['Bronx', BRONX_SPOTS, 4],
  ['Staten Island', STATEN_ISLAND_SPOTS, 6],
] as const;

const weather: PlaceSky = {
  kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null,
};

describe('NYC remaining borough Places supply', () => {
  it('keeps the new catalogs inside the live New York City region', () => {
    const ids = SPOTS.map(spot => spot.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [, spots, count] of catalogs) {
      expect(spots).toHaveLength(count);
      expect(new Set(spots.map(spot => spot.id)).size).toBe(count);
      expect(SPOTS).toEqual(expect.arrayContaining([...spots]));
      for (const spot of spots) {
        expect(spot.serviceRegion).toBe('nyc');
        expect(regionForSpot(spot)).toBe('nyc');
        expect(spot.sourceUrl).toMatch(/^https:\/\//);
        expect(spot.sourceName).toBeTruthy();
        expect(spot.checkedOn).toBe('2026-10-18');
        expect(spot.approximate).toBe(true);
        expect(spot.address).toBeTruthy();
        expect(spot.hours.trim().length).toBeGreaterThan(0);
        expect(spot.lat).toBeGreaterThanOrEqual(NYC.bounds.latMin);
        expect(spot.lat).toBeLessThanOrEqual(NYC.bounds.latMax);
        expect(spot.lng).toBeGreaterThanOrEqual(NYC.bounds.lngMin);
        expect(spot.lng).toBeLessThanOrEqual(NYC.bounds.lngMax);
        expect(['family', 'general']).toContain(spot.rating);
        expect(ids.filter(id => id === spot.id)).toHaveLength(1);
      }
    }
  });

  it('shows Manhattan places from the NYPL anchor', () => {
    const city = CITIES.find(item => item.id === 'manhattan');
    if (!city) throw new Error('Manhattan city anchor missing');
    const feed = buildPlacesFeed({
      now: new Date('2026-10-18T16:00:00Z'),
      origin: city.anchor,
      radiusMi: 8,
      sort: 'nearest',
      mode: 'everyone',
      placeKind: 'all',
      weather,
      includeFar: false,
      timeZone: city.timeZone,
    });
    const ids = feed.nearby.map(row => row.spot.id);
    expect(ids).toEqual(expect.arrayContaining(['spot-mn-bryant', 'spot-mn-high-line']));
    expect(feed.nearby.every(row => row.miles <= 8 && row.spot.serviceRegion === 'nyc')).toBe(true);
  });

  it('shows Bronx and Staten Island anchors their own catalogs', () => {
    for (const [cityId, needle] of [
      ['bronx', 'spot-bx-nybg'],
      ['staten-island', 'spot-si-snug-harbor'],
    ] as const) {
      const city = CITIES.find(item => item.id === cityId);
      if (!city) throw new Error(`${cityId} city anchor missing`);
      const feed = buildPlacesFeed({
        now: new Date('2026-10-18T16:00:00Z'),
        origin: city.anchor,
        radiusMi: 12,
        sort: 'nearest',
        mode: 'everyone',
        placeKind: 'all',
        weather,
        includeFar: false,
        timeZone: city.timeZone,
      });
      expect(feed.nearby.map(row => row.spot.id)).toContain(needle);
      expect(feed.nearby.every(row => row.spot.serviceRegion === 'nyc')).toBe(true);
    }
  });
});
