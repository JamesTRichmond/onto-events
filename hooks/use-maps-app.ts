import { useCallback, useEffect, useRef, useState } from 'react';

import { type MapsApp, parseMapsApp } from '@/lib/maps-choice';
import { getItem, setItem, STORAGE_KEYS } from '@/lib/storage';

/**
 * The viewer's maps app for Directions. Only the app's name is stored, never a
 * place. The erase action drops the key with the rest of the manifest.
 */
export function useMapsApp() {
  const [app, setApp] = useState<MapsApp>('system');
  const [loaded, setLoaded] = useState(false);
  // Only a tap makes memory authoritative; a load never writes back.
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await getItem(STORAGE_KEYS.mapsApp);
      if (cancelled) return;
      if (!dirtyRef.current) setApp(parseMapsApp(raw));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded && dirtyRef.current) void setItem(STORAGE_KEYS.mapsApp, app);
  }, [app, loaded]);

  const choose = useCallback((next: MapsApp) => {
    dirtyRef.current = true;
    setApp(next);
  }, []);

  return { app, loaded, choose };
}
