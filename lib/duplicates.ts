import { Activity, ActivityRating, milesBetween } from '@/data/activities';
import { sourceTrustFor } from '@/data/source-trust';

/**
 * One card per happening. The same event can reach the catalog from two
 * calendars: the Clark Planetarium feed and the county calendar both list
 * its Sensory Friendly Saturday (build 9, 2026-09-27). The pipeline keeps
 * both rows on purpose: each source retires only its own rows, and
 * cross-source suppression in the database waits for a policy that cannot
 * retire another source after a partial failure (docs/sources/HARDENING.md).
 * So the app handles it where it reads the catalog, with the pipeline's
 * strong rule (scripts/pipeline/dedupe.js): same normalized title, starts
 * within 15 minutes, venues within 0.15 mi.
 *
 * AstroTots is the case that rule misses. Clark Planetarium and the county
 * calendar list the same class (the same source event id) but a corrected
 * pin on one row can sit miles from the other. Those two are one occurrence.
 * Tuesday and Thursday are different source events, so both sessions stay.
 *
 * Two steps, in this order:
 * 1. `escalateDuplicateRatings` on the whole catalog this device received,
 *    before the feed: every listing of a happening carries the strictest
 *    rating any received copy gave it, saved plans included. A build without
 *    21+ content never downloads mature rows (hooks/use-event-catalog.ts), so
 *    a copy another source rated mature cannot be seen here; carrying that
 *    rating is the pipeline's job and is still open (docs/sources/PIPELINE.md).
 * 2. `collapseDuplicates` inside buildFeed, after its filters (fresh, in
 *    range, in mode, matching interests and search) and before its ranking
 *    and ticketing cap: a copy that has ended or sits outside the viewer's
 *    interests never hides one that fits, and a duplicate never takes one of
 *    the capped ticketing slots.
 */
const START_WINDOW_MS = 15 * 60_000;
const SAME_PLACE_MI = 0.15;

/** Mirrors scripts/pipeline/dedupe.js normalizeTitle. */
export function normalizeTitle(title: string): string {
  return String(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

function sameClock(a: Pick<Activity, 'startsAtIso'>, b: Pick<Activity, 'startsAtIso'>): boolean {
  const aStart = Date.parse(a.startsAtIso ?? '');
  const bStart = Date.parse(b.startsAtIso ?? '');
  return (
    Number.isFinite(aStart) &&
    Number.isFinite(bStart) &&
    Math.abs(aStart - bStart) <= START_WINDOW_MS
  );
}

/** A public URL id is global. Anything else is unique only inside its source. */
function identityBucket(activity: Activity): string | null {
  const identity = activity.sourceEventId?.trim();
  if (!identity) return null;
  let uid = identity;
  try {
    const tuple: unknown = JSON.parse(identity);
    if (
      Array.isArray(tuple) &&
      (tuple[0] === 'single' || tuple[0] === 'recurring') &&
      typeof tuple[1] === 'string'
    ) {
      uid = tuple[1];
    }
  } catch {
    // Non-calendar ids stay as stored.
  }
  let global = false;
  try {
    const url = new URL(uid);
    global = (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    // A slug is not a public namespace.
  }
  if (global) return `public-uid\0${identity}`;
  if (!activity.sourceName) return null;
  return `${activity.sourceName}\0${identity}`;
}

function sameClockAndPlace(a: Activity, b: Activity): boolean {
  return sameClock(a, b) && milesBetween(a.lat, a.lng, b.lat, b.lng) <= SAME_PLACE_MI;
}

/**
 * Group listings of the same happening. A public event id (an http URL) links
 * listings with the same normalized title and a start within 15 minutes, so a
 * pin can drift without joining a later session. A local slug is scoped to
 * its source: two sources that reuse the same slug stay two cards. Otherwise
 * the pipeline's strong rule applies. Undated listings and titles that
 * normalize to nothing never match either rule. Different sessions (AstroTots
 * Tuesday and Thursday) carry different source event ids and stay separate.
 */
function happenings<T extends Activity>(activities: readonly T[]): T[][] {
  const parent = activities.map((_, index) => index);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const link = (i: number, j: number) => {
    parent[root(j)] = root(i);
  };

  const byIdentity = new Map<string, number[]>();
  const byTitle = new Map<string, number[]>();
  activities.forEach((activity, index) => {
    const identity = identityBucket(activity);
    if (identity) {
      const bucket = byIdentity.get(identity) ?? [];
      bucket.push(index);
      byIdentity.set(identity, bucket);
    }
    const title = normalizeTitle(activity.title);
    if (activity.startsAtIso && title) {
      const bucket = byTitle.get(title) ?? [];
      bucket.push(index);
      byTitle.set(title, bucket);
    }
  });
  for (const bucket of byIdentity.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = activities[bucket[i]];
        const b = activities[bucket[j]];
        const title = normalizeTitle(a.title);
        if (title && title === normalizeTitle(b.title) && sameClock(a, b)) link(bucket[i], bucket[j]);
      }
    }
  }
  for (const bucket of byTitle.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (sameClockAndPlace(activities[bucket[i]], activities[bucket[j]])) link(bucket[i], bucket[j]);
      }
    }
  }

  const components = new Map<number, T[]>();
  activities.forEach((activity, index) => {
    const id = root(index);
    const group = components.get(id);
    if (group) group.push(activity);
    else components.set(id, [activity]);
  });
  const groups: T[][] = [];
  for (const group of components.values()) if (group.length > 1) groups.push(group);
  return groups;
}

const SEVERITY: Record<ActivityRating, number> = { family: 0, general: 1, mature: 2 };

/** Existing persisted publisher context; no device coordinates or new storage. */
export type HappeningSnapshot = Pick<Activity, 'id' | 'title' | 'venue' | 'startsAtIso'>;

/** All received copies of an active saved happening belong with that plan. */
export function duplicateIdsFor(
  activities: readonly Activity[],
  ids: ReadonlySet<string>,
  snapshots: readonly HappeningSnapshot[] = [],
): ReadonlySet<string> {
  if (ids.size === 0) return ids;
  const result = new Set(ids);
  const receivedIds = new Set(activities.map(item => item.id));
  for (const saved of snapshots) {
    // Current catalog facts win when available. History/unmarked snapshots
    // must never hide discovery, and snapshots never become feed supply.
    if (!ids.has(saved.id) || receivedIds.has(saved.id)) continue;
    const title = normalizeTitle(saved.title), venue = normalizeTitle(saved.venue);
    if (!title || !venue || venue === 'location to be confirmed') continue;
    for (const item of activities) {
      // Stored plans have no coordinates: require the same publisher venue
      // name as well as title and the existing occurrence-time tolerance.
      if (title === normalizeTitle(item.title) && venue === normalizeTitle(item.venue) && sameClock(saved, item)) {
        result.add(item.id);
      }
    }
  }
  for (const group of happenings(activities)) {
    if (group.some(item => result.has(item.id))) for (const item of group) result.add(item.id);
  }
  return result;
}

/**
 * Every listing of a happening takes the strictest rating any received copy
 * carries (family < general < mature): Family mode shows only what every
 * received source called family, and a received 21+ copy keeps its twin out
 * of the other modes.
 */
export function escalateDuplicateRatings<T extends Activity>(activities: T[]): T[] {
  const raised = new Map<string, ActivityRating>();
  for (const group of happenings(activities)) {
    const strictest = group.reduce<ActivityRating>(
      (worst, activity) => (SEVERITY[activity.rating] > SEVERITY[worst] ? activity.rating : worst),
      'family',
    );
    for (const activity of group) if (activity.rating !== strictest) raised.set(activity.id, strictest);
  }
  if (raised.size === 0) return activities;
  return activities.map((activity) => {
    const rating = raised.get(activity.id);
    return rating ? { ...activity, rating } : activity;
  });
}

const plain = (value: string | undefined) => normalizeTitle(value ?? '');

/** The venue's own calendar outranks a wider calendar that also lists it. */
function ownsVenue(activity: Activity): boolean {
  const source = plain(activity.sourceName);
  const venue = plain(activity.venue);
  // A blank name on either side proves nothing ('' is inside every string).
  return source !== '' && venue !== '' && (venue.includes(source) || source.includes(venue));
}

/** Mirrors the pipeline's richness: a source link, then description length. */
function richness(activity: Activity): number {
  return (activity.sourceUrl ? 2 : 0) + Math.min(2, (activity.description?.length ?? 0) / 70);
}

/** Positive when `a` should keep the card over `b`; ties keep the earlier one. */
function preference(a: Activity, b: Activity): number {
  return (
    sourceTrustFor(a) - sourceTrustFor(b) ||
    Number(ownsVenue(a)) - Number(ownsVenue(b)) ||
    richness(a) - richness(b)
  );
}

/**
 * One card per happening among listings the feed already chose to show.
 * `keep` holds the viewer's saved plans: a saved listing always stays (two
 * saved listings of one happening both stay) and stands in for its unsaved
 * copies. Otherwise the kept card is the most trusted source, then the
 * venue's own calendar, then the richer listing. A catalog id that arrives
 * twice (offset paging across a changing catalog) is one listing, shown once.
 * Survivors keep the feed's order.
 */
export function collapseDuplicates<T extends Activity>(
  items: T[],
  keep: ReadonlySet<string> = new Set(),
): T[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => !seen.has(item.id) && seen.add(item.id));
  const dropped = new Set<string>();
  for (const group of happenings(unique)) {
    const saved = group.filter((item) => keep.has(item.id));
    const winners = saved.length > 0
      ? saved
      : [group.reduce((best, item) => (preference(item, best) > 0 ? item : best))];
    for (const item of group) if (!winners.includes(item)) dropped.add(item.id);
  }
  if (dropped.size === 0 && unique.length === items.length) return items;
  return unique.filter((item) => !dropped.has(item.id));
}
