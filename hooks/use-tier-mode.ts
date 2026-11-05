import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { getItem, removeItem, setItem, STORAGE_KEYS } from '@/lib/storage';
import {
  ALL_MODES,
  DEFAULT_MODE,
  matureContentEnabled,
  TierMode,
} from '@/lib/tiers';

/**
 * Persists the active feed mode. Mature mode remains implemented behind a
 * fail-closed release flag, but v1 removes both the control and old consent.
 */
function useTierModeState(enabled = true) {
  const matureEnabled = matureContentEnabled();
  const [mode, setModeState] = useState<TierMode>(DEFAULT_MODE);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [pendingAdultConfirm, setPendingAdultConfirm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const pendingChoiceRef = useRef<{ mode?: TierMode; ack?: boolean }>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      // The acknowledgement the load settled on: the stored one, or one given
      // before storage answered. Read in `finally` to judge a deferred 21+ request.
      let ack = false;
      try {
        const [storedMode, storedAck] = await Promise.all([
          getItem(STORAGE_KEYS.mode),
          getItem(STORAGE_KEYS.adultConfirmed),
        ]);
        if (cancelled) return;

        if (!matureEnabled) {
          setAdultConfirmed(false);
          setPendingAdultConfirm(false);
          await removeItem(STORAGE_KEYS.adultConfirmed);
          if (storedMode === 'mature') {
            setModeState(DEFAULT_MODE);
            await setItem(STORAGE_KEYS.mode, DEFAULT_MODE);
          } else if (
            storedMode !== null &&
            (ALL_MODES as string[]).includes(storedMode)
          ) {
            setModeState(storedMode as TierMode);
          }
        } else {
          ack = storedAck === 'true' || pendingChoiceRef.current.ack === true;
          setAdultConfirmed(ack);
          if (
            storedMode !== null &&
            (ALL_MODES as string[]).includes(storedMode) &&
            (storedMode !== 'mature' || ack)
          ) {
            setModeState(storedMode as TierMode);
          }
        }
      } finally {
        if (!cancelled) {
          loadedRef.current = true;
          setLoaded(true);
          const pending = pendingChoiceRef.current;
          pendingChoiceRef.current = {};
          if (matureEnabled && pending.ack) {
            setItem(STORAGE_KEYS.adultConfirmed, 'true');
          }
          if (pending.mode === 'mature') {
            // A 21+ request made before the load was deferred until the
            // acknowledgement was known. Enter and persist it only with one;
            // otherwise ask now. With the flag off, requestMode already
            // collapsed the choice to the default.
            if (matureEnabled && ack) {
              setPendingAdultConfirm(false);
              setModeState('mature');
              setItem(STORAGE_KEYS.mode, 'mature');
            } else if (matureEnabled) {
              setPendingAdultConfirm(true);
            }
          } else if (pending.mode) {
            // A choice made before the load wins over the restored mode.
            setModeState(pending.mode);
            setItem(STORAGE_KEYS.mode, pending.mode);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, matureEnabled]);

  const persistMode = (next: TierMode) => {
    if (loadedRef.current) setItem(STORAGE_KEYS.mode, next);
  };

  const requestMode = useCallback(
    (next: TierMode) => {
      if (next === 'mature' && !matureEnabled) {
        setPendingAdultConfirm(false);
        setModeState(DEFAULT_MODE);
        if (!loadedRef.current) pendingChoiceRef.current.mode = DEFAULT_MODE;
        persistMode(DEFAULT_MODE);
        return;
      }
      if (!loadedRef.current) {
        pendingChoiceRef.current.mode = next;
        // The stored acknowledgement is not known yet: the load replays this
        // request, entering 21+ only with an acknowledgement.
        if (next === 'mature') return;
      }
      if (next === 'mature' && !adultConfirmed) {
        setPendingAdultConfirm(true);
        return;
      }
      setPendingAdultConfirm(false);
      setModeState(next);
      persistMode(next);
    },
    [adultConfirmed, matureEnabled],
  );

  const confirmAdult = useCallback(() => {
    if (!matureEnabled) return;
    setAdultConfirmed(true);
    setPendingAdultConfirm(false);
    setModeState('mature');
    if (!loadedRef.current) pendingChoiceRef.current = { mode: 'mature', ack: true };
    if (loadedRef.current) {
      setItem(STORAGE_KEYS.adultConfirmed, 'true');
      setItem(STORAGE_KEYS.mode, 'mature');
    }
  }, [matureEnabled]);

  const cancelAdultConfirm = useCallback(() => setPendingAdultConfirm(false), []);

  return {
    mode,
    loaded,
    matureEnabled,
    adultConfirmed,
    pendingAdultConfirm,
    requestMode,
    confirmAdult,
    cancelAdultConfirm,
  };
}

type TierModeState = ReturnType<typeof useTierModeState>;

const TierModeContext = createContext<TierModeState | null>(null);

export function TierModeProvider({ children }: PropsWithChildren) {
  const value = useTierModeState();
  return createElement(TierModeContext.Provider, { value }, children);
}

export function useTierMode() {
  const value = useContext(TierModeContext);
  const fallback = useTierModeState(value === null);
  return value ?? fallback;
}
