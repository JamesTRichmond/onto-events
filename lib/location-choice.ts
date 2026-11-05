import { cityById, DEFAULT_CITY_ID, type CityId } from '@/data/cities';
import type { UserLocation } from '@/hooks/use-user-location';
import { isValidSpot, timeZoneForSpot, type Spot } from '@/lib/pinned-spot';
import { regionForSpot, type ServiceRegionId } from '@/lib/service-region';

export type LocationPreference = { mode: 'device' | 'city'; cityId: CityId };
export const DEFAULT_LOCATION_PREFERENCE: LocationPreference = { mode: 'device', cityId: DEFAULT_CITY_ID };

/** Storage can name a launched city; it can never supply coordinates. */
export function parseLocationPreference(raw: string | null): LocationPreference {
  try {
    const value = raw ? JSON.parse(raw) : null;
    const city = cityById(value?.cityId);
    if (city && (value.mode === 'device' || value.mode === 'city')) return { mode: value.mode, cityId: city.id };
  } catch { /* Invalid stored bytes use the first-install choice. */ }
  return DEFAULT_LOCATION_PREFERENCE;
}

export type LocationOrigin = Spot & {
  source: 'device' | 'city' | 'pin';
  label: string;
  serviceRegion: ServiceRegionId;
  timeZone: string;
};
export type ResolvedLocation =
  | { status: 'ready'; origin: LocationOrigin }
  | { status: 'loading' | 'unavailable' | 'unsupported'; origin: null };

/** One eligible origin supplies every consumer. A fallback coordinate is never GPS. */
export function resolveLocationOrigin(preference: LocationPreference, pin: Spot | null, device: UserLocation, loaded: boolean): ResolvedLocation {
  if (!loaded) return { status: 'loading', origin: null };
  if (!pin && preference.mode === 'city') {
    const city = cityById(preference.cityId);
    if (!city) return { status: 'unsupported', origin: null };
    return { status: 'ready', origin: { lat: city.anchor.lat, lng: city.anchor.lng, source: 'city', label: city.name, serviceRegion: city.serviceRegion, timeZone: city.timeZone } };
  }
  if (!pin && device.loading) return { status: 'loading', origin: null };
  if (!pin && (device.source !== 'gps' || !isValidSpot(device))) return { status: 'unavailable', origin: null };
  const spot = pin ?? device;
  const serviceRegion = isValidSpot(spot) ? regionForSpot(spot) : null;
  const timeZone = timeZoneForSpot(spot);
  if (!serviceRegion || !timeZone) return { status: 'unsupported', origin: null };
  return { status: 'ready', origin: { lat: spot.lat, lng: spot.lng, source: pin ? 'pin' : 'device', label: pin ? 'around your pin' : 'around your location', serviceRegion, timeZone } };
}
