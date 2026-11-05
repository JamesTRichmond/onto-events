import { travelFor } from '@/data/activities';

/**
 * Listing URLs we will actually open. Anything else (missing, http, app
 * schemes) stays off the card and out of the details sheet.
 */
/**
 * Sources onto names but does not link out to (James, device pass on build 8,
 * 2026-09-25): Ticketmaster links landed on dead pages, and he does not want
 * onto sending people into their app. The event still shows, with its source
 * named, so supply stays honest about where it came from.
 */
const NO_LINK_OUT_SOURCES = new Set(['ticketmaster']);

export type SourceAction =
  | { kind: 'link'; url: string }
  | { kind: 'note'; text: string }
  | null;

export function sourceActionFor(item: {
  sourceName?: string | null;
  sourceUrl?: string | null;
}): SourceAction {
  const name = (item.sourceName ?? '').trim();
  if (NO_LINK_OUT_SOURCES.has(name.toLowerCase())) {
    return { kind: 'note', text: `Tickets are sold through ${name}. We don't link out to them.` };
  }
  const url = httpsOnlyUrl(item.sourceUrl);
  return url ? { kind: 'link', url } : null;
}

export function httpsOnlyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https:\/\//i.test(url) ? url : null;
}

/** Walk/drive estimate plus miles — same string on the card and in details. */
export function travelLabel(miles: number): string {
  const travel = travelFor(miles);
  const hrs = Math.floor(travel.minutes / 60);
  const mins = travel.minutes % 60;
  const duration =
    hrs > 0 ? (mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`) : `${mins} min`;
  return `${duration} ${travel.mode} · ${miles.toFixed(1)} mi`;
}


/** Copy lock: Share appears only after Going ✓. */
export function canShare(joined: boolean): boolean {
  return joined;
}

/** Aggregate headcount strangers see; never exact device location. */
export function headcountLabel(attendees: number): string {
  const n = Math.max(0, Math.floor(attendees));
  if (n <= 0) return 'Nobody marked Going yet';
  if (n === 1) return '1 going';
  return `${n} going`;
}

/** Permitted friend names only (empty when no opt-in grants). */
export function friendNamesLabel(names: readonly string[]): string | null {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return `${cleaned[0]} is going`;
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]} are going`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]} are going`;
}
