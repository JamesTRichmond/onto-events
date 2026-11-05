// The offline bundle's local listings (James, 2026-10-07: the default view is
// always free and local first, offline included). The records come from the
// same adapters, venue registry, dedupe and rating escalation as the cloud
// sync, run without writing; this keeps what a cold launch can still show.

// Pipeline bookkeeping the app's Activity type does not carry. The source kind
// is derived again on the phone from the source credit (data/source-trust.ts).
const PIPELINE_ONLY = ['sourceKind', 'venueKind', 'ratingBasis'];
// The cloud catalog keeps the full text; the bundle carries a card's worth.
// Ratings were already decided on the full text by the pipeline.
const MAX_DESCRIPTION = 280;

function endOf(record) {
  return Date.parse(record.endsAtIso ?? record.startsAtIso);
}

function shortened(text) {
  const chars = Array.from(text ?? '');
  return chars.length <= MAX_DESCRIPTION ? text : `${chars.slice(0, MAX_DESCRIPTION - 1).join('').trimEnd()}…`;
}

/** Upcoming, uncancelled, non-ticketing records in start order, app fields only. */
function localSnapshot(records, now) {
  return records
    .filter((record) => record.sourceKind !== 'ticketing' && !record.isCancelled)
    .filter((record) => Number.isFinite(Date.parse(record.startsAtIso)) && endOf(record) >= now)
    .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso) || a.id.localeCompare(b.id))
    .map((record) => {
      const kept = Object.fromEntries(Object.entries(record).filter(([key]) => !PIPELINE_ONLY.includes(key)));
      return typeof kept.description === 'string' ? { ...kept, description: shortened(kept.description) } : kept;
    });
}

module.exports = { localSnapshot, PIPELINE_ONLY, MAX_DESCRIPTION };
