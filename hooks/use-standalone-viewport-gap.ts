import { useEffect } from 'react';
import { Platform } from 'react-native';

import { standaloneViewportGap } from '@/lib/standalone-viewport-gap';

const VAR = '--onto-viewport-gap';

/** Reads the top safe-area inset in px through a throwaway probe element. */
function readSafeTop(doc: Document): number {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
  doc.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  doc.body.removeChild(probe);
  return px;
}

/**
 * Publishes the home-screen viewport shortfall as a CSS variable on <html>;
 * app/+html.tsx adds it to the root height. Web only; native does nothing.
 */
export function useStandaloneViewportGap(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const apply = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const gap = standaloneViewportGap({
        standalone:
          nav.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches),
        portrait: Boolean(window.matchMedia?.('(orientation: portrait)').matches),
        screenHeight: window.screen.height,
        innerHeight: window.innerHeight,
        safeTop: readSafeTop(document),
      });
      document.documentElement.style.setProperty(VAR, `${gap}px`);
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}
