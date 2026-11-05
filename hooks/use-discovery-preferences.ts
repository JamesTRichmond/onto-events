import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_RADIUS_MI, parseRadius, parseSort } from '@/lib/discovery-preferences';
import { getItem, setItem, STORAGE_KEYS } from '@/lib/storage';

/** Existing manifest keys only; a tap while loading always wins. */
export function useDiscoveryPreferences() {
  const [radiusMi, setRadius] = useState(DEFAULT_RADIUS_MI);
  const [sort, setSort] = useState<ReturnType<typeof parseSort>>('soonest');
  // Cards wait on this. The 1-mile default must not paint, then swap.
  const [loaded, setLoaded] = useState(false);
  const dirty = useRef({ radius: false, sort: false });
  useEffect(() => {
    let active = true;
    Promise.all([getItem(STORAGE_KEYS.feedRadius), getItem(STORAGE_KEYS.feedSort)])
      .then(([radius, savedSort]) => {
        if (!active) return;
        if (!dirty.current.radius) {
          const parsedRadius = parseRadius(radius);
          setRadius(parsedRadius ?? DEFAULT_RADIUS_MI);
          if (radius !== null && parsedRadius === null) {
            void setItem(STORAGE_KEYS.feedRadius, String(DEFAULT_RADIUS_MI));
          }
        }
        if (!dirty.current.sort) setSort(parseSort(savedSort));
        setLoaded(true);
      });
    return () => { active = false; };
  }, []);
  const chooseRadius = useCallback((radius: number) => {
    if (parseRadius(String(radius)) === null) return;
    dirty.current.radius = true;
    setRadius(radius);
    void setItem(STORAGE_KEYS.feedRadius, String(radius));
  }, []);
  const chooseSort = useCallback((next: ReturnType<typeof parseSort>) => {
    dirty.current.sort = true;
    setSort(next);
    void setItem(STORAGE_KEYS.feedSort, next);
  }, []);
  return { radiusMi, sort, chooseRadius, chooseSort, loaded };
}
