import type { Activity, ActivityRating } from '@/data/activities';
import { ratingsFor, type TierMode } from '@/lib/tiers';

/** Publisher facts only. Never stores a device position or a computed distance. */
export type PlanEvent = Pick<Activity, 'id' | 'title' | 'venue' | 'whenLabel'> &
  Partial<Pick<Activity, 'startsAtIso' | 'endsAtIso' | 'description' | 'timezone' | 'sourceUrl' | 'isCancelled'>> &
  { rating?: ActivityRating };
export type SavedPlan = { event: PlanEvent; savedAt: number; unmarkedAt?: number; needsHistorySync?: boolean;
  unmarkPending?: boolean; cancelledRevision?: string };
export type PlanRecords = Record<string, SavedPlan>;

/** Refreshing one source cannot erase a restrictive classification already seen. */
export function strictestPlanRating(...ratings: (ActivityRating | undefined)[]): ActivityRating | undefined {
  if (ratings.includes('mature')) return 'mature';
  if (ratings.includes('general')) return 'general';
  return ratings.includes('family') ? 'family' : undefined;
}

export function snapshot(event: PlanEvent): PlanEvent {
  return { id: event.id, title: event.title, venue: event.venue, whenLabel: event.whenLabel,
    startsAtIso: event.startsAtIso, endsAtIso: event.endsAtIso, description: event.description,
    timezone: event.timezone, sourceUrl: event.sourceUrl, rating: event.rating, isCancelled: event.isCancelled };
}

export function parsePlans(raw: string | null): PlanRecords {
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: PlanRecords = Object.create(null);
    for (const [id, row] of Object.entries(value)) {
      if (!row || typeof row !== 'object') continue;
      const r = row as SavedPlan;
      const e = r.event;
      if (!e || e.id !== id || typeof e.title !== 'string' || typeof e.venue !== 'string' ||
        typeof e.whenLabel !== 'string' || !Number.isFinite(r.savedAt)) continue;
      // Unknown ratings remain unknown and are never treated as Family/general.
      const rating = ['family','general','mature'].includes(e.rating ?? '') ? e.rating : undefined;
      const clean: PlanEvent = { id, title: e.title, venue: e.venue, whenLabel: e.whenLabel, rating };
      for (const name of ['startsAtIso','endsAtIso','description','timezone','sourceUrl'] as const) {
        if (typeof e[name] === 'string') clean[name] = e[name];
      }
      clean.isCancelled = e.isCancelled === true;
      result[id] = { event: clean, savedAt: r.savedAt,
        ...(Number.isFinite(r.unmarkedAt) ? { unmarkedAt: r.unmarkedAt } : {}),
        ...(r.needsHistorySync === true ? { needsHistorySync: true } : {}) };
      if (r.unmarkPending === true) result[id].unmarkPending = true;
      if (typeof r.cancelledRevision === 'string') result[id].cancelledRevision = r.cancelledRevision;
    }
    return result;
  } catch { return {}; }
}

export function planEnd(event: PlanEvent): number | null {
  const start = Date.parse(event.startsAtIso ?? '');
  if (!Number.isFinite(start)) return null;
  const end = Date.parse(event.endsAtIso ?? '');
  return Number.isFinite(end) && end > start ? end : start;
}

/** Going has no Discover location, distance, interest, query or window input. */
export function goingSections(records: PlanRecords, joined: ReadonlySet<string>, now: number | null, mode: TierMode) {
  const upcoming: SavedPlan[] = [], past: SavedPlan[] = [], undated: SavedPlan[] = [];
  const allowed = ratingsFor(mode);
  if (now === null) return { upcoming, past, undated };
  for (const plan of Object.values(records)) {
    const { event } = plan;
    if (!event.rating || !allowed.has(event.rating)) continue;
    const end = planEnd(event);
    if (end === null) { if (joined.has(event.id)) undated.push(plan); continue; }
    if (end <= now) {
      // A plan removed before the event ended is not later presented as history.
      if (plan.unmarkedAt === undefined || plan.unmarkedAt >= end || joined.has(event.id)) past.push(plan);
    } else if (joined.has(event.id)) upcoming.push(plan);
  }
  upcoming.sort((a,b) => Date.parse(a.event.startsAtIso!) - Date.parse(b.event.startsAtIso!));
  past.sort((a,b) => planEnd(b.event)! - planEnd(a.event)!);
  return { upcoming, past, undated };
}
