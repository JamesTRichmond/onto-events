import { useEffect, useState } from 'react';

/**
 * Wall clock for time-dependent UI on native (TestFlight / iOS / Android).
 * Starts with `Date.now()` on first paint so Discover's Updated label is
 * visible immediately — no post-mount flash of a missing freshness line.
 * Web keeps null-until-mount in `use-now.web.ts` so static export stays quiet.
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
