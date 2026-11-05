import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { beginHandoff } from '@/lib/pwa-update';
import { installState, type InstallState } from '@/lib/pwa-install';

/** Chrome's install event (Android Chrome, desktop Chrome and Edge). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const PROMPT_CHANGED = 'onto:install-prompt-changed';

type InstallWindow = Window & { __ontoInstalled?: boolean; __ontoInstallPrompt?: InstallPromptEvent };

function readState(win: InstallWindow): InstallState {
  if (win.__ontoInstalled) return 'installed';
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return installState({
    displayModeStandalone: Boolean(win.matchMedia?.('(display-mode: standalone)').matches),
    navigatorStandalone: nav.standalone,
    hasDeferredPrompt: Boolean(win.__ontoInstallPrompt),
    userAgent: nav.userAgent ?? '',
  });
}

/**
 * Install onto to the home screen from inside the app.
 *
 * app/+html.tsx catches Chrome's beforeinstallprompt before React loads and
 * calls preventDefault, which hides Chrome's own install banner on Android.
 * This hook is the other half: it offers that saved prompt behind onto's own
 * button. On iPhone Safari there is no prompt to show, so it reports
 * 'ios-manual' and the screen explains Share, then Add to Home Screen.
 * Native builds always report 'unsupported'.
 */
export function usePwaInstall(): { state: InstallState; install: () => Promise<boolean> } {
  const [state, setState] = useState<InstallState>('unsupported');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const win = window as InstallWindow;
    const refresh = () => setState(readState(win));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      win.__ontoInstallPrompt = event as InstallPromptEvent;
      refresh();
    };
    const onInstalled = () => {
      win.__ontoInstalled = true;
      win.__ontoInstallPrompt = undefined;
      setState('installed');
    };
    const media = win.matchMedia?.('(display-mode: standalone)');
    media?.addEventListener?.('change', refresh);
    refresh();
    win.addEventListener('beforeinstallprompt', onPrompt);
    win.addEventListener('appinstalled', onInstalled);
    win.addEventListener(PROMPT_CHANGED, refresh);
    return () => {
      win.removeEventListener('beforeinstallprompt', onPrompt);
      win.removeEventListener('appinstalled', onInstalled);
      win.removeEventListener(PROMPT_CHANGED, refresh);
      media?.removeEventListener?.('change', refresh);
    };
  }, []);

  const install = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    const win = window as InstallWindow;
    const prompt = win.__ontoInstallPrompt;
    if (!prompt) {
      win.dispatchEvent(new Event(PROMPT_CHANGED));
      return false;
    }
    // A saved prompt can be shown once; Chrome sends a fresh one later if needed.
    win.__ontoInstallPrompt = undefined;
    // Every mounted card shares this one-use event. Remove all stale buttons
    // before opening the browser dialog, including while userChoice is pending.
    win.dispatchEvent(new Event(PROMPT_CHANGED));
    const finish = beginHandoff();
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      return outcome === 'accepted';
    } catch {
      return false;
    } finally {
      finish();
      win.dispatchEvent(new Event(PROMPT_CHANGED));
    }
  }, []);

  return { state, install };
}
