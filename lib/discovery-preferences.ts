export { FEED_RADIUS_CHOICES_MI as RADIUS_OPTIONS, DEFAULT_FEED_RADIUS_MI as DEFAULT_RADIUS_MI, parseRadius } from '@/lib/feed-radius';

// Soonest is the default (James, 2026-10-07). A saved 'foryou' predates the
// removal of that sort and reads as the default.
export function parseSort(value: string | null): 'nearest' | 'soonest' {
  return value === 'nearest' ? 'nearest' : 'soonest';
}
