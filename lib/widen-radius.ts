/**
 * The one-tap way out of "Nothing in range." (#434). A fresh install looks
 * 1 mile out (James, 2026-10-04), and downtown Salt Lake can be empty at
 * that distance while hundreds of events sit inside 5 miles. The default
 * stays; the empty screen just stops being a dead end.
 *
 * Pure: the caller supplies how many cards the feed would show at a given
 * distance, so the count on the button is the count the viewer will get.
 */
export type WidenSuggestion = { radiusMi: number; count: number };

/**
 * The smallest distance choice wider than `currentMi` that shows at least
 * one card, with that card count; null when even the widest choice is empty.
 * Stops at the first hit so it never does more work than the answer needs.
 */
export function nextRadiusWithEvents(
  currentMi: number,
  choices: readonly number[],
  countAt: (radiusMi: number) => number,
): WidenSuggestion | null {
  const wider = [...choices].filter((mi) => mi > currentMi).sort((a, b) => a - b);
  for (const radiusMi of wider) {
    const count = countAt(radiusMi);
    if (count > 0) return { radiusMi, count };
  }
  return null;
}

export function widenLabel({ radiusMi, count }: WidenSuggestion): string {
  return `Widen to ${radiusMi} mi · ${count} ${count === 1 ? 'event' : 'events'}`;
}
