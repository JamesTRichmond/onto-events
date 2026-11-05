// Canonical event-record contract for the ingestion pipeline.
//
// NOTE: no DeepSeek-drafted schema existed anywhere in the repo when this was
// designed (searched 2026-08-30), so this is onto's own canonical shape.
// Reconciled 2026-08-30 with the tier-mode work merged to main (PR #14):
// provenance fields are sourceName + sourceUrl (this module's earlier
// url/sourceCredit pair retired in their favor), and endsAtIso is accepted.
// This module is the single authority every adapter must satisfy.
//
// The shape matches the app's Activity type (data/activities.ts) plus the
// provenance fields the product spec requires (per-card source credits,
// tappable event URLs). Records that fail validation never reach the app.
const { SOURCE_KINDS } = require('./source-trust');
const { readEventFacts } = require('./event-facts');
const { getServiceRegion, serviceRegionForLocation } = require('./service-regions');

const CATEGORIES = [
  'outdoors',
  'fitness',
  'sports',
  'games',
  'sales',
  'music',
  'community',
  'nightlife',
  'roadtrip',
  'arts',
  'learning',
  'food',
  'hiking',
  'other',
];

const RATINGS = ['family', 'general', 'mature'];
const SOURCES = ['seed', 'user', 'live'];

// Compatibility export for Utah-only consumers. New regions are separate
// acceptance policies; never expand this box across the country.
const BOUNDS = getServiceRegion('utah').bounds;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** Validate a candidate record. Returns { ok, errors: string[] }. */
function validateRecord(r) {
  const errors = [];
  if (!r || typeof r !== 'object') return { ok: false, errors: ['not an object'] };

  if (!isNonEmptyString(r.id)) errors.push('id missing');
  if (!isNonEmptyString(r.title)) errors.push('title missing');
  if (!CATEGORIES.includes(r.category)) errors.push(`bad category: ${r.category}`);
  if (!RATINGS.includes(r.rating)) errors.push(`bad rating: ${r.rating}`);
  if (!SOURCES.includes(r.source)) errors.push(`bad source: ${r.source}`);
  if (r.sourceKind !== undefined && !SOURCE_KINDS.includes(r.sourceKind)) errors.push(`bad sourceKind: ${r.sourceKind}`);
  if (!isNonEmptyString(r.venue)) errors.push('venue missing');
  if (!isNonEmptyString(r.area)) errors.push('area missing');
  if (!isNonEmptyString(r.whenLabel)) errors.push('whenLabel missing');
  if (!isNonEmptyString(r.description)) errors.push('description missing');
  if (r.eventFacts !== undefined && (r.eventFacts === null || typeof r.eventFacts !== 'object'
      || Array.isArray(r.eventFacts) || Object.keys(r.eventFacts).some((key) => !['admission', 'includesFood'].includes(key))
      || Object.keys(readEventFacts(r.eventFacts)).length !== Object.keys(r.eventFacts).length)) {
    errors.push('eventFacts require valid public evidence');
  }

  if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
    errors.push('coordinates not finite');
  } else if (r.lat === 0 && r.lng === 0) {
    errors.push('null-island coordinates');
  } else if (!serviceRegionForLocation(r)) {
    errors.push(`location outside the service region: ${r.lat},${r.lng}`);
  }

  if (typeof r.startsInMinutes !== 'number' || !Number.isFinite(r.startsInMinutes)) {
    errors.push('startsInMinutes missing');
  }
  if (r.source === 'live') {
    if (!isNonEmptyString(r.startsAtIso) || Number.isNaN(Date.parse(r.startsAtIso))) {
      errors.push('live record needs a parseable startsAtIso');
    }
  } else if (r.startsAtIso !== undefined && Number.isNaN(Date.parse(r.startsAtIso))) {
    errors.push('unparseable startsAtIso');
  }

  if (!Number.isFinite(r.attendees) || r.attendees < 0) errors.push('attendees missing');

  if (r.sourceUrl !== undefined) {
    if (!isNonEmptyString(r.sourceUrl) || !/^https:\/\//.test(r.sourceUrl)) {
      errors.push('sourceUrl must be https');
    }
  }
  if (r.sourceName !== undefined && !isNonEmptyString(r.sourceName)) {
    errors.push('sourceName empty');
  }
  if (r.endsAtIso !== undefined && Number.isNaN(Date.parse(r.endsAtIso))) {
    errors.push('unparseable endsAtIso');
  }

  // Mirror the onto.events check constraints (supabase/migrations/
  // 20260902000001_core.sql) so one bad row is rejected here instead of
  // failing a whole batch upsert:
  //   events_end_after_start   check (ends_at is null or ends_at >= starts_at)
  //   events_title_length      check (char_length(title) between 1 and 240)
  //   events_country_code_shape check (country_code ~ '^[A-Z]{2}$')
  if (
    r.endsAtIso !== undefined &&
    r.startsAtIso !== undefined &&
    !Number.isNaN(Date.parse(r.endsAtIso)) &&
    !Number.isNaN(Date.parse(r.startsAtIso)) &&
    Date.parse(r.endsAtIso) < Date.parse(r.startsAtIso)
  ) {
    errors.push('endsAtIso before startsAtIso');
  }
  // Array.from counts code points, matching Postgres char_length.
  if (typeof r.title === 'string' && Array.from(r.title).length > 240) {
    errors.push('title longer than 240 characters');
  }
  if (r.countryCode !== undefined && !/^[A-Z]{2}$/.test(String(r.countryCode))) {
    errors.push(`bad countryCode: ${r.countryCode}`);
  }

  return { ok: errors.length === 0, errors };
}

/** Split candidates into valid records and rejects (with reasons, for logs). */
function partitionValid(candidates) {
  const valid = [];
  const rejects = [];
  for (const c of candidates) {
    const { ok, errors } = validateRecord(c);
    if (ok) valid.push(c);
    else rejects.push({ id: c?.id ?? '(no id)', title: c?.title ?? '(no title)', errors });
  }
  return { valid, rejects };
}

module.exports = { CATEGORIES, RATINGS, SOURCES, BOUNDS, validateRecord, partitionValid };
