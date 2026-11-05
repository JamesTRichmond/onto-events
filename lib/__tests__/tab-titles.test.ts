import { TAB_TITLES } from '@/lib/tab-titles';

describe('tab titles', () => {
  it('names the saved-plans tab Plans (James, 2026-11-02)', () => {
    expect(TAB_TITLES.going).toBe('Plans');
  });

  it('never lets two tabs share a word stem, so "Going" cannot sit beside "Places To Go"', () => {
    const words = (title: string) => title.toLowerCase().split(/\s+/).filter((w) => w !== 'to');
    const titles = Object.values(TAB_TITLES);
    for (const a of titles) {
      for (const b of titles) {
        if (a === b) continue;
        for (const x of words(a)) {
          for (const y of words(b)) {
            expect({ pair: [a, b], clash: x.startsWith(y) || y.startsWith(x) }).toEqual({ pair: [a, b], clash: false });
          }
        }
      }
    }
  });
});
