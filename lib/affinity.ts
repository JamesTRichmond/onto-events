import { ActivityCategory, ALL_CATEGORIES } from '@/data/activities';

/**
 * The on-device taste engine — the privacy-first seed of the brief's
 * TikTok-style learner. What it keeps: one small decayed weight per
 * category, plus a timestamp. What it never keeps: raw view logs, event
 * ids, timestamps per action, or anything that reconstructs behavior.
 * Everything lives on-device (storage manifest: onto.affinities.v1) and
 * dies with "Erase my onto data".
 */
export type AffinityWeights = Partial<Record<ActivityCategory, number>>;

export type AffinityState = {
  weights: AffinityWeights;
  /** ISO timestamp of the last update; drives decay on load. */
  updatedAt: string;
};

/**
 * Signal strengths: committing beats browsing. The Discover deck adds two
 * (FEATURES.md §5): a right swipe (maybe) counts like a join, a left swipe
 * (pass) takes a little away. Going stays the join signal.
 */
export const SIGNAL_WEIGHT = { join: 1.0, action: 0.5, maybe: 1.0, pass: -0.4 } as const;
export type AffinitySignal = keyof typeof SIGNAL_WEIGHT;

const WEIGHT_CAP = 10;
const PRUNE_BELOW = 0.05;
/** Weights halve every 30 days of inactivity — last month's taste, not last year's. */
const HALF_LIFE_DAYS = 30;

/**
 * Add one signal to a category's weight. `direction: -1` takes the same
 * signal back (the deck's Undo), so an undone swipe leaves taste where it was.
 *
 * Weights never go below zero: a pass can wear down what a category earned,
 * but it never pushes a category under neutral. A negative weight would turn
 * this boost into a demotion — a second, silent ranker the viewer never asked
 * for — and `affinityBoost` is singular at w = -2.
 */
export function recordSignal(
  weights: AffinityWeights,
  category: ActivityCategory,
  signal: AffinitySignal,
  direction: 1 | -1 = 1
): AffinityWeights {
  const current = weights[category] ?? 0;
  const next = Math.max(0, Math.min(WEIGHT_CAP, current + direction * SIGNAL_WEIGHT[signal]));
  if (next < PRUNE_BELOW) {
    const pruned = { ...weights };
    delete pruned[category];
    return pruned;
  }
  return { ...weights, [category]: next };
}

/**
 * Combine decayed stored taste with signals recorded before the load settled.
 * Additive, never last-write-wins: a tap in the first frames is a real signal
 * ON TOP of history, not a replacement for it. Spreading `{...stored,
 * ...pending}` instead would silently discard everything learned about that
 * category.
 */
export function mergeWeights(
  stored: AffinityWeights,
  pending: AffinityWeights
): AffinityWeights {
  const merged: AffinityWeights = { ...stored };
  for (const [category, weight] of Object.entries(pending)) {
    const key = category as ActivityCategory;
    merged[key] = Math.min(WEIGHT_CAP, (merged[key] ?? 0) + (weight as number));
  }
  return merged;
}

/** Apply time decay and prune negligible weights. */
export function decayWeights(weights: AffinityWeights, elapsedDays: number): AffinityWeights {
  if (!(elapsedDays > 0)) return weights;
  const factor = 0.5 ** (elapsedDays / HALF_LIFE_DAYS);
  const next: AffinityWeights = {};
  for (const [category, weight] of Object.entries(weights)) {
    const decayed = (weight as number) * factor;
    if (decayed >= PRUNE_BELOW) next[category as ActivityCategory] = decayed;
  }
  return next;
}

/**
 * Score contribution for a category, saturating toward 60 — always below the
 * 120 of an explicitly picked interest. What the user says outranks what the
 * app thinks it noticed.
 */
export function affinityBoost(weights: AffinityWeights, category: ActivityCategory): number {
  const w = weights[category] ?? 0;
  return (60 * w * (WEIGHT_CAP + 2)) / (WEIGHT_CAP * (w + 2));
}

/** Parse persisted state defensively; garbage in, empty taste out. */
export function parseAffinityState(raw: string): AffinityState {
  const empty: AffinityState = { weights: {}, updatedAt: new Date(0).toISOString() };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return empty;
    const candidate = parsed as { weights?: unknown; updatedAt?: unknown };
    if (typeof candidate.weights !== 'object' || candidate.weights === null) return empty;
    const weights: AffinityWeights = {};
    for (const [category, weight] of Object.entries(candidate.weights)) {
      if (
        (ALL_CATEGORIES as string[]).includes(category) &&
        typeof weight === 'number' &&
        Number.isFinite(weight) &&
        weight > 0
      ) {
        weights[category as ActivityCategory] = Math.min(WEIGHT_CAP, weight);
      }
    }
    const updatedAt =
      typeof candidate.updatedAt === 'string' && !Number.isNaN(Date.parse(candidate.updatedAt))
        ? candidate.updatedAt
        : empty.updatedAt;
    return { weights, updatedAt };
  } catch {
    return empty;
  }
}
