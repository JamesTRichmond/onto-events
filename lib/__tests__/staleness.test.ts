import { stalenessLabel } from '../staleness';

const NOW = Date.parse('2026-09-22T21:00:00Z');

describe('stalenessLabel (tip publish gate wrapper)', () => {
  it('stays quiet while the tip is fresh (at or under 48h)', () => {
    expect(stalenessLabel('2026-09-22T00:00:00Z', NOW)).toBeNull();
    expect(stalenessLabel('2026-09-20T21:00:00Z', NOW)).toBeNull();
  });

  it('forces the stale banner once bake age exceeds 48h', () => {
    expect(stalenessLabel('2026-09-20T20:00:00Z', NOW)).toBe(
      'Live events are stale — last updated 2 days ago',
    );
    expect(stalenessLabel('2026-09-17T21:00:00Z', NOW)).toBe(
      'Live events are stale — last updated 5 days ago',
    );
  });

  it('stays quiet with no timestamp, a bad timestamp, or during static render', () => {
    expect(stalenessLabel(undefined, NOW)).toBeNull();
    expect(stalenessLabel('whenever', NOW)).toBeNull();
    expect(stalenessLabel('2026-09-17T21:00:00Z', null)).toBeNull();
  });
});
