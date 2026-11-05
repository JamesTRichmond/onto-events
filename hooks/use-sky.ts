import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { astronomyAt, type Astronomy } from '@/lib/sky/astronomy';
import { labelDay, type FeedDay } from '@/lib/sky/label-day';
import { computeSky, SKY_RAMPS, type SkyState, type SkyWeather, type WeatherKind } from '@/lib/sky/palette';

export type SkyPreview = {
  sunAltitude: number; rising: boolean; moonIllumination: number; weather?: WeatherKind;
  moonAltitude?: number; moonAzimuth?: number;
};
type SkyInput = {
  now: number | null; latitude: number; longitude: number; timeZone: string; placeId: string;
  override?: SkyPreview | null;
  /** The live weather word for this place, if one is known (use-weather). */
  weather?: SkyWeather | null;
};
type Snapshot = { astronomy: Astronomy | null; seed: string; day: FeedDay | null; minute: number | null };
const PENDING: Snapshot = { astronomy: null, seed: 'sky-pending', day: null, minute: null };
const PENDING_SKY: SkyState = {
  phase: 'night', colors: SKY_RAMPS.night, weather: 'unavailable',
  starDensity: 0, moonGlow: 0, animate: false,
};

/**
 * Local-only visual state. No timers, weather calls, persistence, or location
 * acquisition: live weather arrives already fetched, and the palette drops it
 * the moment it is stale or for another place (usableWeather).
 */
export function useSky({ now, latitude, longitude, timeZone, placeId, override, weather: live }: SkyInput) {
  const [active, setActive] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const retained = useRef<Snapshot>(PENDING);
  const minute = now !== null && Number.isFinite(now) ? Math.floor(now / 60_000) * 60_000 : null;

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const readMotion = () => {
      const request = ++revision;
      setReduceMotion(true); // Static until the OS explicitly permits motion.
      try {
        void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
          if (!disposed && request === revision) setReduceMotion(enabled !== false);
        }, () => { /* Remain static when the OS preference cannot be read. */ });
      } catch { /* A missing native capability must also remain static. */ }
    };
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (disposed) return;
      revision += 1; // A newer preference event wins over an older async read.
      setReduceMotion(enabled !== false);
    });
    const appSubscription = AppState.addEventListener('change', (state) => {
      if (disposed) return;
      setActive(state === 'active');
      if (state === 'active') readMotion();
    });
    setActive(AppState.currentState === 'active');
    if (AppState.currentState === 'active') readMotion();
    return () => {
      disposed = true;
      motionSubscription?.remove?.();
      appSubscription?.remove?.();
    };
  }, []);

  const snapshot = useMemo<Snapshot>(() => {
    if (!active) return retained.current;
    if (minute === null) return PENDING;
    try {
      const astronomy = astronomyAt(minute, { latitude, longitude });
      const day = labelDay(minute, timeZone);
      const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(minute);
      const civilDate = ['year', 'month', 'day'].map((part) => parts.find((item) => item.type === part)!.value).join('-');
      // A coarsened center and civil date stabilize decoration, never exact coordinates.
      return { astronomy, day, minute, seed: `${latitude.toFixed(2)},${longitude.toFixed(2)}|${civilDate}` };
    } catch { return PENDING; } // Bad clock/place/timezone must not crash discovery.
  }, [active, minute, latitude, longitude, timeZone]);
  useEffect(() => { retained.current = snapshot; }, [snapshot]);

  // Production ignores overrides even if a caller accidentally supplies one.
  const preview = __DEV__ ? override : null;
  const altitude = preview?.sunAltitude;
  const rising = preview?.rising;
  const illumination = preview?.moonIllumination;
  const moonAltitude = preview?.moonAltitude;
  const moonAzimuth = preview?.moonAzimuth;
  const weather = preview?.weather;
  const astronomy = useMemo(() => {
    if (!snapshot.astronomy || altitude === undefined || illumination === undefined
      || !Number.isFinite(altitude) || Math.abs(altitude) > 90
      || !Number.isFinite(illumination) || illumination < 0 || illumination > 1
      || (moonAltitude !== undefined && (!Number.isFinite(moonAltitude) || Math.abs(moonAltitude) > 90))
      || (moonAzimuth !== undefined && (!Number.isFinite(moonAzimuth) || moonAzimuth < 0 || moonAzimuth >= 360))
      || typeof rising !== 'boolean') return snapshot.astronomy;
    return {
      sun: { ...snapshot.astronomy.sun, altitude, rising, riseWeight: rising ? 1 : 0 },
      moon: { ...snapshot.astronomy.moon, illumination,
        altitude: moonAltitude ?? snapshot.astronomy.moon.altitude,
        azimuth: moonAzimuth ?? snapshot.astronomy.moon.azimuth },
    };
  }, [snapshot.astronomy, altitude, rising, illumination, moonAltitude, moonAzimuth]);
  const sky = useMemo(() => astronomy && snapshot.minute !== null ? computeSky({
    ...astronomy, now: snapshot.minute, placeId,
    weather: astronomy !== snapshot.astronomy && weather
      ? { kind: weather, placeId, observedAt: snapshot.minute } : live ?? null,
    reduceMotion: reduceMotion || !active,
  }) : PENDING_SKY, [astronomy, snapshot.minute, snapshot.astronomy, placeId, weather, live, reduceMotion, active]);

  return { sky, astronomy, seed: snapshot.seed, day: snapshot.day, reduceMotion, active };
}
