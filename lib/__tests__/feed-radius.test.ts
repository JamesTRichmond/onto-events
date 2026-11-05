import { DEFAULT_FEED_RADIUS_MI, parseFeedRadius } from '../feed-radius';

describe('parseFeedRadius', () => {
  it('restores saved choices and a custom distance, with a one-mile fresh default', () => {
    expect(parseFeedRadius('25')).toBe(25);
    expect(parseFeedRadius('1')).toBe(1);
    expect(parseFeedRadius('100')).toBe(100);
    expect(parseFeedRadius(null)).toBe(DEFAULT_FEED_RADIUS_MI);
    expect(parseFeedRadius('7')).toBe(7);
    expect(parseFeedRadius('7.5')).toBe(7.5);
    expect(parseFeedRadius('miles')).toBe(1);
  });
});
