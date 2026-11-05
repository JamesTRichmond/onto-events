import type { Activity } from '@/data/activities';
import { NOW_WINDOW_MINUTES, type FeedItem } from '@/lib/feed';
import { nextOccurrence } from '@/lib/recurrence';
import { labelDay } from './label-day';

/**
 * Label only known dates, without changing membership or order in the feed.
 *
 * `quiet` is the feed's own verdict that nothing is on inside the now-window
 * (lib/feed.ts nowCount === 0). Then the label-day heading reads "Later
 * tonight" instead of 'things to do • scroll': the first heading a person sees
 * admits the quiet afternoon, in the night-owl voice, without a sentence.
 */
export function feedSection(
  item: Activity,
  now: number | null,
  timeZone: string,
  quiet = false
): string | null {
  if (now === null) return null;
  // buildFeed has already resolved the occurrence for the selected window.
  const startsAt = item.startsAtIso ? Date.parse(item.startsAtIso)
    : item.recurrence ? nextOccurrence(item.recurrence, now, { timeZone })?.startsAt : undefined;
  // An authored startsInMinutes value is not evidence of a real event date.
  if (startsAt === undefined || !Number.isFinite(startsAt)) {
    return item.source === 'live' ? 'Check event times' : 'Places to explore';
  }
  if (startsAt <= now) return 'onto activities happening now'; // Input is already freshness-filtered.
  return labelDay(startsAt, timeZone).date === labelDay(now, timeZone).date
    ? 'things to do • scroll' : 'onto activities coming up';
}

/**
 * Heading over the ticket-seller tail (Jobs gate, 2026-09-21). The source-trust
 * rule demotes by source, so the heading names the source; each card keeps its
 * own time and its "via …" credit.
 */
export const TICKET_SELLER_TAIL = 'From ticket sellers';

/** Reading order of the time headings when the feed is grouped by time. */
const SECTION_RANK: Readonly<Record<string, number>> = {
  'onto activities happening now': 0,
  'things to do • scroll': 1,
  'onto activities coming up': 2,
  'Check event times': 3,
  'Places to explore': 4,
};

function rank(label: string | null): number {
  return label === null ? Number.MAX_SAFE_INTEGER : SECTION_RANK[label] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * A ticket-seller item outside the now-window. buildFeed has already put it
 * below every trusted item in every sort (DECISIONS 2026-09-05), so it forms
 * one contiguous tail; the same predicate as the source-trust rule.
 */
export function inTicketSellerTail(item: Pick<FeedItem, 'sourceTrust' | 'startsInMinutes'>): boolean {
  return item.sourceTrust === 1 && item.startsInMinutes > NOW_WINDOW_MINUTES;
}

export type SectionedFeed<T> = { items: T[]; labels: (string | null)[] };

/**
 * The headings for a built feed and, when grouping by time (For you, James
 * 2026-09-21), the order that lets each heading appear once. Grouping is a
 * stable partition of the trusted block: the ranking survives inside every
 * group. The ticket-seller tail keeps its place at the end in every sort,
 * under one heading of its own, so no time heading repeats below it. Nearest,
 * Soonest and Type keep the order the viewer asked for. With no clock there
 * are no headings and nothing moves.
 */
export function sectionFeed<T extends Activity & Pick<FeedItem, 'sourceTrust' | 'startsInMinutes'>>(
  items: readonly T[],
  now: number | null,
  timeZone: string,
  options: { quiet?: boolean; groupByTime?: boolean } = {}
): SectionedFeed<T> {
  if (now === null) return { items: [...items], labels: items.map(() => null) };
  const head: { item: T; label: string | null; at: number }[] = [];
  const tail: T[] = [];
  items.forEach((item, at) => {
    if (inTicketSellerTail(item)) tail.push(item);
    else head.push({ item, label: feedSection(item, now, timeZone, options.quiet ?? false), at });
  });
  const ordered = options.groupByTime
    ? [...head].sort((a, b) => rank(a.label) - rank(b.label) || a.at - b.at)
    : head;
  return {
    items: [...ordered.map((entry) => entry.item), ...tail],
    labels: [...ordered.map((entry) => entry.label), ...tail.map(() => TICKET_SELLER_TAIL)],
  };
}
