/**
 * How far Discover looks. The choice is a distance, never a place, and it
 * lives in `onto.feedRadius.v1` so reopening the app restores it.
 * A fresh install looks 1 mile out (James, 2026-10-04). A saved choice,
 * including a custom distance from 1 to 100 miles, still restores.
 * Road-trip cards still bypass the cap.
 */
export const FEED_RADIUS_CHOICES_MI = [1, 2, 5, 10, 15, 25, 50, 100] as const;

export type FeedRadiusMi = number;

export const DEFAULT_FEED_RADIUS_MI: FeedRadiusMi = 1;

/** Accept only complete finite decimals from 1 through 100 miles. */
export function parseRadius(raw: string | null): FeedRadiusMi | null {
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw.trim())) return null;
  const miles = Number(raw);
  return Number.isFinite(miles) && miles >= 1 && miles <= 100 ? miles : null;
}

export function parseFeedRadius(raw: string | null): FeedRadiusMi {
  return parseRadius(raw) ?? DEFAULT_FEED_RADIUS_MI;
}
