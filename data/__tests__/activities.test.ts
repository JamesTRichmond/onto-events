import { milesBetween, travelFor, SEED_ACTIVITIES, SLC_ANCHOR } from '../activities';

describe('milesBetween', () => {
  it('returns 0 for identical points', () => {
    expect(milesBetween(SLC_ANCHOR.lat, SLC_ANCHOR.lng, SLC_ANCHOR.lat, SLC_ANCHOR.lng)).toBe(0);
  });

  it('matches the known distance from downtown SLC to Liberty Park (~1.5 mi)', () => {
    const d = milesBetween(SLC_ANCHOR.lat, SLC_ANCHOR.lng, 40.7434, -111.8746);
    expect(d).toBeGreaterThan(1.2);
    expect(d).toBeLessThan(1.8);
  });

  it('is symmetric', () => {
    const a = milesBetween(40.76, -111.89, 40.74, -111.87);
    const b = milesBetween(40.74, -111.87, 40.76, -111.89);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('travelFor', () => {
  it('walks short distances with a sane floor', () => {
    expect(travelFor(0.05)).toEqual({ mode: 'walk', minutes: 2 });
    expect(travelFor(1.0).mode).toBe('walk');
  });

  it('drives past the walk cutoff with a sane floor', () => {
    expect(travelFor(1.3).mode).toBe('drive');
    expect(travelFor(1.3).minutes).toBeGreaterThanOrEqual(5);
    expect(travelFor(20).minutes).toBeGreaterThan(travelFor(5).minutes);
  });
});

describe('seed data integrity', () => {
  it('has unique ids', () => {
    const ids = SEED_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has finite coordinates: metro items near SLC, road trips within driving country', () => {
    for (const a of SEED_ACTIVITIES) {
      expect(Number.isFinite(a.lat)).toBe(true);
      expect(Number.isFinite(a.lng)).toBe(true);
      const miles = milesBetween(SLC_ANCHOR.lat, SLC_ANCHOR.lng, a.lat, a.lng);
      if (a.category === 'roadtrip') {
        expect(miles).toBeGreaterThan(30);
        expect(miles).toBeLessThan(250);
      } else {
        expect(miles).toBeLessThan(30);
      }
    }
  });
});
