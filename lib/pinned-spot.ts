import { getServiceRegion, regionForSpot } from '@/lib/service-region';

/**
 * Where the feed looks: the phone (one fix, on request), a spot the viewer
 * dropped on a map, or Salt Lake City by name. Pure decisions only; the screen
 * holds the pin in memory and never hands it to storage or the network
 * (SAFETY.md, location minimization; James, 2026-09-25: a pin lasts until
 * the app closes).
 */
export type Spot = { lat: number; lng: number };

export function timeZoneForSpot(spot: Spot): string | null {
  const id = regionForSpot(spot);
  return id ? getServiceRegion(id)?.timezone ?? null : null;
}

export type LookSource = 'device' | 'pin' | 'slc';

export function lookSource(pin: Spot | null, browsingSlc: boolean): LookSource {
  if (pin) return 'pin';
  return browsingSlc ? 'slc' : 'device';
}

/** A spot must be a real coordinate before the feed will look around it. */
export function isValidSpot(spot: Spot | null | undefined): spot is Spot {
  return (
    !!spot &&
    Number.isFinite(spot.lat) &&
    Number.isFinite(spot.lng) &&
    Math.abs(spot.lat) <= 90 &&
    Math.abs(spot.lng) <= 180
  );
}

export function isSupportedSpot(spot: Spot | null | undefined): spot is Spot {
  return isValidSpot(spot) && regionForSpot(spot) !== null;
}

export const LOOK_COPY = {
  findMe: 'my location',
  dropPin: 'choose location',
  slc: 'change city',
  displayFindMe: 'GPS',
  displayDropPin: 'Map Pin',
  displaySlc: 'City',
  sharePrompt: 'Share location (optional)',
  allowLocation: 'Allow',
  notNow: 'Not now',
  narrowOnMap: 'Narrow it down: choose a spot on the map',
  deviceNote: 'Your location is used once, on this phone, to sort by distance. Never saved or sent.',
  pinNote: 'Looking around your pin. Forgotten when you close onto.',
} as const;

export const PIN_PICKER_COPY = {
  prompt: 'Tap the map where you want onto to look. Your own location is not used.',
  privacy: 'This spot stays on this phone and is forgotten when you close onto.',
  confirm: 'Use this location',
  unsupported: 'This location is outside available regions. Choose another point.',
  webPrivacy: 'Your pin stays here until you close onto. The map provider receives the map area you view.',
} as const;
