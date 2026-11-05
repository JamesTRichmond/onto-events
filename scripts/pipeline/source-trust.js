// Mirror James's 2026-09-05 decision and data/source-trust.ts (app PR #42).
// Source onboarding must update both name maps for any new aggregator/platform.
const SOURCE_KINDS = ['community', 'aggregator', 'ticketing'];
const TRUST = Object.freeze({ community: 3, aggregator: 2, ticketing: 1 });
const TICKETING = new Set(['ticketmaster', 'live nation', 'livenation', 'seatgeek', 'stubhub',
  'tickpick', 'vivid seats', 'axs', 'eventbrite', 'etix', 'dice', 'tixr', 'showclix',
  'ticketweb', 'see tickets', 'universe']);
const AGGREGATORS = new Set(['now playing utah', 'krcl', 'live music asheville', 'the laurel of asheville', 'asheville downtown association', 'river arts district', 'downtown jacksonville friendship fountain']);

function kindBySourceName(sourceName) {
  const name = String(sourceName ?? '').trim().toLowerCase();
  return TICKETING.has(name) ? 'ticketing' : AGGREGATORS.has(name) ? 'aggregator' : 'community';
}

function sourceProfile(record) {
  const kind = record.source !== 'live' ? 'community' : record.sourceKind ?? kindBySourceName(record.sourceName);
  if (!SOURCE_KINDS.includes(kind)) throw new Error('Invalid source kind');
  return { kind, trust: TRUST[kind] };
}

module.exports = { SOURCE_KINDS, sourceProfile, kindBySourceName, TICKETING, AGGREGATORS };
