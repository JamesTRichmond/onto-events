import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SLC_ANCHOR } from '@/data/activities';

export type LocationFallbackReason =
  | 'permission-denied'
  | 'timeout'
  | 'unavailable'
  | null;

export type UserLocation = {
  lat: number;
  lng: number;
  source: 'gps' | 'fallback';
  loading: boolean;
  fallbackReason: LocationFallbackReason;
};

/** 0.1° grid (~11 km). Exact device coords never leave this module. */
export function roundToGrid(lat: number, lng: number): { lat: number; lng: number } {
  // Integer tenths: wrap lng into [-1800, 1800), clamp lat, `+ 0` drops -0.
  const t = (x: number) => Math.round(x * 10);
  const lngT = ((((t(lng) + 1800) % 3600) + 3600) % 3600) - 1800;
  const latT = Math.max(-900, Math.min(900, t(lat)));
  return { lat: latT / 10 + 0, lng: lngT / 10 + 0 };
}

const GRID_SLC = roundToGrid(SLC_ANCHOR.lat, SLC_ANCHOR.lng);

function fallback(fallbackReason: Exclude<LocationFallbackReason, null>): UserLocation {
  return {
    lat: GRID_SLC.lat,
    lng: GRID_SLC.lng,
    source: 'fallback',
    loading: false,
    fallbackReason,
  };
}

/** Handoff invariant (James, 2026-10-17): getting the fix times out at 4000ms max after Allow; reading the permission dialog is not timed. */
const GEO_TIMEOUT_MS = 4_000;

class LocationTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LocationTimeoutError('location timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type UserLocationState = UserLocation & {
  /**
   * Ask for one fresh fix now ("Find me"). Re-runs the permission request, so
   * an iOS "Allow Once" grant that has lapsed is offered again, in the
   * system's own words, instead of failing silently.
   */
  refresh: () => void;
};

/**
 * Device geolocation, rounded to a 0.1° grid before anything else sees it.
 * Exact coordinates never leave this hook (no storage, logs, share, or UI).
 * Preference persistence stays in use-location-choice (`"slc"` | `"device"`).
 *
 * `enabled` gates every permission request and fix: while it is false the
 * hook never touches Location, so a viewer who chose Salt Lake City or a pin
 * is not located at launch. Turning it on asks once; `refresh` asks once more.
 */
export function useUserLocation(enabled = true): UserLocationState {
  const [location, setLocation] = useState<UserLocation>({
    lat: GRID_SLC.lat,
    lng: GRID_SLC.lng,
    source: 'fallback',
    loading: true,
    fallbackReason: null,
  });
  // Each bump asks for one new fix; the count itself is never shown or kept.
  const [request, setRequest] = useState(0);
  const requestToken = useMemo(() => ({ enabled, request }), [enabled, request]);
  const [resultToken, setResultToken] = useState<object | null>(null);
  const refresh = useCallback(() => {
    setLocation((current) => ({ ...current, loading: true }));
    setRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const settle = (next: UserLocation) => {
      setLocation(next);
      setResultToken(requestToken);
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        // The viewer may have chosen a city or a pin while the prompt
        // was up: take no fix for a mode they have already left.
        if (cancelled) return;
        if (status !== 'granted') {
          settle(fallback('permission-denied'));
          return;
        }

        const position = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          GEO_TIMEOUT_MS,
        );
        if (!cancelled) {
          const grid = roundToGrid(position.coords.latitude, position.coords.longitude);
          settle({
            lat: grid.lat,
            lng: grid.lng,
            source: 'gps',
            loading: false,
            fallbackReason: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          settle(
            fallback(error instanceof LocationTimeoutError ? 'timeout' : 'unavailable'),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, request, requestToken]);

  // A previous successful fix cannot masquerade as the new request while
  // returning from a city or pin. It becomes eligible only when this request settles.
  return useMemo(
    () => ({
      ...location,
      loading: enabled && resultToken !== requestToken ? true : location.loading,
      refresh,
    }),
    [location, enabled, resultToken, requestToken, refresh],
  );
}
