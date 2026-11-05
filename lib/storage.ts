import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The on-device data manifest and storage choke point. Static keys and dynamic
 * prefixes are declared here so the privacy erase action can remove everything
 * onto owns without touching another app's data. New persistence belongs in
 * this module; existing direct AsyncStorage calls use keys from this manifest.
 */
export const STORAGE_KEYS = {
  installTipDismissed: 'onto.installTip.dismissed.v1',
  installTipSeen: 'onto.installTip.seen.v1',
  arrivalFeedback: 'onto.arrivalFeedback.v1',
  interests: 'onto.interests.v1',
  feedRadius: 'onto.feedRadius.v1',
  feedSort: 'onto.feedSort.v1',
  mode: 'onto.mode.v1',
  adultConfirmed: 'onto.adultConfirmed.v1',
  /** Guest RSVPs. Signed-in caches use joinedForUser(). */
  joined: 'onto.joined.v1',
  going: 'onto.going.events.v1',
  affinities: 'onto.affinities.v1',
  /** Last successful public catalog response for offline launch. */
  catalog: 'onto.catalog.v1',
  /** Non-pin mode and launched city ID only; never coordinates. */
  locationChoice: 'onto.locationChoice.v2',
  /** Legacy device/slc preference, retained for migration and erasure. */
  legacyLocationChoice: 'onto.locationChoice.v1',
  /** 'system', 'google' or 'waze': which maps app Directions opens. An app name, never a place. */
  mapsApp: 'onto.mapsApp.v1',
  /** Discover deck: event ids swiped left ("not for me"). Ids only, on this phone only. */
  passed: 'onto.passed.v1',
  /** Discover deck: event ids swiped right, the Maybes list. Ids only, on this phone only. */
  maybes: 'onto.maybes.v1',
  /** Passed ids that were on Maybes when tossed, so Bring back returns them there. */
  passedFromMaybes: 'onto.passedFromMaybes.v1',
  /** 'on' only after a confirmed choice in Account: Discover then shows ticket sellers. Absent means hidden. */
  ticketSellers: 'onto.ticketSellers.v1',
  /** '1' after the first-open location prompt is answered or the feed options sheet is closed. */
  firstRunLocationSeen: 'onto.firstRunLocationSeen.v1',
} as const;

export const STORAGE_PREFIXES = {
  catalogRegion: 'onto.catalog.v1.',
  joinedUser: 'onto.joined.user.v1.',
  joinedPendingUser: 'onto.joined.pending.user.v1.',
  goingUser: 'onto.going.events.user.v1.',
} as const;

export type StorageKey = string;

const eraseListeners = new Set<() => void>();
// A deleted owner cannot return with the same account ID. Keep its plan keys
// closed for this process so late hook work cannot recreate erased caches.
const deletedPlanKeys = new Set<StorageKey>();
const pendingPlanWrites = new Map<StorageKey, Set<Promise<void>>>();
let erasingLocalData = false;

export function joinedForUser(userId: string): StorageKey {
  const normalized = userId.trim();
  if (!normalized) throw new Error('userId is required for scoped RSVP storage');
  return `${STORAGE_PREFIXES.joinedUser}${encodeURIComponent(normalized)}`;
}

export function joinedPendingForUser(userId: string): StorageKey {
  const normalized = userId.trim();
  if (!normalized) throw new Error('userId is required for scoped RSVP storage');
  return `${STORAGE_PREFIXES.joinedPendingUser}${encodeURIComponent(normalized)}`;
}

export function goingForUser(userId: string): StorageKey {
  if (!userId.trim()) throw new Error('userId is required for scoped Going storage');
  return `${STORAGE_PREFIXES.goingUser}${encodeURIComponent(userId.trim())}`;
}

/** Read a key; null on miss or storage failure (private mode, quota…). */
export async function getItem(key: StorageKey): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a key; failures are swallowed — storage is a convenience, not truth. */
export async function setItem(key: StorageKey, value: string): Promise<void> {
  if (deletedPlanKeys.has(key) || erasingLocalData) return;
  const scopedPlan = key.startsWith(STORAGE_PREFIXES.joinedUser) ||
    key.startsWith(STORAGE_PREFIXES.joinedPendingUser) || key.startsWith(STORAGE_PREFIXES.goingUser) ||
    key === STORAGE_KEYS.going || key === STORAGE_KEYS.joined;
  let finish: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  if (scopedPlan) {
    pending = new Promise<void>(resolve => { finish = resolve; });
    const writes = pendingPlanWrites.get(key) ?? new Set<Promise<void>>();
    writes.add(pending);
    pendingPlanWrites.set(key, writes);
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the in-memory state stays authoritative.
  } finally {
    finish?.();
    if (pending) {
      const writes = pendingPlanWrites.get(key);
      writes?.delete(pending);
      if (writes?.size === 0) pendingPlanWrites.delete(key);
    }
  }
}

export async function removeItem(key: StorageKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

/** Account deletion removes only that owner's caches, never a switched account. */
export async function eraseAccountPlanData(userId: string): Promise<void> {
  const keys = [joinedForUser(userId), joinedPendingForUser(userId), goingForUser(userId)];
  keys.forEach(key => deletedPlanKeys.add(key));
  await Promise.all(keys.flatMap(key => [...(pendingPlanWrites.get(key) ?? [])]));
  await Promise.all(keys.map(removeItem));
}

export function onOntoDataErased(listener: () => void): () => void {
  eraseListeners.add(listener);
  return () => eraseListeners.delete(listener);
}

/** Removes every current and future onto-owned key, then resets mounted hooks. */
export async function eraseAllOntoData(): Promise<void> {
  erasingLocalData = true;
  await Promise.all([...pendingPlanWrites.values()].flatMap(writes => [...writes]));
  let keys = Object.values(STORAGE_KEYS) as string[];
  try {
    const storedKeys = await AsyncStorage.getAllKeys();
    keys = storedKeys.filter((key) => key.startsWith('onto.'));
  } catch {
    // Fall back to the static manifest when key enumeration is unavailable.
  }

  await Promise.all([...new Set(keys)].map((key) => removeItem(key)));
  erasingLocalData = false;
  eraseListeners.forEach((listener) => listener());
}
