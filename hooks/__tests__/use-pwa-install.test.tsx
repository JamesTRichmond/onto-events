import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { InstallAppCard } from '@/components/ui/install-app-card';

import { usePwaInstall } from '../use-pwa-install';
import { installFakeWindow } from './web-window';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
beforeEach(async () => { await AsyncStorage.clear(); });

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function chromeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: jest.Mock;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('usePwaInstall', () => {
  it('native builds have nothing to install', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.state).toBe('unsupported');
  });

  describe('web app', () => {
    let fake: ReturnType<typeof installFakeWindow>;
    let platform: jest.ReplaceProperty<string>;
    afterEach(() => {
      platform.restore();
      fake.restore();
    });

    it('offers and runs Android Chrome install prompt saved before React loaded', async () => {
      fake = installFakeWindow();
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      const saved = chromeInstallPrompt();
      (fake.win as unknown as { __ontoInstallPrompt: unknown }).__ontoInstallPrompt = saved;

      const { result } = renderHook(() => usePwaInstall());
      expect(result.current.state).toBe('promptable');

      let accepted = false;
      await act(async () => {
        accepted = await result.current.install();
      });
      expect(saved.prompt).toHaveBeenCalledTimes(1);
      expect(accepted).toBe(true);
      // One prompt, shown once.
      expect(result.current.state).toBe('unsupported');
    });

    it('catches a prompt Chrome sends after the app loaded, and hides Chrome banner for it', () => {
      fake = installFakeWindow();
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      const { result } = renderHook(() => usePwaInstall());
      expect(result.current.state).toBe('unsupported');

      const late = chromeInstallPrompt();
      act(() => {
        fake.win.dispatchEvent(late);
      });
      expect(late.defaultPrevented).toBe(true);
      expect(result.current.state).toBe('promptable');

      act(() => {
        fake.win.dispatchEvent(new Event('appinstalled'));
      });
      expect(result.current.state).toBe('installed');
    });

    it('iPhone Safari gets the manual steps, no button', async () => {
      fake = installFakeWindow(IPHONE_SAFARI);
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      render(<InstallAppCard />);
      await waitFor(() => expect(screen.getByText('Tap Share (the square with an arrow).')).toBeTruthy());
      expect(screen.queryByLabelText('Install onto')).toBeNull();
    });

    it('the Account card installs on Android Chrome', async () => {
      fake = installFakeWindow();
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      const saved = chromeInstallPrompt();
      (fake.win as unknown as { __ontoInstallPrompt: unknown }).__ontoInstallPrompt = saved;
      render(<InstallAppCard />);
      await waitFor(() => expect(screen.getByLabelText('Install onto')).toBeTruthy());
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Install onto'));
      });
      expect(saved.prompt).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Tap the Chrome menu.')).toBeTruthy();
    });

    it.each([
      ['Android Chrome/140 EdgA/140', false],
      ['Android Chrome/140 SamsungBrowser/28', false],
      ['Other install-capable browser', false],
      ['Android Chrome/140 EdgA/140', true],
      ['Android Chrome/140 SamsungBrowser/28', true],
      ['Other install-capable browser', true],
    ] as const)('keeps the captured prompt for %s (first visit: %s)', async (ua, firstVisit) => {
      fake = installFakeWindow(ua);
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      const saved = chromeInstallPrompt('dismissed');
      (fake.win as unknown as { __ontoInstallPrompt: unknown }).__ontoInstallPrompt = saved;
      render(<InstallAppCard firstVisit={firstVisit} />);
      await waitFor(() => expect(screen.getByLabelText('Install onto')).toBeTruthy());
      expect(screen.queryByText('Tap the Chrome menu.')).toBeNull();
      await act(async () => { fireEvent.press(screen.getByLabelText('Install onto')); });
      expect(saved.prompt).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('install-app')).toBeNull();
    });

    it('synchronizes consumed and replacement prompts across both mounted cards', async () => {
      fake = installFakeWindow();
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      const saved = chromeInstallPrompt('dismissed');
      let finishChoice!: (choice: { outcome: string }) => void;
      saved.userChoice = new Promise(resolve => { finishChoice = resolve; });
      (fake.win as unknown as { __ontoInstallPrompt: unknown }).__ontoInstallPrompt = saved;
      render(<><InstallAppCard firstVisit /><InstallAppCard /></>);
      await waitFor(() => expect(screen.getAllByLabelText('Install onto')).toHaveLength(2));
      await act(async () => { fireEvent.press(screen.getAllByLabelText('Install onto')[0]); });
      // Both cards must stop offering the one-use prompt while the dialog is pending.
      expect(screen.queryAllByLabelText('Install onto')).toHaveLength(0);
      await act(async () => { finishChoice({ outcome: 'dismissed' }); });
      expect(saved.prompt).toHaveBeenCalledTimes(1);
      expect(screen.queryAllByLabelText('Install onto')).toHaveLength(0);
      const replacement = chromeInstallPrompt('dismissed');
      act(() => { fake.win.dispatchEvent(replacement); });
      await waitFor(() => expect(screen.getAllByLabelText('Install onto')).toHaveLength(2));
      await act(async () => { fireEvent.press(screen.getAllByLabelText('Install onto')[1]); });
      expect(replacement.prompt).toHaveBeenCalledTimes(1);
      expect(screen.queryAllByLabelText('Install onto')).toHaveLength(0);
    });

    it('shows first-visit tips once and remembers dismissal across mounts', async () => {
      fake = installFakeWindow(IPHONE_SAFARI);
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      const first = render(<InstallAppCard firstVisit />);
      await waitFor(() => expect(screen.getByLabelText('Dismiss install tip')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Dismiss install tip'));
      await waitFor(() => expect(screen.queryByTestId('install-app')).toBeNull());
      first.unmount();
      render(<InstallAppCard />);
      await act(async () => {});
      expect(screen.queryByTestId('install-app')).toBeNull();
    });

    it('does not repeat first-visit tips but leaves Account guidance available', async () => {
      fake = installFakeWindow(IPHONE_SAFARI);
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      const first = render(<InstallAppCard firstVisit />);
      await waitFor(() => expect(screen.getByTestId('install-app')).toBeTruthy());
      first.unmount();
      const next = render(<InstallAppCard firstVisit />);
      await act(async () => {});
      expect(screen.queryByTestId('install-app')).toBeNull();
      next.unmount();
      render(<InstallAppCard />);
      await waitFor(() => expect(screen.getByTestId('install-app')).toBeTruthy());
    });

    it('shows nothing once onto runs installed', () => {
      fake = installFakeWindow();
      fake.win.matchMedia = ((query: string) => ({ matches: query.includes('standalone'), media: query })) as never;
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      render(<InstallAppCard />);
      expect(screen.queryByTestId('install-app')).toBeNull();
    });
  });
});
