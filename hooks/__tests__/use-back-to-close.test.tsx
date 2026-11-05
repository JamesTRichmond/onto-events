import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useBackToClose } from '../use-back-to-close';
import { installFakeWindow } from './web-window';

const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 5)));

describe('useBackToClose', () => {
  it('leaves native builds alone: their Back already reaches onRequestClose', () => {
    const onClose = jest.fn();
    const { unmount } = renderHook(() => useBackToClose(true, onClose));
    unmount();
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('on the web app (Android Chrome Back is history.back)', () => {
    let fake: ReturnType<typeof installFakeWindow>;
    let platform: jest.ReplaceProperty<string>;
    beforeEach(() => {
      fake = installFakeWindow();
      platform = jest.replaceProperty(Platform, 'OS', 'web');
    });
    afterEach(() => {
      platform.restore();
      fake.restore();
    });

    it('Back closes the open sheet instead of leaving onto', async () => {
      const onClose = jest.fn();
      renderHook(() => useBackToClose(true, onClose));
      expect(fake.win.history.length).toBe(2);
      // The sheet's entry keeps the router's own state, so the router is not confused.
      expect(fake.win.history.state).toMatchObject({ id: 'router-entry' });

      fake.win.history.back();
      await tick();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(fake.win.history.index).toBe(0);
    });

    it('closing with a button takes its history entry back off', async () => {
      const onClose = jest.fn();
      const { rerender } = renderHook(({ open }: { open: boolean }) => useBackToClose(open, onClose), {
        initialProps: { open: true },
      });
      expect(fake.win.history.index).toBe(1);

      rerender({ open: false });
      await tick();

      expect(fake.win.history.index).toBe(0);
      // Taking its own entry off is not a Back press: the caller already closed.
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a closed sheet adds nothing to history', () => {
      renderHook(() => useBackToClose(false, jest.fn()));
      expect(fake.win.history.length).toBe(1);
    });

    it('reopening after Back pushes one fresh entry', async () => {
      const onClose = jest.fn();
      const { rerender } = renderHook(({ open }: { open: boolean }) => useBackToClose(open, onClose), {
        initialProps: { open: true },
      });
      fake.win.history.back();
      await tick();
      rerender({ open: false });
      await tick();
      rerender({ open: true });
      expect(fake.win.history.index).toBe(1);
      expect(fake.win.history.length).toBe(2);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
