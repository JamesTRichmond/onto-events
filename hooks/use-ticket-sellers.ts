import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { getItem, onOntoDataErased, removeItem, setItem, STORAGE_KEYS } from '@/lib/storage';

const SHOWN = 'on';

/**
 * Whether Discover shows ticket-seller listings (James, 2026-10-07: "the
 * default view is ALWAYS free and local first"). Hidden by default. Turning
 * them on takes a request and a confirmation in Account; turning them off is
 * one tap. Anything but the exact stored 'on' reads as hidden, and the erase
 * action hides them again.
 */
function useTicketSellersState(enabled = true) {
  const [shown, setShown] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // A choice made before storage answers wins over the stored value.
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getItem(STORAGE_KEYS.ticketSellers).then((stored) => {
      if (cancelled) return;
      if (!dirtyRef.current) setShown(stored === SHOWN);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(
    () =>
      onOntoDataErased(() => {
        dirtyRef.current = false;
        setPendingConfirm(false);
        setShown(false);
      }),
    [],
  );

  const requestShow = useCallback(() => {
    if (!shown) setPendingConfirm(true);
  }, [shown]);
  const cancelShow = useCallback(() => setPendingConfirm(false), []);
  const confirmShow = useCallback(() => {
    dirtyRef.current = true;
    setPendingConfirm(false);
    setShown(true);
    void setItem(STORAGE_KEYS.ticketSellers, SHOWN);
  }, []);
  const hide = useCallback(() => {
    dirtyRef.current = true;
    setPendingConfirm(false);
    setShown(false);
    void removeItem(STORAGE_KEYS.ticketSellers);
  }, []);

  return { shown, loaded, pendingConfirm, requestShow, confirmShow, cancelShow, hide };
}

type TicketSellersState = ReturnType<typeof useTicketSellersState>;

const TicketSellersContext = createContext<TicketSellersState | null>(null);

/** One shared choice, so a change in Account reaches the mounted Discover tab. */
export function TicketSellersProvider({ children }: PropsWithChildren) {
  const value = useTicketSellersState();
  return createElement(TicketSellersContext.Provider, { value }, children);
}

export function useTicketSellers() {
  const value = useContext(TicketSellersContext);
  const fallback = useTicketSellersState(value === null);
  return value ?? fallback;
}
