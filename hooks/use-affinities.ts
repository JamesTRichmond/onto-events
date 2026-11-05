import { useCallback, useEffect, useRef, useState } from 'react';

import { ActivityCategory } from '@/data/activities';
import {
  AffinitySignal,
  AffinityWeights,
  decayWeights,
  mergeWeights,
  parseAffinityState,
  recordSignal,
} from '@/lib/affinity';
import { getItem, setItem, STORAGE_KEYS } from '@/lib/storage';

/**
 * Persisted on-device category affinities. Decay is applied once at load
 * (based on the stored timestamp), so idle time between sessions fades old
 * taste without any background work.
 */
export function useAffinities() {
  const [weights, setWeights] = useState<AffinityWeights>({});
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await getItem(STORAGE_KEYS.affinities);
      if (cancelled) return;

      let decayed: AffinityWeights = {};
      if (raw) {
        const state = parseAffinityState(raw);
        const elapsedDays = (Date.now() - Date.parse(state.updatedAt)) / 86_400_000;
        decayed = decayWeights(state.weights, elapsedDays);
      }

      setWeights((prev) => {
        const pendingCount = Object.keys(prev).length;
        if (pendingCount === 0 && !raw) return prev;
        // Additive: a signal recorded before the load adds to stored taste
        // rather than overwriting it, and is written back so it survives.
        const merged = mergeWeights(decayed, prev);
        if (raw || pendingCount > 0) {
          setItem(
            STORAGE_KEYS.affinities,
            JSON.stringify({ weights: merged, updatedAt: new Date().toISOString() })
          );
        }
        return merged;
      });
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const record = useCallback((category: ActivityCategory, signal: AffinitySignal, direction: 1 | -1 = 1) => {
    setWeights((prev) => {
      const next = recordSignal(prev, category, signal, direction);
      if (loadedRef.current) {
        setItem(
          STORAGE_KEYS.affinities,
          JSON.stringify({ weights: next, updatedAt: new Date().toISOString() })
        );
      }
      return next;
    });
  }, []);

  return { weights, record };
}
