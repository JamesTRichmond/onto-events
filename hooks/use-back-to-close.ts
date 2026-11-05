import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const MARK = '__ontoSheet';

/**
 * Web only: while a sheet is open, the browser's Back closes the sheet.
 *
 * On Android the system Back button (and the back swipe) is a history.back()
 * in Chrome and in the installed app. A React Native Modal on web is not in
 * history, so Back used to leave the screen — or, in the installed app with a
 * single history entry, close onto entirely — instead of closing the sheet.
 * Native Android already routes Back to the Modal's onRequestClose.
 *
 * Opening pushes one entry at the same URL; Back pops it and closes the sheet.
 * Closing any other way (the Close button, a scrim tap, a pick) takes that
 * entry back off, so history is left as it was found and the router never
 * sees an entry it did not make.
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (Platform.OS !== 'web' || !open || typeof window === 'undefined') return;
    const win = window;
    const { history } = win;
    if (!history || typeof history.pushState !== 'function') return;

    const mark = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    history.pushState({ ...(history.state ?? {}), [MARK]: mark }, '');
    let popped = false;
    const onPop = () => {
      // Still (or again) on this sheet's own entry: nothing to close.
      if (popped || history.state?.[MARK] === mark) return;
      popped = true;
      close.current();
    };
    win.addEventListener('popstate', onPop);
    return () => {
      win.removeEventListener('popstate', onPop);
      if (!popped && history.state?.[MARK] === mark) history.back();
    };
  }, [open]);
}
