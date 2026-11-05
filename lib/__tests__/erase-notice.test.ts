import { stashEraseNotice, takeEraseNotice } from '../erase-notice';

describe('erase notice stash', () => {
  it('returns null when nothing is stashed', () => {
    expect(takeEraseNotice()).toBeNull();
  });

  it('hands a stashed message to exactly one taker', () => {
    stashEraseNotice('stashed message');

    expect(takeEraseNotice()).toBe('stashed message');
    expect(takeEraseNotice()).toBeNull();
  });
});
