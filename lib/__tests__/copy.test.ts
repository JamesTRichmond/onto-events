import { EMPTY_FEED_LINE, JOIN_PROMPT, TAGLINE } from '../copy';

describe('locked copy', () => {
  it('locks the tagline James chose', () => {
    expect(TAGLINE).toBe('things to do near you');
    expect(TAGLINE.length).toBeLessThanOrEqual(30);
  });

  it('locks the join prompt and never says Get onto it', () => {
    expect(JOIN_PROMPT).toBe('onto this activity?');
    expect(JOIN_PROMPT.toLowerCase()).not.toMatch(/get onto it/);
    expect(TAGLINE.toLowerCase()).not.toMatch(/get onto it/);
  });

  it('locks the empty-feed line James picked, lowercase, no period', () => {
    expect(EMPTY_FEED_LINE).toBe('onto the next thing');
    expect(EMPTY_FEED_LINE.toLowerCase()).not.toMatch(/get onto/);
  });
});
