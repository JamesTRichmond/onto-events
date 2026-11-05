import { nextRadiusWithEvents, widenLabel } from '@/lib/widen-radius';

const CHOICES = [1, 2, 5, 10, 15, 25, 50, 100] as const;

describe('nextRadiusWithEvents', () => {
  it('returns the smallest wider choice that shows at least one card', () => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 5: 363, 10: 400 };
    expect(nextRadiusWithEvents(1, CHOICES, (mi) => counts[mi] ?? 0)).toEqual({ radiusMi: 5, count: 363 });
  });

  it('never suggests the current distance or a narrower one', () => {
    const asked: number[] = [];
    nextRadiusWithEvents(10, CHOICES, (mi) => { asked.push(mi); return 0; });
    expect(asked).toEqual([15, 25, 50, 100]);
  });

  it('returns null when no choice up to the largest shows anything', () => {
    expect(nextRadiusWithEvents(1, CHOICES, () => 0)).toBeNull();
  });

  it('stops at the first hit, so it never counts wider than it suggests', () => {
    const asked: number[] = [];
    nextRadiusWithEvents(1, CHOICES, (mi) => { asked.push(mi); return mi >= 2 ? 1 : 0; });
    expect(asked).toEqual([2]);
  });

  it('reads choices in ascending order whatever order they arrive in', () => {
    expect(nextRadiusWithEvents(1, [50, 5, 25], (mi) => (mi >= 5 ? 3 : 0))).toEqual({ radiusMi: 5, count: 3 });
  });

  it('starts above a custom distance between two choices', () => {
    expect(nextRadiusWithEvents(7.5, CHOICES, () => 2)).toEqual({ radiusMi: 10, count: 2 });
  });
});

describe('widenLabel', () => {
  it('names the distance and the honest count', () => {
    expect(widenLabel({ radiusMi: 5, count: 363 })).toBe('Widen to 5 mi · 363 events');
    expect(widenLabel({ radiusMi: 2, count: 1 })).toBe('Widen to 2 mi · 1 event');
  });
});
