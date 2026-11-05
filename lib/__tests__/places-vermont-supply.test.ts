import { CITIES } from '@/data/cities';
import { SPOTS } from '@/data/spots';
import { regionForSpot } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

// Plan 2 target for the rural corridor: 25 mi, not the 15 mi metro radius.
const RADIUS_MI = 25;
const cities = CITIES.filter(city => city.serviceRegion === 'vermont-corridor');
const weather: PlaceSky = {
  kind: null, temperatureF: null, windMph: null, sunriseAt: null, sunsetAt: null,
};

describe('Vermont corridor Places supply', () => {
  it('covers all eleven launched town anchors', () => {
    expect(cities.map(city => city.id).sort()).toEqual([
      'bristol', 'burlington', 'middlebury', 'montpelier', 'royalton', 'rutland',
      'south-burlington', 'vergennes', 'white-river-junction', 'williston', 'woodstock',
    ]);
  });

  it.each(cities)('gives $name fifteen nearby public destinations and two of each core kind', city => {
    const feed = buildPlacesFeed({
      now: new Date('2026-10-19T16:00:00Z'), origin: city.anchor,
      radiusMi: RADIUS_MI, sort: 'nearest', mode: 'everyone', placeKind: 'all',
      weather, includeFar: false, timeZone: city.timeZone,
    });
    expect(feed.nearby.length).toBeGreaterThanOrEqual(15);
    for (const kind of ['view', 'water', 'trail', 'hang', 'indoor']) {
      expect(feed.nearby.filter(row => row.spot.placeKind === kind).length).toBeGreaterThanOrEqual(2);
    }
    expect(feed.farther).toEqual([]);
    expect(feed.nearby.every(row => row.spot.rating !== 'mature' && row.miles <= RADIUS_MI)).toBe(true);
  });

  it('ships unique, attributed destinations within the declared region', () => {
    const places = SPOTS.filter(spot => spot.serviceRegion === 'vermont-corridor');
    expect(places.length).toBe(118);
    expect(new Set(SPOTS.map(spot => spot.id)).size).toBe(SPOTS.length);
    for (const place of places) {
      expect(regionForSpot(place)).toBe('vermont-corridor');
      expect(['family', 'general']).toContain(place.rating);
      expect(place.sourceName).toBeTruthy();
      expect(place.sourceUrl).toMatch(/^https:\/\//);
      expect(place.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(place.approximate).toBe(true);
      expect(place.address).toBeTruthy();
      expect(place.hours).toBeTruthy();
    }
  });

  it('keeps the 24 places carried from PR 338 inside the corridor', () => {
    const carried = [
      'spot-bristol-saunders-river',
      'spot-bristol-bartlett-falls',
      'spot-bristol-watershed-center',
      'spot-bristol-cliffs',
      'spot-bristol-rec-park',
      'spot-addison-dar',
      'spot-orwell-mount-independence',
      'spot-addison-chimney-point',
      'spot-ferrisburgh-rokeby',
      'spot-vergennes-lcmm',
      'spot-salisbury-moosalamoo',
      'spot-rutland-wonderfeet',
      'spot-hubbardton-battlefield',
      'spot-williston-village-park',
      'spot-williston-allen-brook-park',
      'spot-williston-allen-brook-trail',
      'spot-williston-five-tree',
      'spot-williston-sucker-brook',
      'spot-williston-mud-pond',
      'spot-williston-catamount',
      'spot-underhill-state-park',
      'spot-colchester-niquette-bay',
      'spot-shelburne-museum',
      'spot-shelburne-farms',
    ];
    const places = SPOTS.filter(spot => spot.serviceRegion === 'vermont-corridor');
    for (const id of carried) {
      const place = places.find(spot => spot.id === id);
      expect(place).toBeTruthy();
      expect(regionForSpot(place!)).toBe('vermont-corridor');
    }
  });
});
