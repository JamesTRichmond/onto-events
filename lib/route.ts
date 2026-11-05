import { milesBetween } from '@/data/activities';
import { directionsFor, type MapsApp } from '@/lib/maps-choice';

/** A stop already on the Going list. Start time is optional. */
export type RouteStop = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  startsAtMs: number | null;
};

/** Stops that start this close together are one errand, ordered by distance. */
const SAME_ERRAND_MS = 45 * 60_000;
/** Maps links stay reliable under this many stops. Apple's +to: chain. */
export const ROUTE_STOP_CAP = 10;
/** Google Maps on the web keeps a destination plus three waypoints. */
export const GOOGLE_ROUTE_CAP = 4;

/** How many stops the handoff will actually open. */
export function routeCap(app: MapsApp, platform?: string): number {
  if (app === 'waze') return 1;
  if (app === 'system' && platform === 'ios') return ROUTE_STOP_CAP;
  return GOOGLE_ROUTE_CAP;
}

function finiteStop(stop: RouteStop): boolean {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
}

function nearestFirst(from: { lat: number; lng: number }, stops: RouteStop[]): RouteStop[] {
  const rest = [...stops];
  const ordered: RouteStop[] = [];
  let cursor = from;
  while (rest.length > 0) {
    let best = 0;
    let bestMiles = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const miles = milesBetween(cursor.lat, cursor.lng, rest[i].lat, rest[i].lng);
      if (miles < bestMiles) {
        bestMiles = miles;
        best = i;
      }
    }
    const [next] = rest.splice(best, 1);
    ordered.push(next);
    cursor = next;
  }
  return ordered;
}

/**
 * Time first, then distance. A later start never jumps ahead of an earlier one
 * unless they begin within the same errand window — then the closer stop is first
 * so the route does not double back.
 */
export function orderStops(origin: { lat: number; lng: number }, stops: readonly RouteStop[]): RouteStop[] {
  const valid = stops.filter(finiteStop);
  const timed = valid
    .filter((stop) => stop.startsAtMs != null)
    .sort((a, b) => a.startsAtMs! - b.startsAtMs!);
  const untimed = valid.filter((stop) => stop.startsAtMs == null);

  const clusters: RouteStop[][] = [];
  for (const stop of timed) {
    const current = clusters[clusters.length - 1];
    const previous = current?.[0];
    if (current && previous && stop.startsAtMs! - previous.startsAtMs! <= SAME_ERRAND_MS) {
      current.push(stop);
    } else {
      clusters.push([stop]);
    }
  }

  let cursor = origin;
  const ordered: RouteStop[] = [];
  for (const cluster of clusters) {
    const next = nearestFirst(cursor, cluster);
    ordered.push(...next);
    cursor = next[next.length - 1] ?? cursor;
  }
  ordered.push(...nearestFirst(cursor, untimed));
  return ordered.slice(0, ROUTE_STOP_CAP);
}

/**
 * Opens the chosen maps app on the venue points only.
 * A device browse omits the start so the phone supplies it, and ordering used that same fix.
 * A pin or Salt Lake City browse passes that chosen point as the start — never raw GPS.
 * Waze has no public multi-stop link, so it gets the first stop of this order.
 * Apple multi-stop uses one daddr joined with +to:, which Map Links actually follows.
 * Anything that is not iOS system maps uses Google, including the web build.
 */
export function routeUrl(
  app: MapsApp,
  stops: readonly RouteStop[],
  platform?: string,
  origin?: { lat: number; lng: number } | null,
): string | null {
  const capped = stops.slice(0, routeCap(app, platform));
  if (capped.length === 0) return null;
  if (capped.length === 1 || app === 'waze') {
    const first = capped[0];
    return directionsFor(app, first.lat, first.lng, first.label, platform);
  }
  if (app === 'system' && platform === 'ios') {
    const chain = capped.map((stop) => `${stop.lat},${stop.lng}`).join('+to:');
    const start = origin ? `${origin.lat},${origin.lng}` : 'Current%20Location';
    return `https://maps.apple.com/?saddr=${start}&daddr=${encodeURIComponent(chain)}`;
  }
  const last = capped[capped.length - 1];
  const middle = capped.slice(0, -1);
  const waypoints = encodeURIComponent(middle.map((stop) => `${stop.lat},${stop.lng}`).join('|'));
  const start = origin ? `&origin=${origin.lat},${origin.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${start}&destination=${last.lat},${last.lng}&waypoints=${waypoints}&travelmode=driving`;
}
