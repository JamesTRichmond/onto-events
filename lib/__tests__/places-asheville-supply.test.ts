import { CITIES } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { regionForSpot } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

const cities = CITIES.filter(city => city.serviceRegion === 'asheville');
const weather: PlaceSky = {
  kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null,
};

describe('Asheville regional Places supply', () => {
  it.each(cities)('gives $name fifteen nearby public destinations and two of each core kind', city => {
    const feed = buildPlacesFeed({
      now: new Date('2026-10-18T16:00:00Z'), origin: city.anchor,
      radiusMi: 15, sort: 'nearest', mode: 'everyone', placeKind: 'all',
      weather, includeFar: false, timeZone: city.timeZone,
    });
    expect(feed.nearby.length).toBeGreaterThanOrEqual(15);
    for (const kind of ['view', 'water', 'trail', 'hang', 'indoor']) {
      expect(feed.nearby.filter(row => row.spot.placeKind === kind).length).toBeGreaterThanOrEqual(2);
    }
    expect(feed.farther).toEqual([]);
    expect(feed.nearby.every(row => row.spot.rating !== 'mature' && row.miles <= 15)).toBe(true);
  });

  it('ships unique, attributed destinations within the declared region', () => {
    const places = SPOTS.filter(spot => spot.serviceRegion === 'asheville');
    expect(places.map(spot => spot.id).sort()).toEqual([
      'spot-asheville-art-museum',
      'spot-asheville-aston',
      'spot-asheville-beaver-lake-sanctuary',
      'spot-asheville-botanical-garden',
      'spot-asheville-craggy-gardens-overlook',
      'spot-asheville-folk-art-center',
      'spot-asheville-glenns-creek',
      'spot-asheville-leah-chiles',
      'spot-asheville-montford',
      'spot-asheville-pack-library',
      'spot-asheville-pack-square',
      'spot-asheville-pritchard',
      'spot-asheville-reed-creek',
      'spot-asheville-science-museum',
      'spot-asheville-tanbark-ridge',
      'spot-asheville-thomas-wolfe',
      'spot-asheville-weaver',
      'spot-black-mountain-arts',
      'spot-black-mountain-lake-tomahawk',
      'spot-black-mountain-library',
      'spot-black-mountain-valley-museum',
      'spot-east-asheville-library',
      'spot-weaverville-lake-louise',
      'spot-weaverville-library',
    ]);
    expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);
    for (const place of places) {
      expect(regionForSpot(place)).toBe('asheville');
      expect(['family', 'general']).toContain(place.rating);
      expect(place.sourceName).toBeTruthy();
      expect(place.sourceUrl).toMatch(/^https:\/\//);
      expect(place.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(place.approximate).toBe(true);
      expect(place.address).toBeTruthy();
      expect(place.hours).toBeTruthy();
    }
  });
});
