import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { getItem, onOntoDataErased, STORAGE_KEYS } from '@/lib/storage';

export type OfflineCatalogState = {
  isOffline: boolean;
  /** Minutes since catalog snapshot updatedAt; null when no snapshot. */
  catalogAgeMinutes: number | null;
  catalogUpdatedAt: string | null;
  refresh(): void;
};

type CatalogSnapshot = {
  updatedAt: string | null;
};

/** Pure: minutes since updatedAt, floored; null when missing/invalid. */
export function catalogAgeMinutes(
  updatedAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!updatedAt) return null;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 60_000));
}

/** Pure: pull updatedAt from the onto.catalog.v1 JSON shape. */
export function parseCatalogUpdatedAt(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CatalogSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    return typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  } catch {
    return null;
  }
}

let swRegisterPromise: Promise<unknown> | null = null;

/** Idempotent web SW registration. No-op on native / missing API. */
export function registerOntoServiceWorker(): Promise<unknown> | null {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (swRegisterPromise) return swRegisterPromise;
  swRegisterPromise = navigator.serviceWorker
    .register('/sw.js')
    .catch(() => {
      /* registration failure must not break the app shell */
      swRegisterPromise = null;
    });
  return swRegisterPromise;
}

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/**
 * Web-aware offline catalog surface.
 * Snapshots remain owned by useEventCatalog → STORAGE_KEYS.catalog.
 * This hook only reads age + connectivity (SW registration lives in app/_layout.tsx).
 */
export function useOfflineCatalog(): OfflineCatalogState {
  const [isOffline, setIsOffline] = useState(() => !readOnline());
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* persist() is best-effort against iOS eviction */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updatedAt = parseCatalogUpdatedAt(await getItem(STORAGE_KEYS.catalog));
      if (!cancelled) {
        setCatalogUpdatedAt(updatedAt);
        setNowMs(Date.now());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const unsub = onOntoDataErased(() => {
      setCatalogUpdatedAt(null);
      setNowMs(Date.now());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const sync = () => {
      setIsOffline(!readOnline());
      setNowMs(Date.now());
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      appSub.remove();
    };
  }, []);

  return {
    isOffline,
    catalogAgeMinutes: catalogAgeMinutes(catalogUpdatedAt, nowMs),
    catalogUpdatedAt,
    refresh,
  };
}
