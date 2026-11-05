import { StockFreshness } from '../stock-freshness';

const NOW = Date.parse('2026-09-22T21:00:00Z');

describe('StockFreshness last-refreshed (rule 2)', () => {
  it('always surfaces bake time once the clock is available', () => {
    const label = StockFreshness.lastRefreshedLabel('2026-09-22T12:00:00Z', NOW);
    expect(label).toMatch(/^Updated /);
    expect(label).toMatch(/Sep/);
  });

  it('stays quiet during static render or without a bake time', () => {
    expect(StockFreshness.lastRefreshedLabel('2026-09-22T12:00:00Z', null)).toBeNull();
    expect(StockFreshness.lastRefreshedLabel(undefined, NOW)).toBeNull();
    expect(StockFreshness.lastRefreshedLabel('nope', NOW)).toBeNull();
  });
});

describe('StockFreshness tip publish gate (rule 4)', () => {
  it('treats the tip as fresh at or under 48h', () => {
    expect(StockFreshness.tipStaleBanner('2026-09-22T00:00:00Z', NOW)).toBeNull();
    expect(StockFreshness.tipStaleBanner('2026-09-20T21:00:00Z', NOW)).toBeNull(); // exactly 48h
    expect(StockFreshness.TIP_STALE_HOURS).toBe(48);
  });

  it('forces a stale banner once GENERATED_AT age exceeds 48h', () => {
    expect(StockFreshness.tipStaleBanner('2026-09-20T20:00:00Z', NOW)).toBe(
      'Live events are stale — last updated 2 days ago',
    );
    expect(StockFreshness.tipStaleBanner('2026-09-17T21:00:00Z', NOW)).toBe(
      'Live events are stale — last updated 5 days ago',
    );
  });
});

describe('StockFreshness past + radius (rule 1)', () => {
  it('auto-drops past live events past the grace window', () => {
    expect(
      StockFreshness.isNotPast({ startsAtIso: 'x' }, NOW, -StockFreshness.PAST_GRACE_MINUTES),
    ).toBe(false);
    expect(StockFreshness.isNotPast({ startsAtIso: 'x' }, NOW, -30)).toBe(true);
    expect(StockFreshness.isNotPast({ startsAtIso: 'x', endsAtIso: new Date(NOW + 60_000).toISOString() }, NOW, -400)).toBe(
      true,
    );
    expect(StockFreshness.isNotPast({ startsAtIso: 'x', endsAtIso: new Date(NOW - 60_000).toISOString() }, NOW, -400)).toBe(
      false,
    );
  });

  it('keeps relative seeds and skips expiry during static render', () => {
    expect(StockFreshness.isNotPast({}, NOW, 0)).toBe(true);
    expect(StockFreshness.isNotPast({ startsAtIso: 'x' }, null, -999)).toBe(true);
  });

  it('applies radius with road-trip bypass', () => {
    expect(StockFreshness.inRadius(4, 5, 'music')).toBe(true);
    expect(StockFreshness.inRadius(6, 5, 'music')).toBe(false);
    expect(StockFreshness.inRadius(200, 5, 'roadtrip')).toBe(true);
  });
});

describe('StockFreshness honest empty (rule 3)', () => {
  it('only real schedules count toward now-window density', () => {
    expect(StockFreshness.countsTowardNowWindow({})).toBe(false);
    expect(StockFreshness.countsTowardNowWindow({ startsAtIso: '2026-09-22T22:00:00Z' })).toBe(true);
    expect(
      StockFreshness.countsTowardNowWindow({
        recurrence: { days: [6], startHour: 8, endHour: 14 },
      }),
    ).toBe(true);
  });
});
