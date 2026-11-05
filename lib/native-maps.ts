import { Platform } from 'react-native';

/**
 * Whether this build can draw react-native-maps.
 *
 * iOS uses Apple Maps and needs nothing. Android uses the Google Maps SDK,
 * which needs an API key in the Android manifest; without one, mounting a
 * MapView crashes the app. app.json has no Android key yet, so an Android
 * build keeps maps off until whoever adds the key also builds with
 * EXPO_PUBLIC_ANDROID_MAPS=on. The web build never uses react-native-maps
 * (its maps are the *.web.tsx Leaflet files), so this answer is not used there.
 */
export function nativeMapsReady(
  platform: string = Platform.OS,
  androidFlag: string | undefined = process.env.EXPO_PUBLIC_ANDROID_MAPS,
): boolean {
  if (platform === 'android') return androidFlag === 'on';
  return true;
}
