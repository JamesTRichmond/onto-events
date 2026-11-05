/**
 * iPhone home-screen web apps report a layout viewport that is shorter than the
 * screen by exactly the top safe-area inset (measured on an iPhone, iOS 18.7:
 * screen 932, innerHeight 873, top inset 59). The page is drawn under the
 * status bar but sized as if it were not, so a dead strip shows below the tab
 * bar. This returns how many pixels to add to the root height.
 *
 * It returns 0 unless the shortfall matches the top inset, so a browser tab,
 * a desktop window, landscape, or a future iOS that sizes the viewport
 * correctly is left alone.
 */
export const GAP_TOLERANCE_PX = 2;

export type ViewportGapInput = {
  standalone: boolean;
  portrait: boolean;
  screenHeight: number;
  innerHeight: number;
  safeTop: number;
};

export function standaloneViewportGap(input: ViewportGapInput): number {
  const { standalone, portrait, screenHeight, innerHeight, safeTop } = input;
  if (!standalone || !portrait) return 0;
  if (!(safeTop > 0)) return 0;
  const gap = screenHeight - innerHeight;
  return Math.abs(gap - safeTop) <= GAP_TOLERANCE_PX ? gap : 0;
}
