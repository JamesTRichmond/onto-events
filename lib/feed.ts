import { Activity, milesBetween } from '@/data/activities';
import {
  SourceTrust,
  sourceTrustFor,
  TICKETING_DEMOTED_CAP,
  TICKETING_NOW_WINDOW_MINUTES,
  TRUSTED_SUPPLY_FOR_CAP,
} from '@/data/source-trust';
import { affinityBoost, AffinityWeights } from '@/lib/affinity';
import { collapseDuplicates, duplicateIdsFor, type HappeningSnapshot } from '@/lib/duplicates';
import { nextOccurrence, recurrenceLabel } from '@/lib/recurrence';
import { StockFreshness } from '@/lib/stock-freshness';
import { ratingsFor, TierMode } from '@/lib/tiers';
import { confirmedFreeAdmission, readEventFacts } from '@/lib/event-facts';
import { isCancelledTitle, isRestrictedListing } from '@/lib/event-availability';
import {
  activityMatchesDateRange,
  DEFAULT_DATE_FILTER,
  MAX_EVENT_HORIZON_DAYS,
  resolveDateFilterRange,
  type DateFilter,
  type DateFilterPreset,
  type ResolvedDateRange,
} from '@/lib/date-filter';

export {
  activityMatchesDateRange,
  DEFAULT_DATE_FILTER,
  MAX_EVENT_HORIZON_DAYS,
  resolveDateFilterRange,
  type DateFilter,
  type DateFilterPreset,
  type ResolvedDateRange,
};

export type SortMode = 'foryou' | 'nearest' | 'soonest' | 'type';

export type FeedItem = Activity & {
  miles: number;
  score: number;
  /** 3 community, 2 aggregator, 1 corporate ticketing (data/source-trust.ts). */
  sourceTrust: SourceTrust;
};

export type FeedInput = {
  /**
   * Current epoch ms, or null during the very first render. Static export and
   * the client's hydration pass both render with null, so no wall-clock value
   * is ever baked into shipped HTML and hydration cannot mismatch; the first
   * mounted tick supplies the real time.
   */
  now: number | null;
  lat: number;
  lng: number;
  radiusMi: number;
  sort: SortMode;
  /** Active content tier — modes, not filters (decided spec). */
  mode: TierMode;
  interests: ReadonlySet<string>;
  /** Learned on-device category weights; explicit interests still dominate. */
  affinities?: AffinityWeights;
  /**
   * Which interest weight to score with. Dev-only toggle for the drive test;
   * release builds never pass it, so DEFAULT_RANK_MODE applies.
   */
  rankMode?: RankMode;
  /**
   * When true, vague events cannot occupy the first CONCRETE_SLOTS of the
   * default for-you feed. Opt-in for the drive test; release builds never
   * pass it, so DEFAULT_CONCRETENESS_GATE applies and ordering is unchanged.
   */
  concretenessGate?: boolean;
  /** Free-text search over title/venue/area/description/category. */
  query?: string;
  /** Only events explicitly confirmed to have free admission. */
  freeOnly?: boolean;
  includesFoodOnly?: boolean;
  /** Destination IANA timezone for recurrence schedules and date boundaries. */
  timeZone?: string;
  /** Optional date or date-range filter within the 60-day event window. */
  dateFilter?: DateFilter;
  /**
   * Optional ranking pins, retained for existing feed callers. They never
   * bypass Discover filters. Going uses goingIds and its own view instead.
   */
  pinnedIds?: ReadonlySet<string>;
  /** Already marked Going: these live in the separate Going place. */
  goingIds?: ReadonlySet<string>;
  /** Owner-scoped persisted facts used only to recognize withdrawn Going listings. */
  goingSnapshots?: readonly HappeningSnapshot[];
};

export type EmptyReason =
  | 'none'
  | 'out-of-range'
  | 'hidden-by-mode'
  | 'no-interest'
  | 'no-match'
  | 'no-data';

export type FeedResult = {
  items: FeedItem[];
  emptyReason: EmptyReason;
  /**
   * Ticketed items the cap held back — kept, never discarded, so the supply
   * stays accounted for. James chose (2026-09-21, open-decisions step 2) not
   * to render them: the feed shows what the cap keeps and nothing more.
   */
  foldedTicketed: FeedItem[];
  /**
   * How many shown items are inside the now-window: already underway, or
   * starting within NOW_WINDOW_MINUTES of the app clock. This is the only
   * forward-reaching "now" the product has (the ticketing rule uses the same
   * number), so the screen can tell a quiet afternoon from a full one
   * instead of implying "now" with a list that is mostly Saturday. Zero
   * during static render: no clock, no claim.
   */
  nowCount: number;
};

/**
 * "Right now" reaches this many minutes ahead. One number, shared with the
 * ticketing now-window (data/source-trust.ts), so the feed cannot call a
 * window quiet while a ticketed show inside it is treated as imminent.
 */
export const NOW_WINDOW_MINUTES = TICKETING_NOW_WINDOW_MINUTES;

/**
 * Inside the now-window: underway, or starting within NOW_WINDOW_MINUTES.
 * Expiry has already run, so an item that started long ago is not here.
 */
export function isNow(item: Pick<FeedItem, 'startsInMinutes'>): boolean {
  return item.startsInMinutes <= NOW_WINDOW_MINUTES;
}

/**
 * Interest weight (James, research clicklist Q1 = B, 2026-09-14). Beritelli
 * (2023) p. 31, 39, 60: free time goes to the next reachable familiar thing,
 * and a general interest does not explain why one option wins. So a picked
 * interest must not outrank nearness + soonness together (max 70) — it breaks
 * ties between reachable things. Both values ship; the dev rank toggle picks
 * between them and the drive test settles which one is honest.
 */
export const RANK_INTEREST_HIT = { 'interest-first': 120, 'near-and-now': 35 } as const;
export type RankMode = keyof typeof RANK_INTEREST_HIT;

/** Ships at today's value, so merging this PR changes nothing users can see. */
export const DEFAULT_RANK_MODE: RankMode = 'interest-first';

/**
 * Off by default so merging this PR changes nothing users can see. The gate is
 * real and tested; production never opts in until the drive test lands.
 */
export const DEFAULT_CONCRETENESS_GATE = false;

/** Leading slots an event must be concrete to occupy. */
export const CONCRETE_SLOTS = 5;

function effectiveStartsInMinutes(activity: Activity, now: number | null): number {
  if (activity.startsAtIso && now !== null) {
    return Math.round((Date.parse(activity.startsAtIso) - now) / 60000);
  }
  return activity.startsInMinutes;
}

/**
 * Stock rule 1 — future-only / auto-drop past (StockFreshness.isNotPast).
 * Recurring seeds resolve upstream; relative demo offsets without startsAtIso stay.
 */
function isFresh(activity: Activity, now: number | null, startsInMinutes: number): boolean {
  return StockFreshness.isNotPast(activity, now, startsInMinutes);
}

/** Venue-local label for live events; malformed source zones fall back to UTC. */
export function whenLabelFor(activity: Activity, now: number | null): string {
  if (!activity.startsAtIso || now === null) return activity.whenLabel;
  const startsInMinutes = effectiveStartsInMinutes(activity, now);
  if (startsInMinutes <= 0 && isFresh(activity, now, startsInMinutes)) return 'Happening now';
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try { return new Date(activity.startsAtIso).toLocaleString('en-US', { ...options, ...(activity.timezone ? {timeZone: activity.timezone, timeZoneName: 'short'} : {}) }); }
  catch { return new Date(activity.startsAtIso).toLocaleString('en-US', { ...options, timeZone: 'UTC', timeZoneName: 'short' }); }
}

type Timing = { startsInMinutes: number; whenLabel: string; fresh: boolean; startsAtIso?: string; endsAtIso?: string };

/**
 * One pass over an activity's time fields, so a recurrence rule is evaluated
 * once rather than three times. Precedence: a recurrence rule describes a
 * real schedule and wins; otherwise the live/seed handling above applies.
 *
 * With now=null (static export and the hydration pass) nothing is computed —
 * the baked label and offset render, so no wall-clock value is ever shipped
 * in the HTML and hydration cannot mismatch.
 */
function resolveTiming(
  activity: Activity,
  now: number | null,
  dateRange: ResolvedDateRange | null,
  timeZone?: string,
): Timing {
  if (now === null) {
    return {
      startsInMinutes: activity.startsInMinutes,
      whenLabel: activity.whenLabel,
      fresh: true,
    };
  }

  if (activity.recurrence) {
    const searchFrom = Math.max(dateRange?.startUtcMs ?? now, now);
    // Match the date-filter default when an older caller omits a destination.
    const recurrenceTimeZone = timeZone ?? (dateRange ? 'America/Denver' : undefined);
    const occurrence = nextOccurrence(activity.recurrence, searchFrom, {
      timeZone: recurrenceTimeZone,
      endUtcMs: dateRange?.endUtcMs,
    });
    // No occurrence means nothing to show: the season ended, or has not
    // opened yet, or no day matches inside the search window. The series
    // leaves the feed rather than lying about a date.
    if (!occurrence) {
      return { startsInMinutes: activity.startsInMinutes, whenLabel: activity.whenLabel, fresh: false };
    }
    return {
      startsInMinutes: Math.round((occurrence.startsAt - now) / 60000),
      whenLabel: recurrenceLabel(occurrence, now, recurrenceTimeZone),
      fresh: true,
      startsAtIso: new Date(occurrence.startsAt).toISOString(),
      ...(occurrence.endsAt === null ? {} : { endsAtIso: new Date(occurrence.endsAt).toISOString() }),
    };
  }

  const startsInMinutes = effectiveStartsInMinutes(activity, now);
  return {
    startsInMinutes,
    whenLabel: whenLabelFor(activity, now),
    fresh: isFresh(activity, now, startsInMinutes),
  };
}

// For-you score: picked interests dominate, then nearness, then soonness.
// Soonness peaks at "starting now" and decays symmetrically — an event 90
// minutes underway is no more urgent than one starting in 90 minutes.
// In 21+ mode, mature events lead the feed's character.
function scoreFor(
  activity: Activity,
  miles: number,
  startsInMinutes: number,
  interests: ReadonlySet<string>,
  mode: TierMode,
  affinities: AffinityWeights,
  rankMode: RankMode
): number {
  const interestHit = interests.has(activity.category) ? RANK_INTEREST_HIT[rankMode] : 0;
  const learned = affinityBoost(affinities, activity.category);
  const modeBoost = mode === 'mature' && activity.rating === 'mature' ? 80 : 0;
  const nearness = 40 / (1 + miles);
  const soonness = 30 / (1 + Math.abs(startsInMinutes) / 90);
  return interestHit + learned + modeBoost + nearness + soonness;
}

function matchesQuery(activity: Activity, needle: string): boolean {
  return [activity.title, activity.venue, activity.area, activity.description, activity.category]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

type SourceTrustOptions = {
  /** Tier 2 and 3 items in range and in mode, counted before any search. */
  trustedSupply: number;
  /** False while a search query is active: a search shows every match. */
  capEnabled: boolean;
  pinnedIds?: ReadonlySet<string>;
};

/**
 * Source trust (James's decision, 2026-09-05; constants in data/source-trust.ts).
 * A ticketing-platform item competes normally only inside the now-window:
 * already started, or starting within TICKETING_NOW_WINDOW_MINUTES. Outside it
 * the item ranks below every trusted item in whatever sort is active, and once
 * the radius holds TRUSTED_SUPPLY_FOR_CAP trusted items at most
 * TICKETING_DEMOTED_CAP such items remain (pinned plans always remain). With
 * thin trusted supply nothing is dropped, so the feed never empties. The cap
 * is a browsing rule: an active search returns every match, demoted in order,
 * because a person who typed a show's name must be able to find it. Order
 * within each group is the caller's sort, already applied.
 */
function applySourceTrust(
  sorted: FeedItem[],
  options: SourceTrustOptions
): { items: FeedItem[]; folded: FeedItem[] } {
  const leading: FeedItem[] = [];
  const demoted: FeedItem[] = [];
  for (const item of sorted) {
    const insideWindow = item.startsInMinutes <= TICKETING_NOW_WINDOW_MINUTES;
    if (item.sourceTrust === 1 && !insideWindow) demoted.push(item);
    else leading.push(item);
  }
  if (demoted.length === 0) return { items: sorted, folded: [] };
  if (!options.capEnabled || options.trustedSupply < TRUSTED_SUPPLY_FOR_CAP) {
    return { items: [...leading, ...demoted], folded: [] };
  }
  const { pinnedIds } = options;

  let shown = 0;
  const kept: FeedItem[] = [];
  const folded: FeedItem[] = [];
  for (const item of demoted) {
    if (pinnedIds?.has(item.id)) { kept.push(item); continue; }
    if (shown < TICKETING_DEMOTED_CAP) {
      shown += 1;
      kept.push(item);
      continue;
    }
    // Held back, not discarded: the caller still gets them (unrendered by
    // James's choice, 2026-09-21), so the count of known supply stays honest.
    folded.push(item);
  }
  return { items: [...leading, ...kept], folded };
}

/**
 * An event with no real start time and no real schedule, or with no venue
 * name, cannot answer "what could I do right now" — it has a label but no
 * commitment behind it. Such an item still belongs in the feed; it just
 * cannot take a leading slot, where the answer has to be concrete.
 */
function isConcrete(item: FeedItem): boolean {
  const timed = Boolean(item.startsAtIso) || Boolean(item.recurrence);
  return timed && item.venue.trim() !== '';
}

/**
 * Stable partition: concrete items fill the first CONCRETE_SLOTS in their
 * existing order, anything vague they displace follows immediately after, and
 * the tail is untouched. Nothing is dropped or reordered within a group, and
 * a feed with no concrete items at all comes back exactly as it went in.
 */
function applyConcretenessGate(sorted: FeedItem[]): FeedItem[] {
  const lead: FeedItem[] = [];
  const held: FeedItem[] = [];
  const rest: FeedItem[] = [];
  for (const item of sorted) {
    if (lead.length >= CONCRETE_SLOTS) rest.push(item);
    else if (isConcrete(item)) lead.push(item);
    else held.push(item);
  }
  return [...lead, ...held, ...rest];
}

export function buildFeed(activities: readonly Activity[], input: FeedInput): FeedResult {
  const { now, lat, lng, radiusMi, sort, mode, interests } = input;
  const affinities = input.affinities ?? {};
  const rankMode = input.rankMode ?? DEFAULT_RANK_MODE;
  const concretenessGate = input.concretenessGate ?? DEFAULT_CONCRETENESS_GATE;
  const visible = ratingsFor(mode);
  const needle = input.query?.trim().toLowerCase() ?? '';
  const dateRange = resolveDateFilterRange(input.dateFilter, now, input.timeZone);

  const fresh = activities
    .filter((a) => !a.isCancelled && !isCancelledTitle(a.title) && !isRestrictedListing(a.title, a.description))
    .map((a) => {
      const timing = resolveTiming(a, now, dateRange, input.timeZone);
      const miles = milesBetween(lat, lng, a.lat, a.lng);
      return {
        ...a,
        ...timing,
        miles,
        score: scoreFor(a, miles, timing.startsInMinutes, interests, mode, affinities, rankMode),
        sourceTrust: sourceTrustFor(a),
      };
    })
    .filter((a) => a.fresh)
    .map(({ fresh: _fresh, ...item }) => item);

  // Stock rule 1 — radius (road-trip bypass lives in StockFreshness.inRadius).
  const inRange = fresh.filter((a) => StockFreshness.inRadius(a.miles, radiusMi, a.category));
  const inMode = inRange.filter((a) => visible.has(a.rating));
  // Picked interests filter the feed (James, device pass on build 8,
  // 2026-09-25: a boost alone was invisible, so picking felt broken). A search
  // looks past interests: typing a name is a
  // more specific request than a standing interest.
  const inInterests =
    interests.size === 0
      ? inMode
      : inMode.filter((a) => interests.has(a.category));
  const beforeDate = (needle === '' ? inInterests : inMode.filter((a) => matchesQuery(a, needle)))
    .filter((a) => !input.freeOnly || confirmedFreeAdmission(a))
    .filter((a) => !input.includesFoodOnly || readEventFacts(a.eventFacts).includesFood?.value === true);
  // Discover is a pure discovery result. Going has its own independent view.
  const windowSelected = input.dateFilter && input.dateFilter.preset !== 'any' && now !== null;
  const inDate = windowSelected
    ? beforeDate.filter(a => dateRange && activityMatchesDateRange(a, dateRange, input.timeZone))
    : beforeDate;
  // One card per happening when two calendars list it (lib/duplicates.ts),
  // among what the filters kept and before ranking and the ticketing cap, so
  // a duplicate can neither hide a copy that fits nor spend a capped slot.
  // Match the occurrence selected for this window, never a series' missing
  // or stale raw timestamp. Keep all fresh copies before user filters.
  const goingCopies = duplicateIdsFor(fresh, input.goingIds ?? new Set(), input.goingSnapshots);
  const items = collapseDuplicates(inDate.filter(a => !goingCopies.has(a.id)), input.pinnedIds);
  // Trusted supply is a property of the radius, not of the search: only tier 2
  // and 3 items count, so a screen of imminent Ticketmaster shows cannot vote
  // to truncate the later ones. A happening two calendars list counts once,
  // and counts as trusted if any copy is, whatever the viewer saved: the
  // count collapses without saved plans, so the most trusted copy stands.
  const trustedSupply = collapseDuplicates(inMode)
    .filter((a) => a.sourceTrust >= 2).length;

  let emptyReason: EmptyReason = 'none';
  if (items.length === 0) {
    if (activities.length === 0 || fresh.length === 0) {
      emptyReason = 'no-data';
    } else if (inRange.length === 0) {
      emptyReason = 'out-of-range';
    } else if (inMode.length === 0) {
      emptyReason = 'hidden-by-mode';
    } else if (needle === '' && inInterests.length === 0) {
      emptyReason = 'no-interest';
    } else {
      emptyReason = 'no-match';
    }
  }

  switch (sort) {
    case 'foryou':
      items.sort((a, b) => b.score - a.score);
      break;
    case 'nearest':
      items.sort((a, b) => a.miles - b.miles);
      break;
    case 'soonest':
      items.sort((a, b) => a.startsInMinutes - b.startsInMinutes);
      break;
    case 'type':
      items.sort((a, b) => a.category.localeCompare(b.category) || a.miles - b.miles);
      break;
  }

  // The gate is opt-in (DEFAULT_CONCRETENESS_GATE is false) so production
  // ordering stays put until the drive test lands. When on, it belongs to the
  // default feed only: 'nearest', 'soonest' and 'type' are orders the viewer
  // asked for by name, and re-ranking them would be a lie about the sort. A
  // search is a specific request for the same reason — which is also why the
  // ticketing cap stands down on search.
  const gated =
    concretenessGate && sort === 'foryou' && needle === ''
      ? applyConcretenessGate(items)
      : items;

  // Source trust runs last so it keeps the final word: a demoted ticketing
  // item stays below every trusted item in any sort (decided 2026-09-05),
  // whatever the concreteness gate did above it.
  const trusted = applySourceTrust(gated, {
    trustedSupply,
    capEnabled: needle === '',
    pinnedIds: input.pinnedIds,
  });

  return {
    items: trusted.items,
    emptyReason,
    foldedTicketed: trusted.folded,
    // Stock rule 3 — honest empty: relative demo offsets do not fake density.
    nowCount:
      now === null
        ? 0
        : trusted.items.filter((item) => StockFreshness.countsTowardNowWindow(item) && isNow(item))
            .length,
  };
}

/**
 * The viewer's upcoming plans, independent of the feed's radius, search and
 * sort. A plan is a joined id that is still in the catalog, not over yet, and
 * visible in the active mode (Mature never reaches Family/Everyone, even as a
 * saved plan). The Going chip counts exactly this list, so its number can
 * never promise plans the list will not show: ids from past events and
 * events that left the catalog drop out on their own.
 */
export function upcomingPlans(
  activities: readonly Activity[],
  joinedIds: ReadonlySet<string>,
  input: Pick<FeedInput, 'now' | 'lat' | 'lng' | 'mode'>,
): FeedItem[] {
  if (joinedIds.size === 0) return [];
  const joined = activities.filter((a) => joinedIds.has(a.id));
  return buildFeed(joined, {
    ...input,
    radiusMi: Number.POSITIVE_INFINITY,
    sort: 'soonest',
    interests: new Set(),
    pinnedIds: joinedIds,
  }).items;
}
