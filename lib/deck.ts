/**
 * Discover's swipe sorting and the Maybes list, as pure decisions.
 *
 * Two on-device id lists, nothing else: which cards the viewer passed on
 * ("not for me") and which they kept as a maybe. Maybes is a saved list, the
 * cousin of Going, not a second ranker: the list shows the feed in the feed's
 * own order, minus what was already sorted away, and the Maybes view reads its
 * ids back through the same upcoming-in-this-mode filter Going uses.
 */

/** Oldest ids fall off past this, so neither list grows for the life of the phone. */
export const DECK_LIST_CAP = 500;

export type DeckLists = {
  passed: readonly string[];
  maybes: readonly string[];
  /** Passed ids whose toss started on Maybes, so bring-back can return them there. */
  fromMaybes: readonly string[];
};

export const EMPTY_DECK_LISTS: DeckLists = { passed: [], maybes: [], fromMaybes: [] };

/** Stored bytes are device state, not trusted input: keep non-empty string ids only. */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((id): id is string => typeof id === 'string' && id !== '');
    return capList([...new Set(ids)]);
  } catch {
    return [];
  }
}

function capList(ids: string[]): string[] {
  return ids.length > DECK_LIST_CAP ? ids.slice(ids.length - DECK_LIST_CAP) : ids;
}

function append(ids: readonly string[], id: string): string[] {
  return capList([...ids.filter((x) => x !== id), id]);
}

function without(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/** Swipe left: not for me. A pass also takes the card out of Maybes. */
export function pass(lists: DeckLists, id: string): DeckLists {
  const fromMaybe = lists.maybes.includes(id);
  return {
    passed: append(lists.passed, id),
    maybes: without(lists.maybes, id),
    fromMaybes: fromMaybe ? append(lists.fromMaybes, id) : without(lists.fromMaybes, id),
  };
}

/** Swipe right: keep it as a maybe. A maybe also lifts an earlier pass. */
export function maybe(lists: DeckLists, id: string): DeckLists {
  return {
    passed: without(lists.passed, id),
    maybes: append(lists.maybes, id),
    fromMaybes: without(lists.fromMaybes, id),
  };
}

/** Undo a pass, or bring a passed card back to the main feed. */
export function restore(lists: DeckLists, ids: readonly string[]): DeckLists {
  const back = new Set(ids);
  return {
    ...lists,
    passed: lists.passed.filter((x) => !back.has(x)),
    fromMaybes: lists.fromMaybes.filter((x) => !back.has(x)),
  };
}

/** Undo a maybe, or take one off the Maybes list. */
export function dropMaybe(lists: DeckLists, id: string): DeckLists {
  return { ...lists, maybes: without(lists.maybes, id) };
}

/** Undo a toss that started in Maybes: off the passed list, back on Maybes. */
export function returnToMaybe(lists: DeckLists, id: string): DeckLists {
  return {
    passed: without(lists.passed, id),
    maybes: append(lists.maybes, id),
    fromMaybes: without(lists.fromMaybes, id),
  };
}

/**
 * Bring passed cards back. A toss that started on Maybes returns there.
 * A toss from the main feed returns to the main feed.
 */
export function bringBack(lists: DeckLists, ids: readonly string[]): DeckLists {
  return ids.reduce(
    (acc, id) => (acc.fromMaybes.includes(id) ? returnToMaybe(acc, id) : restore(acc, [id])),
    lists,
  );
}

/**
 * The Discover list after sorting: the feed as already built (radius, mode,
 * interests, search and Free all applied), in its own order, minus every card
 * swiped away — passed, or moved to Maybes. Ids in `keep` always stay: a plan
 * the viewer is Going to is a stronger yes than any swipe, so it never hides.
 */
export function sortedFeed<T extends { id: string }>(
  feed: readonly T[],
  lists: DeckLists,
  keep: ReadonlySet<string>,
): T[] {
  const decided = new Set([...lists.passed, ...lists.maybes]);
  return feed.filter((item) => keep.has(item.id) || !decided.has(item.id));
}

/** Passed cards that are in the current feed: what "Bring back passes" restores. */
export function passedInFeed(feed: readonly { id: string }[], lists: DeckLists): string[] {
  const passed = new Set(lists.passed);
  return feed.filter((item) => passed.has(item.id)).map((item) => item.id);
}

/** Maybes still in this feed, in the feed's own order. Not a second ranker. */
export function maybesInFeed<T extends { id: string }>(feed: readonly T[], lists: DeckLists): T[] {
  const maybes = new Set(lists.maybes);
  return feed.filter((item) => maybes.has(item.id));
}
