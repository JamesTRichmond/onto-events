/**
 * Pure install-capability detection for the web PWA.
 * Takes plain inputs so it is testable without a browser.
 */
export type InstallState = 'installed' | 'promptable' | 'ios-manual' | 'unsupported';

export type InstallSignals = {
  /** matchMedia('(display-mode: standalone)').matches */
  displayModeStandalone: boolean;
  /** iOS Safari's navigator.standalone */
  navigatorStandalone?: boolean;
  /** a beforeinstallprompt event has been captured */
  hasDeferredPrompt: boolean;
  userAgent: string;
};

export function isIosSafari(ua: string): boolean {
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function installState(s: InstallSignals): InstallState {
  if (s.displayModeStandalone || s.navigatorStandalone === true) return 'installed';
  if (s.hasDeferredPrompt) return 'promptable';
  if (isIosSafari(s.userAgent)) return 'ios-manual';
  return 'unsupported';
}

/** Browser-specific instructions; never describe another browser's menus. */
export function installSteps(ua: string, touchPoints = 0): readonly string[] {
  if (isIosSafari(ua) || (/Macintosh/.test(ua) && touchPoints > 1 && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)))
    return ['Tap Share (the square with an arrow).', 'Tap Add to Home Screen.'];
  if (/Android/.test(ua) && /Chrome\//.test(ua) && !/EdgA|OPR|SamsungBrowser/.test(ua))
    return ['Tap the Chrome menu.', 'Tap Add to Home screen or Install app.'];
  if (!/Android|iPhone|iPad|iPod/.test(ua) && /Chrome\/|Edg\//.test(ua) && !/OPR/.test(ua))
    return ['Use the install icon in the address bar, or open the browser menu.', 'Choose Install onto.'];
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Edg|OPR/.test(ua))
    return ['Open the File menu in Safari.', 'Choose Add to Dock.'];
  return [];
}
