import { useCallback, useEffect, useRef, useState } from 'react';

import { ActivityCategory, ALL_CATEGORIES } from '@/data/activities';
import { getItem, onOntoDataErased, setItem, STORAGE_KEYS } from '@/lib/storage';

/** Stored bytes are device state, not trusted input: keep only real categories. */
function parseStored(raw: string): ActivityCategory[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is ActivityCategory =>
      (ALL_CATEGORIES as string[]).includes(c as string)
    );
  } catch {
    return [];
  }
}

/**
 * The user's picked interest categories, persisted on-device
 * (AsyncStorage on native, localStorage on web).
 */
export function useInterests() {
  const [interests, setInterests] = useState<Set<ActivityCategory>>(new Set());
  const [loaded, setLoaded] = useState(false);
  // Only a user toggle makes the in-memory set authoritative. A plain load,
  // or a failed read, must never write back over what storage holds.
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let erased = false;
    const unsubscribeErase = onOntoDataErased(() => {
      erased = true;
      dirtyRef.current = false;
      setInterests(new Set());
    });
    (async () => {
      try {
        const raw = await getItem(STORAGE_KEYS.interests);
        if (!cancelled && !erased && raw) {
          const stored = parseStored(raw);
          // Union with anything toggled while the load was in flight, so a
          // fast first tap is neither reverted here nor clobbers storage.
          setInterests((prev) => new Set([...stored, ...prev]));
        }
      } catch {
        // Storage unavailable — run with empty interests.
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      unsubscribeErase();
    };
  }, []);

  // Persist outside the state updater (updaters must stay pure) and only
  // once the load has settled, so the merged set is what gets written.
  useEffect(() => {
    if (loaded && dirtyRef.current) {
      void setItem(STORAGE_KEYS.interests, JSON.stringify([...interests]));
    }
  }, [interests, loaded]);

  const toggle = useCallback((category: ActivityCategory) => {
    dirtyRef.current = true;
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  return { interests, toggle, loaded };
}
