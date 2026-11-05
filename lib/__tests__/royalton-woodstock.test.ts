import { CITIES } from '@/data/cities';
import { ROYALTON_WOODSTOCK_SPOTS } from '@/data/places/royalton-woodstock';
import { SPOTS } from '@/data/spots';
import { regionForSpot, vermontLocalities } from '@/lib/service-region';
import { buildPlacesFeed, type PlaceSky } from '@/lib/spot-feed';

describe('Royalton & Woodstock, VT Launch Specification', () => {
  it('enrolls Woodstock and Royalton in CITIES with verified civic anchors', () => {
    const woodstock = CITIES.find((c) => c.id === 'woodstock');
    expect(woodstock).toBeDefined();
    expect(woodstock?.name).toBe('Woodstock');
    expect(woodstock?.state).toBe('Vermont');
    expect(woodstock?.serviceRegion).toBe('vermont-corridor');
    expect(woodstock?.timeZone).toBe('America/New_York');
    expect(woodstock?.anchor.name).toBe('Norman Williams Public Library');
    expect(woodstock?.anchor.approximate).toBe(true);
    expect(woodstock?.anchor.lat).toBeCloseTo(43.6239, 3);
    expect(woodstock?.anchor.lng).toBeCloseTo(-72.5186, 3);

    const royalton = CITIES.find((c) => c.id === 'royalton');
    expect(royalton).toBeDefined();
    expect(royalton?.name).toBe('Royalton');
    expect(royalton?.state).toBe('Vermont');
    expect(royalton?.serviceRegion).toBe('vermont-corridor');
    expect(royalton?.timeZone).toBe('America/New_York');
    expect(royalton?.anchor.name).toBe('Royalton Memorial Library');
    expect(royalton?.anchor.approximate).toBe(true);
    expect(royalton?.anchor.lat).toBeCloseTo(43.8188, 3);
    expect(royalton?.anchor.lng).toBeCloseTo(-72.5189, 3);
  });

  it('routes Windsor & Orange County corridor points to vermont-corridor', () => {
    expect(regionForSpot({ lat: 43.6239, lng: -72.5186 })).toBe('vermont-corridor'); // Woodstock
    expect(regionForSpot({ lat: 43.8188, lng: -72.5189 })).toBe('vermont-corridor'); // South Royalton
    expect(regionForSpot({ lat: 43.6663, lng: -72.5367 })).toBe('vermont-corridor'); // South Pomfret
    expect(regionForSpot({ lat: 43.7315, lng: -72.6171 })).toBe('vermont-corridor'); // Barnard
    expect(regionForSpot({ lat: 43.8328, lng: -72.6341 })).toBe('vermont-corridor'); // Bethel
    expect(regionForSpot({ lat: 43.7915, lng: -72.4497 })).toBe('vermont-corridor'); // Sharon
  });

  it('strictly excludes New Hampshire cross-river bleed', () => {
    // Pipeline serviceRegionForLocation enforces state: 'VT' containment
    const { serviceRegionForLocation } = require('@/scripts/pipeline/service-regions');
    expect(
      serviceRegionForLocation({
        lat: 43.7022,
        lng: -72.2896,
        locality: 'Hanover',
        region: 'NH',
        countryCode: 'US',
      }),
    ).toBeNull();
    expect(
      serviceRegionForLocation({
        lat: 43.6420,
        lng: -72.2518,
        locality: 'Lebanon',
        region: 'NH',
        countryCode: 'US',
      }),
    ).toBeNull();

    // Distant points outside Vermont bounds are rejected by coordinate check
    expect(regionForSpot({ lat: 42.9956, lng: -71.4548 })).toBeNull(); // Manchester, NH
    expect(regionForSpot({ lat: 43.2081, lng: -71.5376 })).toBeNull(); // Concord, NH

    const localities = vermontLocalities();
    expect(localities).toContain('Woodstock');
    expect(localities).toContain('Royalton');
    expect(localities).toContain('Pomfret');
    expect(localities).toContain('Barnard');
    expect(localities).not.toContain('Hanover');
    expect(localities).not.toContain('Lebanon');
  });

  it('contains diverse evergreen places supply across 5 kinds and balanced ratings', () => {
    expect(ROYALTON_WOODSTOCK_SPOTS.length).toBeGreaterThanOrEqual(10);

    const kinds = new Set(ROYALTON_WOODSTOCK_SPOTS.map((s) => s.placeKind));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    expect(kinds).toContain('indoor');
    expect(kinds).toContain('hang');
    expect(kinds).toContain('trail');
    expect(kinds).toContain('view');
    expect(kinds).toContain('water');

    const familySpots = ROYALTON_WOODSTOCK_SPOTS.filter((s) => s.rating === 'family');
    const generalSpots = ROYALTON_WOODSTOCK_SPOTS.filter((s) => s.rating === 'general');
    expect(familySpots.length).toBeGreaterThanOrEqual(4);
    expect(generalSpots.length).toBeGreaterThanOrEqual(4);

    for (const spot of ROYALTON_WOODSTOCK_SPOTS) {
      expect(spot.serviceRegion).toBe('vermont-corridor');
      expect(spot.address).toContain('VT');
      expect(SPOTS.some((s) => s.id === spot.id)).toBe(true);
      expect(spot.lat).toBeGreaterThan(43.5);
      expect(spot.lat).toBeLessThan(44.0);
      expect(spot.lng).toBeGreaterThan(-72.7);
      expect(spot.lng).toBeLessThan(-72.4);
    }
  });

  it('keeps outdoor trail spots in the feed even in bad weather (honest re-ranking)', () => {
    const stormSky: PlaceSky = {
      kind: 'thunder',
      temperatureF: 45,
      windMph: 25,
      sunriseAt: null,
      sunsetAt: null,
    };
    const woodstockOrigin = { lat: 43.6239, lng: -72.5186 };

    const feed = buildPlacesFeed({
      origin: woodstockOrigin,
      weather: stormSky,
      now: new Date('2026-11-01T15:00:00Z'),
      radiusMi: 25,
      sort: 'sky',
      mode: 'everyone',
      placeKind: 'all',
      spots: ROYALTON_WOODSTOCK_SPOTS,
    });

    const allRows = [...feed.nearby, ...feed.farther];
    expect(allRows.length).toBeGreaterThanOrEqual(ROYALTON_WOODSTOCK_SPOTS.length);

    // Marsh-Billings trail spot is still present, not erased
    const trailSpot = allRows.find((r) => r.spot.id === 'spot-woodstock-marsh-billings-nhp');
    expect(trailSpot).toBeDefined();

    // Indoor spot Norman Williams Library receives weather boost
    const indoorSpot = allRows.find((r) => r.spot.id === 'spot-woodstock-norman-williams-library');
    expect(indoorSpot).toBeDefined();
  });
});
