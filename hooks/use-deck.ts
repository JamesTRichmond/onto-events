import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DeckLists,
  dropMaybe as dropMaybeFrom,
  EMPTY_DECK_LISTS,
  maybe as maybeIn,
  parseIdList,
  pass as passIn,
  restore as restoreIn,
  returnToMaybe as returnToMaybeIn,
  bringBack as bringBackIn,
} from '@/lib/deck';
import { getItem, onOntoDataErased, removeItem, setItem, STORAGE_KEYS } from '@/lib/storage';

async function persist(key: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) await removeItem(key);
  else await setItem(key, JSON.stringify(ids));
}

/**
 * The Discover deck's two on-device lists (passed, maybes). Ids only, never
 * sent anywhere, erased with everything else. A swipe that lands before the
 * stored lists load is replayed on top of them rather than overwritten.
 */
export function useDeck() {
  const [lists, setLists] = useState<DeckLists>(EMPTY_DECK_LISTS);
  const [loaded, setLoaded] = useState(false);
  // Only a viewer's swipe makes memory authoritative. A plain load, or a
  // failed read, never writes back over what storage holds.
  const dirtyRef = useRef(false);
  // Swipes made before the load settles, replayed onto the stored lists.
  const earlyRef = useRef<((lists: DeckLists) => DeckLists)[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rawPassed, rawMaybes, rawFromMaybes] = await Promise.all([
        getItem(STORAGE_KEYS.passed),
        getItem(STORAGE_KEYS.maybes),
        getItem(STORAGE_KEYS.passedFromMaybes),
      ]);
      if (cancelled) return;
      const stored: DeckLists = {
        passed: parseIdList(rawPassed),
        maybes: parseIdList(rawMaybes),
        fromMaybes: parseIdList(rawFromMaybes),
      };
      setLists(earlyRef.current.reduce((acc, change) => change(acc), stored));
      earlyRef.current = [];
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onOntoDataErased(() => {
        dirtyRef.current = false;
        earlyRef.current = [];
        setLists(EMPTY_DECK_LISTS);
      }),
    [],
  );

  useEffect(() => {
    if (!loaded || !dirtyRef.current) return;
    void persist(STORAGE_KEYS.passed, lists.passed);
    void persist(STORAGE_KEYS.maybes, lists.maybes);
    void persist(STORAGE_KEYS.passedFromMaybes, lists.fromMaybes);
  }, [lists, loaded]);

  const apply = useCallback(
    (change: (current: DeckLists) => DeckLists) => {
      dirtyRef.current = true;
      if (!loaded) earlyRef.current.push(change);
      setLists(change);
    },
    [loaded],
  );

  const pass = useCallback((id: string) => apply((l) => passIn(l, id)), [apply]);
  const keepMaybe = useCallback((id: string) => apply((l) => maybeIn(l, id)), [apply]);
  const restore = useCallback((ids: readonly string[]) => apply((l) => restoreIn(l, ids)), [apply]);
  const dropMaybe = useCallback((id: string) => apply((l) => dropMaybeFrom(l, id)), [apply]);
  const returnToMaybe = useCallback((id: string) => apply((l) => returnToMaybeIn(l, id)), [apply]);
  const bringBack = useCallback((ids: readonly string[]) => apply((l) => bringBackIn(l, ids)), [apply]);

  return { lists, loaded, pass, keepMaybe, restore, dropMaybe, returnToMaybe, bringBack };
}
