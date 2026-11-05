import { useCallback, useEffect, useRef, useState } from 'react';

import { cityById, DEFAULT_CITY_ID } from '@/data/cities';
import { DEFAULT_LOCATION_PREFERENCE, parseLocationPreference, type LocationPreference } from '@/lib/location-choice';
import { isValidSpot, type Spot } from '@/lib/pinned-spot';
import { regionForSpot } from '@/lib/service-region';
import { getItem, setItem, STORAGE_KEYS } from '@/lib/storage';

export type LocationChoice = 'device' | 'city' | 'pin';

/** Persist deliberate non-pin choices only. A pin survives renders, never reopening. */
export function useLocationChoice() {
  const [preference, setPreference] = useState<LocationPreference>(DEFAULT_LOCATION_PREFERENCE);
  const [pin, setPin] = useState<Spot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dirtyRef = useRef(false);
  const migrationRef = useRef(false);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await getItem(STORAGE_KEYS.locationChoice);
      const legacy = raw === null ? await getItem(STORAGE_KEYS.legacyLocationChoice) : null;
      if (cancelled) return;
      if (!dirtyRef.current) {
        setPreference(legacy === 'slc' ? { mode: 'city', cityId: DEFAULT_CITY_ID } : parseLocationPreference(raw));
        migrationRef.current = raw === null && (legacy === 'slc' || legacy === 'device');
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded || (!dirtyRef.current && !migrationRef.current)) return;
    migrationRef.current = false;
    // Serialize rapid choices so the last deliberate action wins in storage.
    const value = JSON.stringify(preference);
    writes.current = writes.current.then(() => setItem(STORAGE_KEYS.locationChoice, value));
  }, [preference, loaded]);

  const chooseCity = useCallback((id: string) => {
    const city = cityById(id);
    if (!city) return false;
    dirtyRef.current = true;
    setPin(null);
    setPreference({ mode: 'city', cityId: city.id });
    setLoaded(true);
    return true;
  }, []);
  const followDevice = useCallback(() => {
    dirtyRef.current = true;
    setPin(null);
    setPreference(previous => ({ ...previous, mode: 'device' }));
    setLoaded(true);
  }, []);
  const choosePin = useCallback((spot: Spot) => {
    if (!isValidSpot(spot) || !regionForSpot(spot)) return false;
    setPin({ lat: spot.lat, lng: spot.lng });
    setLoaded(true);
    return true;
  }, []);

  return { preference, choice: (pin ? 'pin' : preference.mode) as LocationChoice, city: cityById(preference.cityId)!, pin, loaded, chooseCity, followDevice, choosePin };
}
