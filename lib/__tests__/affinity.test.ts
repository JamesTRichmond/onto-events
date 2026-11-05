import { affinityBoost, decayWeights, mergeWeights, parseAffinityState, recordSignal } from '../affinity';

describe('taste signals', () => {
  it('accumulates: joins beat action taps', () => {
    let w = recordSignal({}, 'music', 'join');
    w = recordSignal(w, 'outdoors', 'action');
    expect(w.music).toBe(1);
    expect(w.outdoors).toBe(0.5);
  });

  it('saturates at the cap', () => {
    let w: ReturnType<typeof recordSignal> = {};
    for (let i = 0; i < 30; i++) w = recordSignal(w, 'music', 'join');
    expect(w.music).toBe(10);
  });
});

describe('decay', () => {
  it('halves weights every 30 idle days', () => {
    const w = decayWeights({ music: 4 }, 30);
    expect(w.music).toBeCloseTo(2, 5);
  });

  it('prunes negligible weights to nothing', () => {
    expect(decayWeights({ music: 0.06 }, 30)).toEqual({});
  });

  it('leaves weights alone for zero or negative elapsed time', () => {
    expect(decayWeights({ music: 4 }, 0)).toEqual({ music: 4 });
    expect(decayWeights({ music: 4 }, -5)).toEqual({ music: 4 });
  });
});

describe('affinityBoost', () => {
  it('grows with weight but saturates below an explicit interest (120)', () => {
    expect(affinityBoost({}, 'music')).toBe(0);
    expect(affinityBoost({ music: 2 }, 'music')).toBe(36);
    expect(affinityBoost({ music: 10 }, 'music')).toBe(60);
    expect(affinityBoost({ music: 10 }, 'music')).toBeLessThan(120);
  });
});

describe('parseAffinityState', () => {
  it('round-trips a healthy state', () => {
    const raw = JSON.stringify({ weights: { music: 3 }, updatedAt: '2026-08-01T00:00:00Z' });
    expect(parseAffinityState(raw)).toEqual({
      weights: { music: 3 },
      updatedAt: '2026-08-01T00:00:00Z',
    });
  });

  it('drops unknown categories, bad values, and caps oversized weights', () => {
    const raw = JSON.stringify({
      weights: { music: 99, EVIL: 5, games: 'lots', sales: -2, outdoors: 1 },
      updatedAt: 'not-a-date',
    });
    const state = parseAffinityState(raw);
    expect(state.weights).toEqual({ music: 10, outdoors: 1 });
    expect(Date.parse(state.updatedAt)).toBe(0);
  });

  it('returns an empty taste for garbage', () => {
    expect(parseAffinityState('{nope').weights).toEqual({});
    expect(parseAffinityState('[1,2,3]').weights).toEqual({});
  });
});

describe('mergeWeights', () => {
  it('adds pending signals to stored taste instead of replacing it', () => {
    expect(mergeWeights({ music: 4 }, { music: 1 })).toEqual({ music: 5 });
  });

  it('keeps categories present on only one side', () => {
    expect(mergeWeights({ music: 4 }, { games: 1 })).toEqual({ music: 4, games: 1 });
  });

  it('respects the weight cap', () => {
    expect(mergeWeights({ music: 9.5 }, { music: 3 })).toEqual({ music: 10 });
  });

  it('is a no-op with nothing pending', () => {
    expect(mergeWeights({ music: 4 }, {})).toEqual({ music: 4 });
  });
});

describe('Discover deck signals (FEATURES.md §5)', () => {
  it('maps a maybe to +1 and a pass to -0.4', () => {
    expect(recordSignal({}, 'music', 'maybe')).toEqual({ music: 1 });
    expect(recordSignal({ music: 2 }, 'music', 'pass').music).toBeCloseTo(1.6, 6);
  });

  it('a pass wears taste down but never below neutral, and never leaves a negative weight', () => {
    expect(recordSignal({}, 'music', 'pass')).toEqual({});
    expect(recordSignal({ music: 0.3 }, 'music', 'pass')).toEqual({});
    let w = recordSignal({}, 'music', 'maybe');
    for (let i = 0; i < 10; i++) w = recordSignal(w, 'music', 'pass');
    expect(w.music).toBeUndefined();
    expect(affinityBoost(w, 'music')).toBe(0);
  });

  it('an undo takes the same signal back', () => {
    const kept = recordSignal({ music: 2 }, 'music', 'maybe');
    expect(recordSignal(kept, 'music', 'maybe', -1)).toEqual({ music: 2 });
    const passed = recordSignal({ music: 2 }, 'music', 'pass');
    expect(recordSignal(passed, 'music', 'pass', -1).music).toBeCloseTo(2, 6);
  });
});
