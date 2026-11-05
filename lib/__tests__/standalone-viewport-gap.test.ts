import { standaloneViewportGap, type ViewportGapInput } from '../standalone-viewport-gap';

// Measured on an iPhone home-screen app, iOS 18.7.
const measured: ViewportGapInput = {
  standalone: true,
  portrait: true,
  screenHeight: 932,
  innerHeight: 873,
  safeTop: 59,
};

describe('standaloneViewportGap', () => {
  it('returns the shortfall when it equals the top inset (positive control)', () => {
    expect(standaloneViewportGap(measured)).toBe(59);
  });

  it('tolerates a pixel of rounding', () => {
    expect(standaloneViewportGap({ ...measured, innerHeight: 874 })).toBe(58);
  });

  it('leaves a Safari tab alone', () => {
    expect(standaloneViewportGap({ ...measured, standalone: false })).toBe(0);
  });

  it('leaves landscape alone', () => {
    expect(standaloneViewportGap({ ...measured, portrait: false })).toBe(0);
  });

  it('leaves a desktop window alone (no inset, no shortfall)', () => {
    expect(
      standaloneViewportGap({ standalone: true, portrait: true, screenHeight: 900, innerHeight: 900, safeTop: 0 }),
    ).toBe(0);
  });

  it('leaves a correctly sized viewport alone once iOS is fixed', () => {
    expect(standaloneViewportGap({ ...measured, innerHeight: 932 })).toBe(0);
  });

  it('ignores a shortfall that is not the top inset (keyboard, toolbar)', () => {
    expect(standaloneViewportGap({ ...measured, innerHeight: 600 })).toBe(0);
  });
});
