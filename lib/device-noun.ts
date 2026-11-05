import { Platform } from 'react-native';

/**
 * What onto calls the viewer's phone in copy. The iOS app says "iPhone"; every
 * other build (Android, and the web app on any phone) says "device", so an
 * Android owner is never told to erase "this iPhone".
 */
export function deviceNoun(platform: string = Platform.OS): string {
  return platform === 'ios' ? 'iPhone' : 'device';
}

export const DEVICE_NOUN = deviceNoun();
