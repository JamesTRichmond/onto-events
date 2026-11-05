import { Platform } from 'react-native';

import { directionsUrl } from '@/lib/links';

/**
 * Which maps app Directions opens (James, build 9 device pass, 2026-09-26):
 * the one the viewer picked in onto, otherwise the phone's own default.
 * 'system' is the phone's choice: Apple Maps on an iPhone in the US.
 *
 * Google Maps and Waze use their public https links. iOS hands those to the
 * app when it is installed and to the browser when it is not, so onto never
 * has to ask which apps are on the phone.
 */
export type MapsApp = 'system' | 'google' | 'waze';

export const MAPS_APPS: readonly MapsApp[] = ['system', 'google', 'waze'];

/**
 * 'system' is named for the phone it runs on: Apple Maps on an iPhone, the
 * maps app the owner set on Android (geo: link), Google Maps on the web.
 */
export function mapsAppLabels(platform: string = Platform.OS): Record<MapsApp, string> {
  return {
    system: platform === 'ios' ? 'iPhone default' : 'Phone default',
    google: 'Google Maps',
    waze: 'Waze',
  };
}

export const MAPS_APP_LABEL: Record<MapsApp, string> = mapsAppLabels();

/** Stored bytes are device state, not trusted input: unknown means system. */
export function parseMapsApp(raw: string | null | undefined): MapsApp {
  return raw === 'google' || raw === 'waze' ? raw : 'system';
}

export function directionsFor(
  app: MapsApp,
  lat: number,
  lng: number,
  label: string,
  platform?: string,
): string {
  switch (app) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    case 'waze':
      return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    default:
      return directionsUrl(lat, lng, label, platform);
  }
}
