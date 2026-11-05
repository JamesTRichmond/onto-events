const fs = require('node:fs');
const dedupe = require('./dedupe');
const rating = require('./rating');
const schema = require('./schema');
const { createPoliteFetch } = require('./polite-fetch');

// Adapters return raw items plus completeness metadata. Normalization and
// catalog writes never have to know the provider's pagination format.
function processSourceItems(adapter, snapshot, { now = Date.now(), overrides = rating.loadOverrides() } = {}) {
  const { items, truncated = false } = Array.isArray(snapshot) ? { items: snapshot } : snapshot;
  if (!Array.isArray(items)) throw new Error('Source snapshot needs an items array');
  const skipped = {};
  // Unresolved venue strings, counted per source run. onto never guesses a
  // location, so what a feed loses is supply data, not noise to swallow.
  const unmapped = {};
  const context = { now, skip: (reason, candidate) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
    if (candidate) unmapped[candidate] = (unmapped[candidate] ?? 0) + 1;
  } };
  const candidates = items.map((raw) => adapter.normalize(raw, context)).filter(Boolean);
  const { valid, rejects } = schema.partitionValid(candidates);
  // A source must never write rows into another source's retirement scope.
  if (valid.some((record) => record.sourceName !== adapter.sourceName || record.source !== 'live')) {
    throw new Error('Source record identity does not match its registered source');
  }
  if (!adapter.idPrefix || valid.some((record) => !record.id.startsWith(adapter.idPrefix))) {
    throw new Error('Source record id does not match its registered prefix');
  }
  if (adapter.sourceKind && valid.some((record) => record.sourceKind !== adapter.sourceKind)) {
    throw new Error('Source record kind does not match its registered source');
  }
  const rated = rating.applyOverrides(valid, overrides);
  const deduped = dedupe.dedupeRecords(rated, { weak: adapter.weakDedupe !== false });
  deduped.records.sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));
  const capped = dedupe.capTitleRuns(deduped.records, adapter.maxCardsPerTitle);
  return {
    // Every validated copy, before dedupe and the title cap drop any: a
    // capped copy still proves the rating another source must carry.
    records: capped.records, ratingEvidence: rated, rawCount: items.length, normalizedCount: candidates.length,
    validCount: valid.length, rejectedCount: rejects.length, rejects, skipped,
    unmapped: Object.fromEntries(
      Object.entries(unmapped).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ),
    dropped: [...deduped.dropped, ...capped.dropped], truncated,
    ...(snapshot.horizon ? { horizon: snapshot.horizon } : {}),
    ...(snapshot.diagnostics ? { diagnostics: snapshot.diagnostics } : {}),
    ...(snapshot.skipReason ? { skipReason: snapshot.skipReason } : {}),
    ...(snapshot.retireMissing === false ? { retireMissing: false } : {}),
  };
}

async function fetchSourceRecords(adapter, options = {}) {
  options = { now: Date.now(), ...options };
  const fetchImpl = options.politeFetch ?? createPoliteFetch(options);
  const snapshot = await adapter.fetch({ ...options, fetchImpl });
  return processSourceItems(adapter, snapshot, options);
}

function readSourceFixture(adapter, fixturePath = adapter.fixturePath, options = {}) {
  const content = fs.readFileSync(fixturePath, 'utf8');
  const snapshot = adapter.parseFixture ? adapter.parseFixture(content, { now: options.now ?? Date.now() }) : JSON.parse(content);
  return processSourceItems(adapter, snapshot, { overrides: {}, ...options });
}

module.exports = { processSourceItems, fetchSourceRecords, readSourceFixture };
