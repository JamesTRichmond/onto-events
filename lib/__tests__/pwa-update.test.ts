import { acknowledgeHandoff, beginHandoff, markDownloadHandoff, singleReload, watchUpdates } from '../pwa-update';
import { installSteps, installState } from '../pwa-install';

test('first worker claim is silent; replacements offer an update; cleanup detaches', () => {
  const sw = new EventTarget() as ServiceWorkerContainer;
  Object.defineProperty(sw, 'controller', { writable: true, value: null });
  const ready = jest.fn(); const stop = watchUpdates(sw, ready);
  Object.assign(sw, { controller: {} }); sw.dispatchEvent(new Event('controllerchange'));
  expect(ready).not.toHaveBeenCalled();
  Object.assign(sw, { controller: {} }); sw.dispatchEvent(new Event('controllerchange'));
  expect(ready).toHaveBeenCalledTimes(1);
  stop(); Object.assign(sw, { controller: {} }); sw.dispatchEvent(new Event('controllerchange'));
  expect(ready).toHaveBeenCalledTimes(1);
});
test('reload is explicit, waits for handoffs, and can execute only once', () => {
  const reload = jest.fn(); const request = singleReload(reload);
  expect(reload).not.toHaveBeenCalled();
  const end = beginHandoff(); expect(request()).toBe(false); end();
  markDownloadHandoff(); expect(request()).toBe(false);
  acknowledgeHandoff(); expect(request()).toBe(true); expect(request()).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
});
test.each([
  ['iPhone Safari', 'Share'], ['Android Chrome/140 Safari', 'Chrome menu'],
  ['Windows Chrome/140 Safari', 'install icon'], ['Windows Edg/140', 'install icon'],
  ['Macintosh Version/26 Safari', 'File menu'],
])('instructions match %s', (ua, text) => { expect(installSteps(ua).join(' ')).toContain(text); });
test('unsupported browsers get no misleading Safari instructions', () => {
  expect(installSteps('iPhone CriOS/140 Safari')).toEqual([]);
  expect(installSteps('Android Firefox/140')).toEqual([]);
});
test('both installed signals hide installation', () => {
  for (const displayModeStandalone of [true, false]) expect(installState({ displayModeStandalone, navigatorStandalone: true, hasDeferredPrompt: true, userAgent: 'iPhone Safari' })).toBe('installed');
});

test('open dialogs and hidden pages block reload without consuming the tap', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = { visibilityState: 'visible', querySelector: jest.fn((): object | null => ({})) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  try {
    const reload = jest.fn(); const request = singleReload(reload);
    expect(request()).toBe(false);
    doc.querySelector.mockReturnValue(null); doc.visibilityState = 'hidden';
    expect(request()).toBe(false);
    doc.visibilityState = 'visible'; expect(request()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
