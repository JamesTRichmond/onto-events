import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  BackendError,
  type BackendErrorCode,
  type RsvpBackend,
} from '@/lib/backend/contracts';
import {
  getItem,
  onOntoDataErased,
  joinedPendingForUser,
  joinedForUser,
  removeItem,
  setItem,
  STORAGE_KEYS,
} from '@/lib/storage';

function parseStored(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id !== '');
  } catch {
    return [];
  }
}

type PendingRsvpMap = Map<string, boolean>;

type FlushTask = {
  generation: number;
  promise: Promise<void>;
};

type SyncContext = {
  backend: RsvpBackend | null;
  userId: string | null;
  generation: number;
};

function parsePending(raw: string | null): PendingRsvpMap {
  if (!raw) return new Map();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] =>
          entry[0] !== '' && typeof entry[1] === 'boolean',
      ),
    );
  } catch {
    return new Map();
  }
}

async function persistIds(key: string, ids: Set<string>): Promise<void> {
  if (ids.size === 0) {
    await removeItem(key);
  } else {
    await setItem(key, JSON.stringify([...ids]));
  }
}

async function persistPending(key: string, pending: PendingRsvpMap): Promise<void> {
  if (pending.size === 0) {
    await removeItem(key);
  } else {
    await setItem(key, JSON.stringify(Object.fromEntries(pending)));
  }
}

function applyPending(ids: Set<string>, pending: PendingRsvpMap): Set<string> {
  const resolved = new Set(ids);
  for (const [eventId, shouldJoin] of pending) {
    if (shouldJoin) resolved.add(eventId);
    else resolved.delete(eventId);
  }
  return resolved;
}

const RETRY_DELAY_MS = 15_000;

/**
 * Errors the backend will keep returning no matter how often the same write is
 * retried. Keeping such an entry at the head of the queue would block every
 * later plan forever, so it is dropped and surfaced once instead.
 */
const PERMANENT_ERROR_CODES: ReadonlySet<BackendErrorCode> = new Set([
  'invalid-input',
  'not-found',
  'forbidden',
]);

function isPermanentError(error: unknown): error is BackendError {
  return error instanceof BackendError && PERMANENT_ERROR_CODES.has(error.code);
}

/**
 * Guest plans and signed-in plans use separate storage buckets. Guest plans
 * are claimed once a backend session exists, while each account can only read
 * its own cached bucket.
 */
export function useJoined(
  backend: RsvpBackend | null = null,
  userId: string | null = null,
) {
  const storageKey = useMemo(
    () => (userId ? joinedForUser(userId) : STORAGE_KEYS.joined),
    [userId],
  );
  const pendingStorageKey = useMemo(
    () => (userId ? joinedPendingForUser(userId) : null),
    [userId],
  );
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingSyncsRef = useRef(0);
  const pendingRef = useRef<PendingRsvpMap>(new Map());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushTaskRef = useRef<FlushTask | null>(null);
  const generationRef = useRef(0);
  const localMutationVersionRef = useRef(0);
  const syncContextRef = useRef<SyncContext>({ backend, userId, generation: 0 });
  const [eraseEpoch, setEraseEpoch] = useState(0);
  useEffect(() => onOntoDataErased(() => {
    generationRef.current += 1;
    loadedRef.current = false;
    pendingRef.current.clear();
    setJoinedIds(new Set());
    setLoaded(false);
    setEraseEpoch(value => value + 1);
  }), []);

  const flushPending = useCallback(async (): Promise<void> => {
    if (!backend || !userId || !pendingStorageKey || pendingRef.current.size === 0) return;
    const context = syncContextRef.current;
    if (
      context.backend !== backend ||
      context.userId !== userId ||
      generationRef.current !== context.generation
    ) return;
    const generation = context.generation;
    const pending = pendingRef.current;
    const activeTask = flushTaskRef.current;
    if (activeTask?.generation === generation) return activeTask.promise;

    let task: Promise<void>;
    task = (async () => {
      pendingSyncsRef.current += 1;
      if (mountedRef.current && generationRef.current === generation) {
        setSyncing(true);
        setSyncError(null);
      }
      try {
        while (pending.size > 0 && generationRef.current === generation) {
          const next = pending.entries().next().value as
            | [string, boolean]
            | undefined;
          if (!next) break;
          const [eventId, shouldJoin] = next;
          let permanentError: BackendError | null = null;
          try {
            if (shouldJoin) {
              await backend.setRsvp({ eventId, status: 'going' });
            } else {
              await backend.removeRsvp(eventId);
            }
          } catch (error) {
            if (!isPermanentError(error)) throw error;
            permanentError = error;
          }
          if (!mountedRef.current || generationRef.current !== generation) return;
          if (pending.get(eventId) === shouldJoin) {
            pending.delete(eventId);
          }
          await persistPending(pendingStorageKey, pending);
          if (permanentError && mountedRef.current && generationRef.current === generation) {
            // The backend will never accept this write, so the optimistic
            // local plan is rolled back to what the backend holds.
            setJoinedIds((previous) => {
              if (previous.has(eventId) !== shouldJoin) return previous;
              const next = new Set(previous);
              if (shouldJoin) next.delete(eventId);
              else next.add(eventId);
              if (loadedRef.current) persistIds(storageKey, next);
              return next;
            });
            setSyncError(permanentError);
          }
        }
      } catch (error) {
        if (mountedRef.current && generationRef.current === generation) {
          setSyncError(error instanceof Error ? error : new Error('RSVP sync failed'));
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => {
              if (generationRef.current !== generation) return;
              retryTimerRef.current = null;
              void flushPending();
            }, RETRY_DELAY_MS);
          }
        }
      } finally {
        if (mountedRef.current && generationRef.current === generation) {
          pendingSyncsRef.current -= 1;
          if (pendingSyncsRef.current === 0) setSyncing(false);
        }
      }
    })();
    flushTaskRef.current = { generation, promise: task };
    void task.then(
      () => {
        if (flushTaskRef.current?.promise === task) flushTaskRef.current = null;
      },
      () => {
        if (flushTaskRef.current?.promise === task) flushTaskRef.current = null;
      },
    );
    return task;
  }, [backend, pendingStorageKey, storageKey, userId]);

  const refreshFromRemote = useCallback(async (): Promise<void> => {
    if (!backend || !userId) return;
    const context = syncContextRef.current;
    if (
      context.backend !== backend ||
      context.userId !== userId ||
      generationRef.current !== context.generation
    ) return;
    const generation = context.generation;
    const mutationVersion = localMutationVersionRef.current;
    const pending = new Map(pendingRef.current);
    pendingSyncsRef.current += 1;
    if (mountedRef.current && generationRef.current === generation) setSyncing(true);
    try {
      const remote = await backend.listMyRsvps();
      if (!mountedRef.current || generationRef.current !== generation) return;
      // A response that began before a local choice cannot replace that newer
      // choice, even when its cloud write completed and left the pending queue.
      if (localMutationVersionRef.current !== mutationVersion) return;
      const resolved = applyPending(
        new Set(
          remote
            .filter((rsvp) => rsvp.status === 'going')
            .map((rsvp) => rsvp.eventId),
        ),
        pending,
      );
      setJoinedIds(resolved);
      await persistIds(storageKey, resolved);
      if (mountedRef.current && generationRef.current === generation) setSyncError(null);
    } catch (error) {
      if (mountedRef.current && generationRef.current === generation) {
        setSyncError(error instanceof Error ? error : new Error('RSVP sync failed'));
      }
    } finally {
      if (mountedRef.current && generationRef.current === generation) {
        pendingSyncsRef.current -= 1;
        if (pendingSyncsRef.current === 0) setSyncing(false);
      }
    }
    if (mountedRef.current && generationRef.current === generation) await flushPending();
  }, [backend, flushPending, storageKey, userId]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    syncContextRef.current = { backend, userId, generation };
    mountedRef.current = true;
    loadedRef.current = false;
    pendingSyncsRef.current = 0;
    setLoaded(false);
    setSyncing(false);
    setJoinedIds(new Set());
    setSyncError(null);
    const pending: PendingRsvpMap = new Map();
    pendingRef.current = pending;
    flushTaskRef.current = null;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    let cancelled = false;
    const isCurrent = () =>
      !cancelled && mountedRef.current && generationRef.current === generation;

    (async () => {
      const cached = parseStored(await getItem(storageKey));
      if (!isCurrent()) return;
      let resolved = new Set(cached);

      if (userId && pendingStorageKey) {
        const storedPending = parsePending(await getItem(pendingStorageKey));
        if (!isCurrent()) return;
        for (const [eventId, shouldJoin] of storedPending) {
          if (!pending.has(eventId)) {
            pending.set(eventId, shouldJoin);
          }
        }
      }

      if (backend && userId && pendingStorageKey) {
        const guest = parseStored(await getItem(STORAGE_KEYS.joined));
        if (!isCurrent()) return;
        for (const eventId of guest) pending.set(eventId, true);
        await persistPending(pendingStorageKey, pending);
        if (!isCurrent()) return;
        if (guest.length > 0) await removeItem(STORAGE_KEYS.joined);
        if (!isCurrent()) return;

        pendingSyncsRef.current += 1;
        setSyncing(true);
        try {
          const remote = await backend.listMyRsvps();
          if (!isCurrent()) return;
          resolved = new Set(
            remote
              .filter((rsvp) => rsvp.status === 'going')
              .map((rsvp) => rsvp.eventId),
          );
        } catch (error) {
          if (isCurrent()) {
            setSyncError(error instanceof Error ? error : new Error('RSVP sync failed'));
          }
        } finally {
          if (isCurrent()) {
            pendingSyncsRef.current -= 1;
            if (pendingSyncsRef.current === 0) setSyncing(false);
          }
        }
        if (!isCurrent()) return;
      }
      if (userId && pendingStorageKey) {
        resolved = applyPending(resolved, pending);
        await persistIds(storageKey, resolved);
      }

      if (!isCurrent()) return;
      setJoinedIds((current) => {
        const merged = new Set([...resolved, ...current]);
        if (current.size > 0) persistIds(storageKey, merged);
        return merged;
      });
      loadedRef.current = true;
      setLoaded(true);
      void flushPending();
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (generationRef.current === generation) generationRef.current += 1;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    };
  }, [backend, flushPending, pendingStorageKey, storageKey, userId, eraseEpoch]);

  useEffect(() => {
    if (!backend || !userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshFromRemote();
    });
    return () => subscription.remove();
  }, [backend, refreshFromRemote, userId]);

  const toggleJoin = useCallback((id: string) => {
    const context = syncContextRef.current;
    if (
      context.backend !== backend ||
      context.userId !== userId ||
      generationRef.current !== context.generation
    ) return;
    localMutationVersionRef.current += 1;
    setJoinedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      if (loadedRef.current) persistIds(storageKey, next);

      if (userId && pendingStorageKey) {
        pendingRef.current.set(id, next.has(id));
        void persistPending(pendingStorageKey, pendingRef.current);
        void flushPending();
      }
      return next;
    });
  }, [backend, flushPending, pendingStorageKey, storageKey, userId]);

  return { joinedIds, toggleJoin, loaded, syncing, syncError,
    isPending: (eventId: string) => pendingRef.current.has(eventId) };
}
