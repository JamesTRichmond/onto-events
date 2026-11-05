/**
 * A small stand-in for the browser window, for hooks that only run on the
 * web build. Jest's React Native environment has no window, history or
 * matchMedia. history.back() fires popstate on a later task, as browsers do.
 */
export type FakeWindow = Window & {
  history: History & { entries: unknown[]; index: number };
};

export function installFakeWindow(userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36') {
  const target = new EventTarget();
  const entries: unknown[] = [{ id: 'router-entry' }];
  const history = {
    entries,
    index: 0,
    get length() {
      return entries.length;
    },
    get state() {
      return entries[history.index];
    },
    pushState(state: unknown) {
      entries.splice(history.index + 1);
      entries.push(state);
      history.index = entries.length - 1;
    },
    replaceState(state: unknown) {
      entries[history.index] = state;
    },
    back() {
      setTimeout(() => {
        if (history.index === 0) return;
        history.index -= 1;
        target.dispatchEvent(new Event('popstate'));
      }, 0);
    },
  };
  const win = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    history,
    navigator: { userAgent },
    matchMedia: (query: string) => ({ matches: false, media: query }),
    confirm: jest.fn(() => true),
  } as unknown as FakeWindow;
  const g = globalThis as unknown as { window?: unknown };
  const before = g.window;
  g.window = win;
  return {
    win,
    restore() {
      if (before === undefined) delete g.window;
      else g.window = before;
    },
  };
}
