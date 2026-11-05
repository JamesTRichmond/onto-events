// Cross-source dedupe. Three rules, strictest first:
//   exact  — same canonical id (a source re-sent the same record)
//   strong — same normalized title, starts within 15 minutes, venues within
//            0.15 mi (the same happening listed by two sources)
//   weak   — same source only: same normalized title on the same venue-local
//            calendar day (Ticketmaster relists the same show with separate
//            ids; local day avoids UTC rollovers on evening shows)
// The richer record wins (more optional fields, longer description); missing
// optional fields are filled from the record it absorbed.

const EARTH_RADIUS_MI = 3958.8;

function milesBetween(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

/** Lowercase, de-accent, strip punctuation, collapse spaces, drop leading "the". */
function normalizeTitle(title) {
  return String(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

function richness(record) {
  let score = 0;
  if (record.sourceUrl) score += 2;
  if (record.openSlots !== undefined) score += 1;
  score += Math.min(2, (record.description?.length ?? 0) / 70);
  return score;
}

function mergeRecords(winner, loser) {
  const merged = { ...winner };
  for (const key of ['sourceUrl', 'sourceName', 'openSlots', 'startsAtIso', 'endsAtIso']) {
    if (merged[key] === undefined && loser[key] !== undefined) merged[key] = loser[key];
  }
  // Richer copy can choose identity/provenance, never erase an adult-content
  // or explicit cancellation signal supplied by the duplicate it absorbs.
  if (winner.rating !== 'mature' && loser.rating === 'mature') {
    merged.rating = 'mature';
    if (loser.ratingBasis !== undefined) merged.ratingBasis = loser.ratingBasis;
    else delete merged.ratingBasis;
  }
  if (winner.isCancelled === true || loser.isCancelled === true) merged.isCancelled = true;
  if (merged.endsAtIso && Date.parse(merged.endsAtIso) < Date.parse(merged.startsAtIso)) delete merged.endsAtIso;
  return merged;
}

/** Venue-local calendar day for the weak-match rule, falling back to the
 *  UTC date when a source doesn't supply its own local day. */
function localDayOf(record) {
  if (typeof record.localDay === 'string' && record.localDay !== '') return record.localDay;
  return record.startsAtIso.slice(0, 10);
}

function isDuplicate(a, b, { weak = true } = {}) {
  if (a.id === b.id) return 'exact';
  // Emoji-only or non-Latin titles normalize to nothing; that is no match.
  const title = normalizeTitle(a.title);
  if (!title || title !== normalizeTitle(b.title)) return null;

  const aStart = a.startsAtIso ? Date.parse(a.startsAtIso) : null;
  const bStart = b.startsAtIso ? Date.parse(b.startsAtIso) : null;
  if (aStart !== null && bStart !== null) {
    const minutesApart = Math.abs(aStart - bStart) / 60000;
    if (minutesApart <= 15 && milesBetween(a.lat, a.lng, b.lat, b.lng) <= 0.15) {
      return 'strong';
    }
    if (
      weak && a.sourceName !== undefined &&
      a.sourceName === b.sourceName &&
      localDayOf(a) === localDayOf(b)
    ) {
      return 'weak';
    }
  }
  return null;
}

/**
 * Deduplicate records, keeping input order of surviving records.
 * Returns { records, dropped: [{ keptId, droppedId, rule }] }.
 */
function dedupeRecords(records, options = {}) {
  const kept = [];
  const dropped = [];

  for (const candidate of records) {
    let absorbed = false;
    for (let i = 0; i < kept.length; i++) {
      const rule = isDuplicate(kept[i], candidate, options);
      if (!rule) continue;
      const winnerIsKept = richness(kept[i]) >= richness(candidate);
      const winner = winnerIsKept ? kept[i] : candidate;
      const loser = winnerIsKept ? candidate : kept[i];
      kept[i] = mergeRecords(winner, loser);
      dropped.push({ keptId: winner.id, droppedId: loser.id, rule });
      absorbed = true;
      break;
    }
    if (!absorbed) kept.push(candidate);
  }

  return { records: kept.map(omitLocalDay), dropped };
}

/** Drop the internal-only localDay field before records leave the pipeline. */
function omitLocalDay(record) {
  if (record.localDay === undefined) return record;
  const { localDay, ...rest } = record;
  return rest;
}

/**
 * Cap any one title's cards so daily theater runs don't flood the feed
 * (QA finding: nine identical "Joseph" cards on different days survive
 * dedupe legitimately). Records must arrive sorted soonest-first so the
 * nearest showings are the ones kept.
 * Returns { records, dropped: [{ keptId, droppedId, rule: 'title-cap' }] }.
 */
const MAX_CARDS_PER_TITLE = 2;
function capTitleRuns(records, max = MAX_CARDS_PER_TITLE) {
  const firstByTitle = new Map();
  const runs = new Map();
  const kept = [];
  const dropped = [];
  for (const record of records) {
    const title = normalizeTitle(record.title);
    // Emoji-only or non-Latin titles normalize to nothing: no shared run.
    if (!title) { kept.push(record); continue; }
    const count = runs.get(title) ?? 0;
    if (count >= max) {
      dropped.push({ keptId: firstByTitle.get(title), droppedId: record.id, rule: 'title-cap' });
      continue;
    }
    if (count === 0) firstByTitle.set(title, record.id);
    runs.set(title, count + 1);
    kept.push(record);
  }
  return { records: kept, dropped };
}

const SEVERITY = { family: 0, general: 1, mature: 2 };

/**
 * Cross-source rating carry. Every copy of one happening takes one rating
 * before any row is written. A build without 21+ content never downloads
 * mature rows, so the app alone could not keep a general copy of a happening
 * another source rated mature out of Everyone. Two links make one happening:
 *   - the strong rule (same normalized title, 15 minutes, 0.15 mi);
 *   - James, 2026-10-08: two different sources at the same registry venue
 *     starting at the same instant, whatever their titles. Aggregators retitle
 *     reposts and drop "21+"; exact venue and exact start, never similarity.
 * Links chain: A~B and B~C put A and C in one happening.
 *
 * The happening takes the strictest rating its evidence supports (family <
 * general < mature). James, 2026-10-08 (option b): when a source other than
 * an aggregator states All Ages for a bar or club show, a mature rating that
 * rests only on the venue type (`ratingBasis: 'venue-default'`) is not
 * evidence, so the venue's own All Ages stands for every copy. A stated age
 * limit, a legal-age venue, an override, or a copy whose basis is unknown
 * (stored rows, Ticketmaster) still counts in full.
 * Returns a Map of record id -> rating for every copy in a linked group.
 */
function groupRatings(records) {
  const parent = records.map((_, index) => index);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const link = (i, j) => { parent[root(j)] = root(i); };
  const byTitle = new Map();
  const bySlot = new Map();
  const source = (record) => String(record.sourceName ?? '').trim().toLowerCase();
  records.forEach((record, index) => {
    if (!record.startsAtIso) return;
    const title = normalizeTitle(record.title);
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), index]);
    const start = Date.parse(record.startsAtIso);
    const venue = String(record.venue ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (venue && Number.isFinite(start) && source(record)) {
      const slot = `${venue}\0${start}`;
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), index]);
    }
  });
  for (const bucket of byTitle.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (isDuplicate(records[bucket[i]], records[bucket[j]], { weak: false })) link(bucket[i], bucket[j]);
      }
    }
  }
  for (const bucket of bySlot.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (source(records[bucket[i]]) !== source(records[bucket[j]])) link(bucket[i], bucket[j]);
      }
    }
  }
  const groups = new Map();
  records.forEach((record, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), record]));
  const ratings = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const venueAllAges = group.some((record) => record.ratingBasis === 'all-ages' && record.sourceKind !== 'aggregator');
    const evidence = venueAllAges ? group.filter((record) => record.ratingBasis !== 'venue-default') : group;
    const rating = evidence.reduce((worst, record) => (SEVERITY[record.rating] > SEVERITY[worst] ? record.rating : worst), 'family');
    for (const record of group) ratings.set(record.id, rating);
  }
  return ratings;
}

/** The ratings strictestRatings would change, relative to the copies given. */
function changedRatings(records) {
  const given = new Map(records.map((record) => [record.id, record.rating]));
  return new Map([...groupRatings(records)].filter(([id, rating]) => given.get(id) !== rating));
}

// Kept under its old name for callers that want only the changes.
const strictestRatings = changedRatings;

module.exports = { dedupeRecords, capTitleRuns, normalizeTitle, milesBetween, isDuplicate, strictestRatings, groupRatings };
