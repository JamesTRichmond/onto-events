import { useEffect, useState } from 'react';

/**
 * Wall clock for time-dependent UI on web. Returns null on the very first
 * render — identical in the statically exported HTML and the client's
 * hydration pass, so no export-time value is baked into shipped markup and
 * hydration cannot mismatch — then the real time immediately after mount,
 * ticking every `intervalMs` so freshness math cannot go stale while the
 * page sits open. Native uses `use-now.ts` (clock on first paint).
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
