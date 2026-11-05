import { SEED_ACTIVITIES } from '../activities';
import { BUNDLED_ACTIVITIES } from '../bundled-activities';
import { LOCAL_ACTIVITIES } from '../local-events';
import { isTicketSeller } from '../source-trust';

describe('BUNDLED_ACTIVITIES', () => {
  it('leads with local calendar listings, none from a ticket seller (James, 2026-10-07)', () => {
    expect(LOCAL_ACTIVITIES.length).toBeGreaterThan(0);
    expect(BUNDLED_ACTIVITIES.slice(0, LOCAL_ACTIVITIES.length)).toEqual(LOCAL_ACTIVITIES);
    expect(LOCAL_ACTIVITIES.some(isTicketSeller)).toBe(false);
  });

  it('ships only sourced live listings, never the demo seed', () => {
    const seedIds = new Set(SEED_ACTIVITIES.map((activity) => activity.id));

    expect(BUNDLED_ACTIVITIES.length).toBeGreaterThan(0);
    for (const activity of BUNDLED_ACTIVITIES) {
      expect(seedIds.has(activity.id)).toBe(false);
      expect(activity.source).toBe('live');
      expect(activity.sourceUrl ?? activity.sourceName).toBeTruthy();
    }
  });

  it('keeps no undated listing that could read as happening now', () => {
    for (const activity of BUNDLED_ACTIVITIES) {
      expect(Number.isFinite(Date.parse(activity.startsAtIso ?? ''))).toBe(true);
    }
  });
});
