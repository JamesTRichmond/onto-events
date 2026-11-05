import { FeedText } from '@/lib/feed-text';

describe('FeedText.display', () => {
  it('decodes entities and strips tags', () => {
    expect(FeedText.display("Fun Science Friday&#39;s ...<br>... &amp; more")).toBe(
      "Fun Science Friday's ... ... & more",
    );
    expect(FeedText.display('Disney On Ice&nbsp;<p>Find Your Hero</p>')).toBe(
      'Disney On Ice Find Your Hero',
    );
  });

  it('leaves plain prose alone and handles empty input', () => {
    expect(FeedText.display('Concert on the plaza')).toBe('Concert on the plaza');
    expect(FeedText.display('')).toBe('');
    expect(FeedText.display(null)).toBe('');
    expect(FeedText.display(undefined)).toBe('');
  });

  it('keeps unknown named entities rather than throwing', () => {
    expect(FeedText.display('hello &notarealentity; world')).toBe('hello &notarealentity; world');
  });

  it('strips AstroTots-style detail HTML so raw tags never paint', () => {
    expect(
      FeedText.display(
        'Join us for AstroTots!<br><strong>Ages 2–5</strong>&nbsp;at the planetarium.',
      ),
    ).toBe('Join us for AstroTots! Ages 2–5 at the planetarium.');
  });

  it('collapses double-encoded markup that survives a single strip→decode pass', () => {
    expect(FeedText.display('line one&lt;br&gt;line two')).toBe('line one line two');
    expect(FeedText.display('&lt;strong&gt;bold&lt;/strong&gt; copy')).toBe('bold copy');
    expect(FeedText.display('space&amp;nbsp;here')).toBe('space here');
  });
});
