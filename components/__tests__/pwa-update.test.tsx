import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { PwaUpdateBanner } from '../ui/pwa-update';
import { beginHandoff } from '@/lib/pwa-update';

test('takeover shows one banner; clicking waits for the handoff and reloads once', () => {
  const oldNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const sw = new EventTarget() as ServiceWorkerContainer;
  Object.defineProperty(sw, 'controller', { writable: true, value: {} });
  const reload = jest.fn();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: sw } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { reload } } });
  const platform = jest.replaceProperty(Platform, 'OS', 'web');
  try {
    const view = render(<PwaUpdateBanner />);
    expect(screen.queryByText('A newer onto is ready.')).toBeNull();
    act(() => { Object.assign(sw, { controller: {} }); sw.dispatchEvent(new Event('controllerchange')); });
    expect(screen.getAllByText('A newer onto is ready.')).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
    const end = beginHandoff();
    fireEvent.press(screen.getByLabelText('Reload onto'));
    expect(reload).not.toHaveBeenCalled();
    end();
    fireEvent.press(screen.getByLabelText("I've finished the handoff"));
    expect(reload).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Reload onto'));
    fireEvent.press(screen.getByLabelText('Reload onto'));
    expect(reload).toHaveBeenCalledTimes(1);
    view.unmount();
  } finally {
    platform.restore();
    for (const [key, descriptor] of [['navigator', oldNav], ['window', oldWindow]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
