import { SPOTS, type EvergreenSpot } from '@/data/spots';
import { SLC_ANCHOR } from '@/data/activities';
import { CITIES } from '@/data/cities';
import { regionForSpot } from '@/lib/service-region';
import { venuePhotoFor } from '@/lib/venue-website';
import { buildPlacesFeed, isWatershed, skyList, type PlaceSky } from '@/lib/spot-feed';

const SUNRISE = Date.parse('2026-09-28T13:15:00Z'); // 07:15 MDT
const SUNSET = Date.parse('2026-09-29T01:15:00Z'); // 19:15 MDT

function sky(partial: Partial<PlaceSky>): PlaceSky {
  return {
    kind: 'clear',
    temperatureF: 68,
    windMph: 6,
    sunriseAt: SUNRISE,
    sunsetAt: SUNSET,
    ...partial,
  };
}

describe('places feed', () => {
  it.each(CITIES.filter(city => city.serviceRegion !== 'utah'))('keeps nearby and farther places in $name\'s region', city => {
    const feed = buildPlacesFeed({ now: new Date('2026-10-12T18:00:00Z'), origin: city.anchor,
      radiusMi: 15, sort: 'nearest', mode: 'everyone', placeKind: 'all', weather: sky({}) });
    expect([...feed.nearby, ...feed.farther].every(row => regionForSpot(row.spot) === city.serviceRegion)).toBe(true);
    if (city.id === 'tallahassee') {
      expect(feed.nearby.length).toBeGreaterThanOrEqual(3);
      expect(feed.nearby.some(row => row.spot.placeKind === 'hang')).toBe(true);
      expect(feed.nearby.some(row => row.spot.placeKind === 'indoor')).toBe(true);
      expect(feed.nearby.some(row => row.spot.placeKind === 'water')).toBe(true);
    }
  });

  it('retains all 39 Utah prototype spots and includes Tallahassee regional supply', () => {
    const utahSpots = SPOTS.filter((spot) => regionForSpot(spot) === 'utah');
    expect(utahSpots).toHaveLength(39);
    expect(new Set(SPOTS.map((spot) => spot.placeKind)).size).toBe(7);
    const tallahasseeSpots = SPOTS.filter((spot) => regionForSpot(spot) === 'tallahassee');
    expect(tallahasseeSpots.length).toBeGreaterThanOrEqual(8);
  });

  it('puts indoor first when the sky is wet', () => {
    const now = new Date('2026-09-28T20:00:00Z'); // 14:00 MDT
    const feed = buildPlacesFeed({
      now,
      origin: SLC_ANCHOR,
      radiusMi: 40,
      sort: 'sky',
      mode: 'everyone',
      placeKind: 'all',
      weather: sky({ kind: 'rain', temperatureF: 55 }),
      includeFar: false,
    });
    expect(feed.nearby[0].spot.setting === 'indoor' || feed.nearby[0].spot.indoorBoost).toBe(true);
    expect(feed.nearby[0].line).toMatch(/indoors/);
    const view = feed.nearby.find((row) => row.spot.id === 'spot-ensign');
    expect(view).toBeTruthy();
    expect(view!.score).toBeLessThan(feed.nearby[0].score);
  });

  it('ranks a sunset view above a library in golden hour', () => {
    const now = new Date('2026-09-29T00:40:00Z'); // 18:40 MDT, ~35 min before 19:15 sunset
    const feed = buildPlacesFeed({
      now,
      origin: SLC_ANCHOR,
      radiusMi: 30,
      sort: 'sky',
      mode: 'everyone',
      placeKind: 'all',
      weather: sky({ kind: 'clear' }),
      includeFar: false,
    });
    const living = feed.nearby.find((row) => row.spot.id === 'spot-living-room');
    const library = feed.nearby.find((row) => row.spot.id === 'spot-library');
    expect(living?.line).toBe('Sunset is the hour');
    expect(living!.score).toBeGreaterThan(library!.score);
  });

  it('hides Club X in family and keeps watershed stewardship off a swim', () => {
    const now = new Date('2026-09-28T18:00:00Z');
    const family = buildPlacesFeed({
      now,
      origin: SLC_ANCHOR,
      radiusMi: 200,
      sort: 'nearest',
      mode: 'family',
      placeKind: 'all',
      weather: sky({ kind: 'clear' }),
    });
    const rows = [...family.nearby, ...family.farther];
    expect(rows.some((row) => row.spot.id === 'spot-clubx')).toBe(false);
    expect(rows.every((row) => row.spot.rating === 'family')).toBe(true);
    const matureWithPhoto: EvergreenSpot = {
      ...SPOTS.find((spot) => spot.id === 'spot-liberty')!,
      id: 'spot-mature-photo',
      rating: 'mature',
      venue: 'Liberty Park',
    };
    expect(venuePhotoFor(matureWithPhoto.venue)).not.toBeNull();
    const hidden = buildPlacesFeed({
      now,
      origin: SLC_ANCHOR,
      radiusMi: 200,
      sort: 'nearest',
      mode: 'family',
      placeKind: 'all',
      weather: sky({ kind: 'clear' }),
      spots: [matureWithPhoto],
    });
    expect([...hidden.nearby, ...hidden.farther]).toEqual([]);

    const watershed = SPOTS.filter(isWatershed);
    expect(watershed.map((spot) => spot.id).sort()).toEqual([
      'spot-cecret',
      'spot-donut-falls',
      'spot-silver-lake',
    ]);
    for (const spot of watershed) {
      const row = rows.find((item) => item.spot.id === spot.id);
      expect(row?.spot.stewardship).toMatch(/No swimming/);
      expect(row?.line.toLowerCase()).not.toMatch(/swim/);
    }
    const pineview = [...family.nearby, ...family.farther].find((row) => row.spot.id === 'spot-pineview');
    expect(pineview?.spot.description.toLowerCase()).toMatch(/swimming/);
    expect(pineview?.line.toLowerCase()).not.toMatch(/cottonwood/);
  });

  it('lets everyone see Pineview swimming and still hides Club X', () => {
    const feed = buildPlacesFeed({
      now: new Date('2026-09-28T20:00:00Z'),
      origin: SLC_ANCHOR,
      radiusMi: 200,
      sort: 'nearest',
      mode: 'everyone',
      placeKind: 'water',
      weather: sky({ kind: 'clear', temperatureF: 75 }),
    });
    const rows = [...feed.nearby, ...feed.farther];
    expect(rows.some((row) => row.spot.id === 'spot-pineview')).toBe(true);
    expect(rows.some((row) => row.spot.id === 'spot-clubx')).toBe(false);
    expect(rows.find((row) => row.spot.id === 'spot-donut-falls')?.line.toLowerCase()).not.toMatch(/swim/);
  });

  it('is empty when the query matches nothing, and weather keeps an all-poor list', () => {
    const now = new Date('2026-09-28T20:00:00Z');
    const none = buildPlacesFeed({
      now,
      origin: SLC_ANCHOR,
      radiusMi: 25,
      sort: 'sky',
      mode: 'family',
      placeKind: 'all',
      query: 'zzzz-not-a-place',
      weather: sky({ kind: 'clear' }),
    });
    expect(none.nearby).toHaveLength(0);
    expect(none.farther).toHaveLength(0);

    const storm = buildPlacesFeed({
      now,
      origin: SLC_ANCHOR,
      radiusMi: 8,
      sort: 'sky',
      mode: 'family',
      placeKind: 'view',
      weather: sky({ kind: 'thunder', windMph: 40, temperatureF: 30 }),
      includeFar: false,
    });
    expect(skyList(storm.nearby, 'sky')).toEqual(storm.nearby);
    expect(storm.nearby.length).toBeGreaterThan(0);
    expect(storm.nearby.length).toBeGreaterThan(0);
  });
});
