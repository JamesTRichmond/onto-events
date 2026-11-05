import type { Activity } from '@/data/activities';

/**
 * Source trust tiers.
 *
 * James's decision, 2026-09-05 (DECISIONS.md): "ticketmaster can all but
 * disappear from the feed except for things happening NOW (relative to time
 * in the app that is). public listings with a strong history and established
 * trust should take precedence."
 *
 * Tier 3 `community`: the organizer's or venue's own public calendar, public
 * institutions, city permits, and onto's curated seed items.
 * Tier 2 `aggregator`: public aggregators that republish organizers' listings.
 * Tier 1 `ticketing`: corporate ticketing platforms.
 *
 * The tier is derived from the per-card source credit, so it needs no
 * database change; lib/feed.ts turns it into ranking. Names are matched
 * case-insensitively on the credit the pipeline writes (`source_name`).
 *
 * James, 2026-10-07: "the default view is ALWAYS free and local first."
 * Discover hides tier 1 entirely unless the viewer turns ticket sellers on in
 * Account (hooks/use-ticket-sellers.ts); the ranking below applies only then.
 */
export type SourceKind = 'community' | 'aggregator' | 'ticketing';
export type SourceTrust = 1 | 2 | 3;

/**
 * Corporate ticketing and resale platforms. Kept deliberately broad so a
 * source the pipeline adds later (Eventbrite is already planned in BACKLOG)
 * is demoted the day it lands rather than trusted by omission. Unknown live
 * sources are venue and organizer calendars by construction of the pipeline
 * (public feeds, one adapter per source), so they stay tier 3. The durable
 * path is the pipeline's own `sourceKind` on each record, which supersedes
 * this list once the client contract carries it (data-sources brief, Phase 0).
 */
const TICKETING_SOURCES = new Set([
  'ticketmaster',
  'live nation',
  'livenation',
  'seatgeek',
  'stubhub',
  'tickpick',
  'vivid seats',
  'axs',
  'eventbrite',
  'etix',
  'dice',
  'tixr',
  'showclix',
  'ticketweb',
  'see tickets',
  'universe',
]);
const AGGREGATOR_SOURCES = new Set(['now playing utah', 'krcl', 'live music asheville', 'the laurel of asheville', 'asheville downtown association', 'river arts district', 'downtown jacksonville friendship fountain']);

/**
 * Ranking constants, all three of James's decision in one place.
 * A ticketing item competes normally only inside the now-window: already
 * started, or starting within this many minutes of the app clock.
 */
export const TICKETING_NOW_WINDOW_MINUTES = 180;
/** Outside the window, at most this many ticketing items are shown... */
export const TICKETING_DEMOTED_CAP = 5;
/** ...once the radius holds at least this many trusted items. Below that,
 *  ticketing items fill in so the feed never goes empty (the days before new
 *  sources land, and the offline fallback, which is Ticketmaster only). */
export const TRUSTED_SUPPLY_FOR_CAP = 10;

export function sourceKindFor(activity: Pick<Activity, 'source' | 'sourceName'>): SourceKind {
  if (activity.source !== 'live') return 'community';
  const name = (activity.sourceName ?? '').trim().toLowerCase();
  if (TICKETING_SOURCES.has(name)) return 'ticketing';
  if (AGGREGATOR_SOURCES.has(name)) return 'aggregator';
  return 'community';
}

/** A ticketing or resale platform listing: hidden from Discover by default. */
export function isTicketSeller(activity: Pick<Activity, 'source' | 'sourceName'>): boolean {
  return sourceKindFor(activity) === 'ticketing';
}

export function sourceTrustFor(activity: Pick<Activity, 'source' | 'sourceName'>): SourceTrust {
  switch (sourceKindFor(activity)) {
    case 'ticketing':
      return 1;
    case 'aggregator':
      return 2;
    default:
      return 3;
  }
}
