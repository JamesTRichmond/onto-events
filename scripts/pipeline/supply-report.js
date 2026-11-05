const fs = require('node:fs');
const { CATEGORIES, RATINGS, partitionValid } = require('./schema');
const { oneNightPhrase } = require('./event-signals');
const { venueKey } = require('./calendar-record');
const { dedupeRecords, isDuplicate } = require('./dedupe');
const { serviceRegionForLocation } = require('./service-regions');
const { readEventFacts, confirmedFreeAdmission } = require('./event-facts');
const { isCancelledTitle, isRestrictedListing } = require('./event-availability');

const DAY = 86400000;
const VENUE_KINDS = ['bar', 'club', 'theatre', 'hall', 'church', 'park', 'store', 'library', 'outdoor', 'other', 'unknown'];
const FIXTURE_NOW = '2026-09-01T00:00:00.000Z';

function counts(values, keys = []) {
  const result = new Map(keys.map((key) => [key, 0]));
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return Object.fromEntries([...result].sort(([a], [b]) => a.localeCompare(b)));
}

function venueKind(record, venues) {
  const curated = venues.find((v) => [v.name, ...v.aliases].some((name) => venueKey(name) === venueKey(record.venue)));
  return curated?.kind ?? (VENUE_KINDS.includes(record.venueKind) ? record.venueKind : 'unknown');
}

function buildSupplyReport({ records, results = [], summaries = [], freshness = [], now, evidence = 'provided' }, venues = []) {
  if (!Array.isArray(records) || !Number.isFinite(now)) throw new Error('Supply report requires records and a valid clock');
  const { valid, rejects } = partitionValid(records);
  // Per-source processing cannot see overlap with another adapter. Aggregate
  // metrics use strong/exact matches only, never the TM relisting heuristic.
  const publicRecords = valid.filter((r) => !isRestrictedListing(r.title, r.description));
  const combined = dedupeRecords(publicRecords.map((r) => isCancelledTitle(r.title) ? { ...r, isCancelled: true } : r), { weak: false });
  const ticketmaster = publicRecords.filter((r) => r.sourceName === 'Ticketmaster');
  const active = combined.records.filter((r) => r.isCancelled !== true && Number.isFinite(Date.parse(r.startsAtIso))
    && (r.endsAtIso ? Date.parse(r.endsAtIso) : Date.parse(r.startsAtIso) + 3 * 3600000) > now);
  const sources = [...new Set([...summaries.map((s) => s.sourceName), ...valid.map((r) => r.sourceName ?? 'Unknown')])];
  const windows = {};
  for (const days of [7, 30]) {
    // Include ongoing events until their explicit end, or the app's 3h grace.
    const selected = active.filter((r) => Date.parse(r.startsAtIso) < now + days * DAY);
    windows[days] = {
      total: selected.length,
      // An organizer copy of a TM event is not new supply beyond TM, even when
      // its richer metadata wins the combined dedupe identity/source credit.
      nonTicketmaster: selected.filter((r) => r.source === 'live' && r.sourceName && r.sourceName !== 'Ticketmaster'
        && !ticketmaster.some((tm) => isDuplicate(r, tm, { weak: false }))).length,
      byCategory: counts(selected.map((r) => r.category), CATEGORIES),
      byRating: counts(selected.map((r) => r.rating), RATINGS),
      bySource: counts(selected.map((r) => r.sourceName ?? 'Unknown'), sources),
      byVenue: counts(selected.map((r) => r.venue)),
      byServiceRegion: counts(selected.map((r) => serviceRegionForLocation(r)?.id ?? 'unknown')),
      byVisibleMode: { family: selected.filter((r) => r.rating === 'family').length,
        everyone: selected.filter((r) => r.rating === 'general').length },
      v2Visible: selected.filter((r) => r.rating === 'family' || r.rating === 'general').length,
      confirmedFree: selected.filter(confirmedFreeAdmission).length,
      confirmedIncludesFood: selected.filter((r) => readEventFacts(r.eventFacts).includesFood?.value === true).length,
      byVenueKind: counts(selected.map((r) => venueKind(r, venues)), VENUE_KINDS),
    };
  }
  const skipped = results.flatMap((r) => Object.entries(r.skipped ?? {}).flatMap(([reason, count]) => Array(count).fill(reason)));
  const diagnostics = results.flatMap((r) => Object.entries(r.diagnostics ?? {}).flatMap(([reason, count]) => Array(count).fill(reason)));
  const drops = [...results.flatMap((r) => r.dropped ?? []), ...combined.dropped];
  const failures = summaries.filter((s) => s.status === 'failed').map((s) => s.sourceName);
  return {
    reportVersion: 2, evidence, now: new Date(now).toISOString(),
    scope: 'Processed records from this run; not a database inventory. Counts do not imply successful catalog writes.',
    complete: !failures.length && !summaries.some((s) => s.status === 'skipped'),
    inputRecords: records.length, uniqueRecords: combined.records.length,
    invalidInputRecords: rejects.length, restrictedRecords: valid.length - publicRecords.length, aggregateDedupeMerges: combined.dropped.length, windows,
    cancelledRecords: combined.records.filter((r) => r.isCancelled === true).length,
    sources: summaries.map(({ sourceName, status, reason, recordCount, rejectedCount, upsertedCount, unmapped }) => ({ sourceName, status, reason, recordCount, rejectedCount, upsertedCount, unmapped,
      lastSuccessfulRefresh: freshness.find((entry) => entry.sourceName === sourceName)?.completedAt ?? null })),
    failedSources: failures, skippedByReason: counts(skipped),
    unmappedVenues: skipped.filter((reason) => reason === 'unmapped venue').length,
    diagnostics: counts(diagnostics),
    rejectsByReason: counts([...rejects, ...results.flatMap((r) => r.rejects ?? [])].flatMap((r) => r.errors)),
    dedupeMergesByRule: counts(drops.filter((d) => d.rule !== 'title-cap').map((d) => d.rule), ['exact', 'strong', 'weak']),
    titleCapDrops: drops.filter((d) => d.rule === 'title-cap').length,
    oneNightOnly: active.filter((r) => Date.parse(r.startsAtIso) < now + 30 * DAY && oneNightPhrase(r))
      .sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso) || a.id.localeCompare(b.id)).slice(0, 10)
      .map((r) => ({ id: r.id, title: r.title, startsAtIso: r.startsAtIso, sourceName: r.sourceName, sourceUrl: r.sourceUrl, phrase: oneNightPhrase(r) })),
    advisory: {
      blocking: false, acceptedByJames: false, targetNonTicketmaster30Days: 150,
      met: windows[30].nonTicketmaster >= 150,
      message: evidence === 'fixture' ? 'Fixture counts never establish live coverage or a challenge tier.'
        : 'Targets are advisory until James accepts measured live baselines. No tier is automatically awarded.',
    },
  };
}

/** Exact public event identity across snapshots; no fuzzy additions claim. */
function eventIdentity(record) {
  return JSON.stringify([record.title.trim().toLowerCase().replace(/\s+/g, ' '), record.venue.trim().toLowerCase().replace(/\s+/g, ' '),
    new Date(record.startsAtIso).toISOString(), record.lat, record.lng]);
}

function compareSupplySnapshots(baseline, current, now) {
  if (!Number.isFinite(now)) throw new Error('Comparison requires a fixed valid clock');
  const report = (snapshot) => buildSupplyReport({ ...snapshot, now });
  const visible = (snapshot) => {
    const checked = partitionValid(snapshot.records);
    if (checked.rejects.length) throw new Error('Comparison cannot count invalid records');
    return new Set(dedupeRecords(checked.valid.filter((r) => !isRestrictedListing(r.title, r.description)), { weak: false }).records.filter((r) => ['family', 'general'].includes(r.rating)
      && !r.isCancelled && !isCancelledTitle(r.title) && Date.parse(r.startsAtIso) < now + 30 * DAY
      && (r.endsAtIso ? Date.parse(r.endsAtIso) : Date.parse(r.startsAtIso) + 3 * 3600000) > now).map(eventIdentity));
  };
  const beforeReport = report(baseline), afterReport = report(current);
  const before = visible(baseline), after = visible(current);
  const added = [...after].filter((key) => !before.has(key)).length;
  const removed = [...before].filter((key) => !after.has(key)).length;
  const liveTargetEvaluable = baseline.evidence === 'live' && current.evidence === 'live' && beforeReport.complete && afterReport.complete;
  return { now: new Date(now).toISOString(), windowDays: 30, baselineCapturedAt: new Date(baseline.now).toISOString(),
    currentCapturedAt: new Date(current.now).toISOString(), baselineVisible: before.size, currentVisible: after.size,
    added, removed, netIncrease: added - removed,
    liveTargetEvaluable, proposedNet50Met: liveTargetEvaluable && added - removed >= 50,
    limits: 'Same fixed 30-day window; processed snapshots only. No production, permission or device acceptance implied. Mature supply excluded.' };
}

function saveSyncSnapshot(file, result, { now, evidence, redact = (value) => value }) {
  const snapshot = { format: 'onto-supply-snapshot-v1', now, evidence,
    records: result.records, summaries: result.summaries,
    results: result.results.map(({ records, ...diagnostics }) => diagnostics) };
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, redact(JSON.stringify(snapshot)), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

module.exports = { buildSupplyReport, compareSupplySnapshots, saveSyncSnapshot, FIXTURE_NOW, venueKind };
