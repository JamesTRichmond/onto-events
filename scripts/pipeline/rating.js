// Content-tier rating rules (James's decided spec, TIER_QUESTIONS Q6:
// auto-map + his overrides). Ticketmaster's own family flag marked 0 of the
// first 53 real SLC events, so it cannot be the only authority: keyword and
// venue rules catch what the flag misses, and rating-overrides.json is the
// override channel — James edits that file, never this one.

const fs = require('node:fs');
const path = require('node:path');

// Conservative on the mature side: a false "mature" hides a general event
// from the default feed (bad); a false "general" shows a casino night to the
// default feed (worse, per the ground-up-safety rule).
const MATURE_PATTERNS = [
  /\bcasino\b/i,
  /\bgambling\b/i,
  /\bpoker\b/i,
  /\b21\s*\+/,
  /\b18\s*\+/,
  /\b21\s*(and|&)\s*(over|up|older)\b/i,
  /\b18\s*(and|&)\s*(over|up|older)\b/i,
  /\bmust\s*be\s*21\b/i,
  /\bage\s*restricted\b/i,
  /\bburlesque\b/i,
  /\bstrip\s*club\b/i,
  /\bbar\s*crawl\b/i,
  /\bpub\s*crawl\b/i,
  /\badults?\s*only\b/i,
  /\bno\s+minors\b/i,
  // Figure-drawing sessions with an undraped model (River Arts District studios).
  /\bundraped\b/i,
  /\bnudity\b/i,
  /\bnude\s+(?:models?|figures?|figure\s+drawing|life\s+drawing|sessions?)\b/i,
  /\b(?:minors?|children)\s+(?:(?:are|will\s+be)\s+)?(?:prohibited|forbidden|excluded|not\s+(?:allowed|permitted|admitted))\b/i,
];

const FAMILY_PATTERNS = [
  /\bkids?\b/i,
  /\bfamily\b/i,
  /\ball[-\s]?ages\b/i,
  /\bstorytime\b/i,
  /\bsesame\b/i,
  /\bdisney\b/i,
];

/**
 * Rate an event from its metadata. `signals` carries whatever the adapter
 * knows: { familyFlag, legalAgeEnforced, name, venueName, genre, segment,
 * description, info, pleaseNote }.
 */
function rateEvent(signals) {
  // A source's hard age-restriction flag is authoritative — no keyword needed.
  if (signals.legalAgeEnforced === true) return 'mature';
  // Verified 2026-09-05: the venue's Utah FAQ requires 21+ in SLC and West
  // Jordan with no exceptions. A missing provider age flag is not all-ages
  // admission evidence. https://www.wiseguyscomedy.com/utah/faqs
  if (/^wiseguys\b/i.test(signals.venueName ?? '')
      && /^(salt lake city|west jordan)$/i.test(signals.locality?.trim() ?? '')) return 'mature';

  const haystack = [
    signals.name,
    signals.venueName,
    signals.genre,
    signals.segment,
    signals.description,
    signals.info,
    signals.pleaseNote,
  ]
    .filter(Boolean)
    .join(' · ');

  if (MATURE_PATTERNS.some((re) => re.test(haystack))) return 'mature';
  if (signals.familyFlag === true) return 'family';
  if (FAMILY_PATTERNS.some((re) => re.test(haystack))) return 'family';
  return 'general';
}

const OVERRIDES_PATH = path.join(__dirname, '..', '..', 'data', 'rating-overrides.json');

/** Load James's per-id rating overrides ({"tm-XYZ": "mature", ...}). */
function loadOverrides(overridesPath = OVERRIDES_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    const clean = {};
    for (const [id, rating] of Object.entries(parsed)) {
      if (['family', 'general', 'mature'].includes(rating)) clean[id] = rating;
    }
    return clean;
  } catch {
    return {};
  }
}

/** Apply overrides to rated records (by canonical id). */
function applyOverrides(records, overrides) {
  return records.map((r) =>
    overrides[r.id] !== undefined ? { ...r, rating: overrides[r.id], ratingBasis: 'override' } : r
  );
}

module.exports = { rateEvent, loadOverrides, applyOverrides, OVERRIDES_PATH };
