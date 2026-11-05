import { Alert, Platform } from 'react-native';

import { installFakeWindow } from '@/hooks/__tests__/web-window';

import { confirmThen } from '../confirm';
import { deviceNoun } from '../device-noun';
import { directionsUrl } from '../links';
import { nativeMapsReady } from '../native-maps';

describe('device wording', () => {
  it('says iPhone only on the iOS app', () => {
    expect(deviceNoun('ios')).toBe('iPhone');
    expect(deviceNoun('android')).toBe('device');
    expect(deviceNoun('web')).toBe('device');
  });
});

describe('native maps', () => {
  it('stay on for iOS and off for Android until a Google Maps key ships', () => {
    expect(nativeMapsReady('ios', '')).toBe(true);
    expect(nativeMapsReady('android', '')).toBe(false);
    expect(nativeMapsReady('android', 'on')).toBe(true);
  });
});

describe('Android directions', () => {
  it('hands the venue to the phone maps app through geo:, label intact', () => {
    expect(directionsUrl(35.59, -82.55, 'The Complex (Rockwell)', 'android')).toBe(
      'geo:35.59,-82.55?q=35.59,-82.55(The%20Complex%20%28Rockwell%29)',
    );
  });
});

describe('confirmThen', () => {
  const request = (onConfirm: jest.Mock) => ({
    title: 'Erase local data?',
    message: 'This removes interests.',
    confirmLabel: 'Erase',
    onConfirm,
  });

  it('native: a platform alert with Cancel first and the action behind the destructive button', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onConfirm = jest.fn().mockResolvedValue('done');
    confirmThen(request(onConfirm));
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Erase', 'destructive'],
    ]);
    expect(onConfirm).not.toHaveBeenCalled();
    await expect(buttons[1].onPress?.()).resolves.toBe('done');
    alert.mockRestore();
    platform.restore();
  });

  describe('web app (Alert.alert is empty in react-native-web)', () => {
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

    it('asks with the browser dialog and runs the action on OK', () => {
      const onConfirm = jest.fn();
      confirmThen(request(onConfirm));
      expect(fake.win.confirm).toHaveBeenCalledWith('Erase local data?\n\nThis removes interests.');
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('does nothing on Cancel', () => {
      (fake.win.confirm as jest.Mock).mockReturnValueOnce(false);
      const onConfirm = jest.fn();
      confirmThen(request(onConfirm));
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
