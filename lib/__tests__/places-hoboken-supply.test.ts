import { CITIES } from '@/data/cities';
import { HOBOKEN_SPOTS } from '@/data/places/hoboken';
import { JERSEY_CITY_SPOTS } from '@/data/places/jersey-city';
import { SPOTS } from '@/data/spots';
import { regionForSpot } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

const hoboken = CITIES.find(city => city.id === 'hoboken')!;
const weather: PlaceSky = {
  kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null,
};

describe('Hoboken waterfront Places supply', () => {
  it('gives Hoboken City Hall a nearby mix inside the municipal polygon', () => {
    const feed = buildPlacesFeed({
      now: new Date('2026-10-18T16:00:00Z'), origin: hoboken.anchor,
      radiusMi: 15, sort: 'nearest', mode: 'everyone', placeKind: 'all',
      weather, includeFar: false, timeZone: hoboken.timeZone,
    });
    expect(feed.nearby.length).toBeGreaterThanOrEqual(30);
    for (const kind of ['view', 'water', 'trail', 'hang'] as const) {
      expect(feed.nearby.filter(row => row.spot.placeKind === kind).length).toBeGreaterThanOrEqual(2);
    }
    expect(feed.nearby.filter(row => row.spot.placeKind === 'indoor').length).toBeGreaterThanOrEqual(1);
    expect(feed.nearby.some(row => row.spot.rating === 'family')).toBe(true);
    expect(feed.nearby.some(row => row.spot.rating === 'general')).toBe(true);
    expect(feed.farther).toEqual([]);
    expect(feed.nearby.every(row => row.spot.serviceRegion === 'hoboken' && row.miles <= 15)).toBe(true);
  });

  it('keeps these towns out of New York City and keeps Manhattan in New York City', () => {
    expect(regionForSpot(hoboken.anchor)).toBe('hoboken');
    expect(regionForSpot({ lat: 40.80302, lng: -74.00068 })).toBe('hoboken');
    expect(regionForSpot({ lat: 40.7531, lng: -73.9819 })).toBe('nyc');
    expect(regionForSpot({ lat: 40.745, lng: -73.845 })).toBe('nyc');
    expect(regionForSpot({ lat: 40.75, lng: -73.98 })).toBe('nyc');
    expect(regionForSpot({ lat: 40.68, lng: -73.95 })).toBe('nyc');
    expect(regionForSpot({ lat: 40.6417, lng: -74.0767 })).toBe('nyc');
    expect(regionForSpot({ lat: 40.69028, lng: -74.06461 })).toBe('nyc');
  });

  it('ships unique attributed places whose pins resolve to hoboken', () => {
    expect(HOBOKEN_SPOTS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);
    for (const place of HOBOKEN_SPOTS) {
      expect(regionForSpot(place)).toBe('hoboken');
      expect(['family', 'general']).toContain(place.rating);
      expect(place.sourceName).toBeTruthy();
      expect(place.sourceUrl).toMatch(/^https:\/\//);
      expect(place.checkedOn).toBe('2026-10-18');
      expect(place.approximate).toBe(true);
      expect(place.address).toBeTruthy();
      expect(place.hours).toBeTruthy();
      expect(place.lat).toBeGreaterThanOrEqual(40.73039);
      expect(place.lat).toBeLessThanOrEqual(40.82358);
      expect(place.lng).toBeGreaterThanOrEqual(-74.05697);
      expect(place.lng).toBeLessThanOrEqual(-73.98474);
    }
  });

  it('keeps Hudson waterfront places out of the Jersey City catalog', () => {
    for (const place of JERSEY_CITY_SPOTS) {
      expect(regionForSpot(place)).toBe(place.serviceRegion);
      expect(regionForSpot(place)).not.toBe('hoboken');
    }
    const key = (place: { venue: string; area: string }) => `${place.venue}|${place.area}`.toLowerCase();
    const hobokenKeys = new Set(HOBOKEN_SPOTS.map(key));
    expect(JERSEY_CITY_SPOTS.filter(place => hobokenKeys.has(key(place)))).toEqual([]);
  });
});
