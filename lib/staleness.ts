import { StockFreshness } from '@/lib/stock-freshness';

/**
 * Back-compat wrapper: tip publish gate banner (rule 4).
 * Prefer StockFreshness.tipStaleBanner / lastRefreshedLabel at call sites.
 */
export function stalenessLabel(generatedAtIso: string | undefined, now: number | null): string | null {
  return StockFreshness.tipStaleBanner(generatedAtIso, now);
}
