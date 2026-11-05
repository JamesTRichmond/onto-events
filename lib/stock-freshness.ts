import type { Activity, ActivityCategory } from '@/data/activities';

/**
 * Discover stock freshness rules (tip publish gate). Soft Directions stay out
 * of scope — this module only names time, radius, empty honesty, and bake age.
 *
 * 1) Future-only in radius; auto-drop past events
 * 2) Visible last-refreshed (GENERATED_AT / bake time)
 * 3) Honest empty (no fake density when the now-window is empty)
 * 4) Tip publish gate: GENERATED_AT age >48h → forced stale banner
 */
export class StockFreshness {
  /** Tip publish gate: older than this → forced stale banner on Discover. */
  static readonly TIP_STALE_HOURS = 48;

  /**
   * Without endsAtIso, a started event leaves Discover this many minutes after
   * start (same grace the feed already used for live expiry).
   */
  static readonly PAST_GRACE_MINUTES = 180;

  /** Age of the bake in hours, or null when unknown / static render. */
  static ageHours(generatedAtIso: string | undefined, now: number | null): number | null {
    if (!generatedAtIso || now === null) return null;
    const generated = Date.parse(generatedAtIso);
    if (Number.isNaN(generated)) return null;
    return (now - generated) / 3_600_000;
  }

  /**
   * Rule 2 — always-visible last-refreshed once the clock and bake time exist.
   * Quiet during static export so no wall-clock string hydrates into HTML.
   */
  static lastRefreshedLabel(
    generatedAtIso: string | undefined,
    now: number | null,
  ): string | null {
    if (StockFreshness.ageHours(generatedAtIso, now) === null) return null;
    const generated = Date.parse(generatedAtIso!);
    const when = new Date(generated).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Updated ${when}`;
  }

  /**
   * Rule 4 — forced stale banner when bake age exceeds the tip gate.
   * Under 48h the tip is treated fresh (null); no soft 24h nag.
   */
  static tipStaleBanner(
    generatedAtIso: string | undefined,
    now: number | null,
  ): string | null {
    const hours = StockFreshness.ageHours(generatedAtIso, now);
    if (hours === null || hours <= StockFreshness.TIP_STALE_HOURS) return null;
    // Gate is 48h, so a forced banner is always at least two calendar days.
    const days = Math.floor(hours / 24);
    return `Live events are stale — last updated ${days} days ago`;
  }

  /**
   * Rule 1 — auto-drop past events. Recurrence is resolved upstream; here we
   * only judge a concrete startsInMinutes + optional endsAtIso.
   * With now=null (static render) nothing expires — no clock, no baked cutoff.
   */
  static isNotPast(
    activity: Pick<Activity, 'startsAtIso' | 'endsAtIso'>,
    now: number | null,
    startsInMinutes: number,
  ): boolean {
    if (now === null) return true;
    if (activity.endsAtIso) return now <= Date.parse(activity.endsAtIso);
    // Relative seeds keep their baked offset; live rows expire on the clock.
    return !activity.startsAtIso || startsInMinutes > -StockFreshness.PAST_GRACE_MINUTES;
  }

  /**
   * Rule 1 — inside the Discover radius. Road-trip destinations bypass the
   * radius (honest drive time stays on the card).
   */
  static inRadius(
    miles: number,
    radiusMi: number,
    category: ActivityCategory | string,
  ): boolean {
    return category === 'roadtrip' || miles <= radiusMi;
  }

  /**
   * Rule 3 — a card may sit in the feed, but only a real schedule can claim
   * the now-window. Relative demo offsets must not fake a busy afternoon.
   */
  static countsTowardNowWindow(
    item: Pick<Activity, 'startsAtIso' | 'recurrence'>,
  ): boolean {
    return Boolean(item.startsAtIso) || Boolean(item.recurrence);
  }
}
