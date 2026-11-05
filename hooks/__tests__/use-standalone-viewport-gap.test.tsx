import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useStandaloneViewportGap } from '../use-standalone-viewport-gap';

type Listener = () => void;

function installPhone(innerHeight: number) {
  const listeners: Record<string, Listener[]> = {};
  const props: Record<string, string> = {};
  const g = globalThis as any;
  const saved = { window: g.window, document: g.document, getComputedStyle: g.getComputedStyle };
  g.window = {
    navigator: { standalone: true },
    screen: { height: 932 },
    innerHeight,
    matchMedia: (q: string) => ({ matches: q.includes('standalone') || q.includes('portrait') }),
    addEventListener: (n: string, f: Listener) => (listeners[n] ??= []).push(f),
    removeEventListener: (n: string, f: Listener) => {
      listeners[n] = (listeners[n] ?? []).filter((x) => x !== f);
    },
  };
  g.document = {
    createElement: () => ({ style: {} }),
    body: { appendChild: () => undefined, removeChild: () => undefined },
    documentElement: { style: { setProperty: (k: string, v: string) => (props[k] = v) } },
  };
  g.getComputedStyle = () => ({ paddingTop: '59px' });
  return {
    props,
    listeners,
    restore: () => Object.assign(g, saved),
  };
}

describe('useStandaloneViewportGap', () => {
  let platform: jest.ReplaceProperty<string>;
  beforeEach(() => {
    platform = jest.replaceProperty(Platform, 'OS', 'web');
  });
  afterEach(() => platform.restore());

  it('publishes the measured 59px shortfall and removes its listeners', () => {
    const phone = installPhone(873);
    const { unmount } = renderHook(() => useStandaloneViewportGap());
    expect(phone.props['--onto-viewport-gap']).toBe('59px');
    expect(phone.listeners.resize).toHaveLength(1);
    unmount();
    expect(phone.listeners.resize).toHaveLength(0);
    phone.restore();
  });

  it('publishes 0px when the viewport is already full height', () => {
    const phone = installPhone(932);
    const { unmount } = renderHook(() => useStandaloneViewportGap());
    expect(phone.props['--onto-viewport-gap']).toBe('0px');
    unmount();
    phone.restore();
  });
});
