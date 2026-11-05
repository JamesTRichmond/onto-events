import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { BUNDLED_ACTIVITIES } from '@/data/bundled-activities';
import type { Activity } from '@/data/activities';
import { useJoined } from '@/hooks/use-joined';
import { useNow } from '@/hooks/use-now';
import { useOntoBackend } from '@/lib/backend/context';
import type { CatalogEvent } from '@/lib/backend/contracts';
import { parsePlans, planEnd, snapshot, strictestPlanRating, type PlanEvent, type PlanRecords } from '@/lib/going';
import { escalateDuplicateRatings } from '@/lib/duplicates';
import { getItem, goingForUser, onOntoDataErased, removeItem, setItem, STORAGE_KEYS } from '@/lib/storage';

const GoingContext = createContext<ReturnType<typeof useGoingState> | null>(null);
const bundle = escalateDuplicateRatings(BUNDLED_ACTIVITIES ?? []);
const bundleRatings = new Map(bundle.map(event => [event.id, event.rating]));

function catalogSnapshot(event: CatalogEvent): PlanEvent {
  return {
    id: event.id, title: event.title, venue: event.venueName ?? 'Location to be confirmed',
    whenLabel: '', startsAtIso: event.startsAt, endsAtIso: event.endsAt ?? undefined,
    description: event.description ?? undefined, timezone: event.timezone ?? undefined,
    rating: event.rating, sourceUrl: event.sourceUrl ?? undefined, isCancelled: event.isCancelled,
  };
}

function useGoingState() {
  const { rsvpBackend: backend, rsvpOwnerId: owner, catalogBackend: catalog } = useOntoBackend();
  const joined = useJoined(backend, owner);
  const now = useNow();
  const key = owner ? goingForUser(owner) : STORAGE_KEYS.going;
  const authority = useRef({ key, active: true, erased: false });
  if (authority.current.key !== key) authority.current = { key, active: true, erased: false };
  const [state, setState] = useState<{ key: string; records: PlanRecords; loaded: boolean }>({ key, records: {}, loaded: false });
  const [error, setError] = useState<Error | null>(null);
  const [eraseEpoch, setEraseEpoch] = useState(0);
  const recordsRef = useRef<PlanRecords>({});
  const edited = useRef(new Map<string, number>());
  const editSequence = useRef(0);
  const joinedRef = useRef(joined);
  joinedRef.current = joined;
  const writes = useRef(Promise.resolve());
  const refreshSequence = useRef(0);
  const knownRatings = useRef(new Map(bundleRatings));

  const save = useCallback((records: PlanRecords) => {
    const token = authority.current;
    if (token.key !== key || !token.active) return;
    recordsRef.current = records;
    setState({ key, records, loaded: true });
    const bytes = JSON.stringify(records);
    writes.current = writes.current.then(() => !token.erased ? setItem(key, bytes) : undefined);
  }, [key]);

  const observeCatalog = useCallback((events: readonly Activity[]) => {
    const currentEvents = new Map(events.map(event => [event.id, event]));
    for (const event of events) knownRatings.current.set(event.id,
      strictestPlanRating(knownRatings.current.get(event.id), event.rating)!);
    const records = { ...recordsRef.current };
    let changed = false;
    for (const [id, plan] of Object.entries(records)) {
      const rating = strictestPlanRating(plan.event.rating, knownRatings.current.get(id));
      const currentEvent = !owner ? currentEvents.get(id) : undefined;
      const facts = currentEvent ? snapshot(currentEvent) : plan.event;
      if (currentEvent || rating !== plan.event.rating) {
        records[id] = { ...plan, event: { ...facts, rating } };
        changed = true;
      }
    }
    if (changed) save(records);
  }, [owner, save]);

  useEffect(() => {
    let alive = true;
    const token = { key, active: true, erased: false };
    authority.current = token;
    recordsRef.current = {};
    edited.current = new Map();
    setState({ key, records: {}, loaded: false });
    setError(null);
    const current = () => alive && authority.current === token && token.active;
    void (async () => {
      await writes.current;
      if (!current()) return;
      const cached = parsePlans(await getItem(key));
      if (!current()) return;
      const guest = owner && backend ? parsePlans(await getItem(STORAGE_KEYS.going)) : {};
      if (!current()) return;
      for (const plan of Object.values(guest)) {
        const end = planEnd(plan.event);
        if (end !== null && plan.unmarkedAt !== undefined && plan.unmarkedAt >= end) plan.needsHistorySync = true;
      }
      const records = { ...guest, ...cached };
      save(records);
      // Persist retryable history imports in the account bucket before claiming
      // the guest snapshots. Active IDs use the existing useJoined queue.
      if (owner && backend && Object.keys(guest).length) {
        await writes.current;
        if (current()) await removeItem(STORAGE_KEYS.going);
      }
    })();
    const unsubscribe = onOntoDataErased(() => {
      alive = false;
      token.active = false;
      token.erased = true;
      recordsRef.current = {};
      edited.current.clear();
      setState({ key, records: {}, loaded: true });
      setEraseEpoch(value => value + 1);
    });
    return () => { alive = false; token.active = false; unsubscribe(); };
  }, [key, backend, owner, save, eraseEpoch]);

  const idsKey = [...joined.joinedIds].sort().join('\n');
  useEffect(() => {
    if (state.key !== key || !state.loaded || !joined.loaded) return;
    const records = { ...recordsRef.current };
    let changed = false;
    for (const event of bundle) {
      if (!joined.joinedIds.has(event.id) || records[event.id]) continue;
      records[event.id] = { event: snapshot(event), savedAt: Date.now() };
      changed = true;
    }
    if (changed) save(records);
  }, [idsKey, joined.joinedIds, joined.loaded, key, save, state.key, state.loaded]);

  const refresh = useCallback(async () => {
    if (authority.current.key !== key || !authority.current.active) return;
    const token = authority.current;
    const request = ++refreshSequence.current;
    const current = () => authority.current === token && token.active && refreshSequence.current === request;
    const editedAtStart = new Map(edited.current);
    try {
      // Legacy guests saved IDs only. The existing public individual-event
      // reader can recover their context without an account or an active feed.
      if (!owner || !backend) {
        if (!catalog) return;
        for (const id of new Set([...Object.keys(recordsRef.current), ...joinedRef.current.joinedIds])) {
          const event = await catalog.getEvent(id).catch(() => null);
          if (!current()) return;
          const old = recordsRef.current[id];
          if (event) save({ ...recordsRef.current, [id]: {
            ...old,
            event: snapshot({ ...catalogSnapshot(event), rating: strictestPlanRating(event.rating, old?.event.rating, knownRatings.current.get(id)) }),
            savedAt: old?.savedAt ?? Date.now(),
          } });
        }
        return;
      }
      let history = await backend.listMyRsvpHistory();
      if (!current()) return;
      let imported = false;
      for (const plan of Object.values(recordsRef.current)) {
        if (!plan.needsHistorySync) continue;
        if (!current()) return;
        // Import missing history; never cancel an existing cloud choice merely
        // because an older guest snapshot was unmarked on this device.
        if (!history.some(row => row.eventId === plan.event.id)) {
          await backend.setRsvp({ eventId: plan.event.id, status: 'cancelled' });
          imported = true;
        }
        if (!current()) return;
        const latest = recordsRef.current[plan.event.id];
        if (latest) save({ ...recordsRef.current, [plan.event.id]: { ...latest, needsHistorySync: false } });
      }
      if (imported) history = await backend.listMyRsvpHistory();
      if (!current()) return;
      const records = { ...recordsRef.current };
      for (let start = 0; start < history.length; start += 8) {
        const rows = await Promise.all(history.slice(start,start+8).filter(r=>r.status !== 'interested').map(async r => {
          const event = catalog ? await catalog.getEvent(r.eventId).catch(()=>null) : null;
          return { r, event };
        }));
        if (!current()) return;
        for (const { r, event } of rows) {
          const old = recordsRef.current[r.eventId] ?? records[r.eventId];
          const facts: PlanEvent = event ? catalogSnapshot(event)
            : old?.event ?? { id: r.eventId, title: r.title, venue: r.venueName ?? '', whenLabel: '', startsAtIso: r.startsAt, endsAtIso: r.endsAt ?? undefined };
          facts.rating = strictestPlanRating(facts.rating, old?.event.rating, knownRatings.current.get(r.eventId));
          // An acknowledged edit can accept later changes from another device.
          // Edits made during this request, or not yet reflected by the server,
          // retain their local history timestamp and snapshot.
          const edit = edited.current.get(r.eventId);
          const matches = (r.status === 'going') === joinedRef.current.joinedIds.has(r.eventId);
          if (edit !== undefined && edit === editedAtStart.get(r.eventId) && matches &&
            !joinedRef.current.syncing && !joinedRef.current.isPending(r.eventId)) {
            edited.current.delete(r.eventId);
          }
          const locallyEdited = edited.current.has(r.eventId);
          let unmarkedAt = old?.unmarkedAt;
          let cancelledRevision = old?.cancelledRevision;
          let unmarkPending = old?.unmarkPending;
          if (!locallyEdited && !joinedRef.current.isPending(r.eventId)) {
            // Acknowledging an offline removal must retain its original intent
            // time, rather than the later time at which the server received it.
            if (r.status === 'cancelled') {
              const ownAcknowledgement = old?.unmarkPending && !joinedRef.current.isPending(r.eventId);
              if (!ownAcknowledgement && cancelledRevision !== r.rsvpUpdatedAt) unmarkedAt = Date.parse(r.rsvpUpdatedAt);
              cancelledRevision = r.rsvpUpdatedAt;
              unmarkPending = false;
            } else if (joinedRef.current.joinedIds.has(r.eventId)) {
              unmarkedAt = undefined; cancelledRevision = undefined; unmarkPending = false;
            }
          }
          records[r.eventId] = { event: snapshot(facts), savedAt: old?.savedAt ?? Date.parse(r.rsvpUpdatedAt),
            ...(unmarkedAt !== undefined ? { unmarkedAt } : {}),
            ...(cancelledRevision ? { cancelledRevision } : {}), ...(unmarkPending ? { unmarkPending } : {}) };
        }
      }
      if (!current()) return;
      // Local edits made during I/O win, including their snapshot and history time.
      for (const id of edited.current.keys()) if (recordsRef.current[id]) records[id] = recordsRef.current[id];
      save(records);
      setError(null);
    } catch { if (current()) setError(new Error('Some plans could not sync. Showing plans saved here.')); }
  }, [owner, backend, catalog, key, save]);

  useEffect(() => {
    if (state.key !== key || !state.loaded || !joined.loaded || joined.syncing) return;
    void refresh();
  }, [key, state.key, state.loaded, joined.loaded, joined.syncing, idsKey, refresh]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', s => { if (s === 'active') void refresh(); });
    return () => listener.remove();
  }, [refresh]);

  const togglePlan = useCallback((event: PlanEvent) => {
    if (authority.current.key !== key || !authority.current.active || state.key !== key || !state.loaded || !joined.loaded) return;
    edited.current.set(event.id, ++editSequence.current);
    const old = recordsRef.current[event.id];
    const next = { ...recordsRef.current, [event.id]: { event: snapshot(event), savedAt: old?.savedAt ?? now ?? Date.now(),
      ...(joined.joinedIds.has(event.id) ? { unmarkedAt: now ?? Date.now(), ...(owner ? { unmarkPending: true } : {}) } : {}) } };
    save(next);
    joined.toggleJoin(event.id);
  }, [key, state.key, state.loaded, joined, now, save, owner]);

  const visible = state.key === key && state.loaded;
  return { joinedIds: visible ? joined.joinedIds : new Set<string>(), records: visible ? state.records : {},
    loaded: visible && joined.loaded, syncing: joined.syncing, syncError: joined.syncError ?? error,
    togglePlan, observeCatalog, refresh, now };
}

export function GoingProvider({ children }: PropsWithChildren) {
  const value = useGoingState();
  return <GoingContext.Provider value={value}>{children}</GoingContext.Provider>;
}

/** Standalone screen tests and optional compositions use the same provider. */
export function GoingScope({ children }: PropsWithChildren) {
  const existing = useContext(GoingContext);
  return existing ? <>{children}</> : <GoingProvider>{children}</GoingProvider>;
}

export function useGoing() {
  const value = useContext(GoingContext);
  if (!value) throw new Error('GoingProvider is required');
  return value;
}
