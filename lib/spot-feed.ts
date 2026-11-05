import { milesBetween } from '@/data/activities';
import {
  SPOTS,
  type EvergreenSpot,
  type PlaceKind,
  type PlaceWeatherKind,
} from '@/data/spots';
import { cityClock, type CityClock, type DayPart } from '@/lib/daypart';
import { ratingsFor, type TierMode } from '@/lib/tiers';
import { getServiceRegion, regionForSpot } from '@/lib/service-region';

export type SkyFit = 'now' | 'good' | 'wait' | 'poor';
export type PlaceSort = 'sky' | 'nearest' | 'open';
export type PlaceFilter = 'all' | Exclude<PlaceKind, 'forage'>;

/** On-device sun instants and fresh observations; unavailable fields stay null. */
export type PlaceSky = {
  kind: PlaceWeatherKind | null;
  temperatureF: number | null;
  windMph: number | null;
  sunriseAt: number | null;
  sunsetAt: number | null;
  nextSunriseAt?: number | null;
};

export type RankedPlace = {
  spot: EvergreenSpot;
  miles: number;
  fit: SkyFit;
  line: string;
  score: number;
};

export function isWatershed(spot: EvergreenSpot): boolean {
  return spot.stewardship.includes('No swimming');
}

const FIT_ORDER: Record<SkyFit, number> = { now: 0, good: 1, wait: 2, poor: 3 };

function daypartHit(spot: EvergreenSpot, clock: CityClock): number {
  if (spot.dayparts.includes('anytime')) return 1;
  const overlap = spot.dayparts.filter((part) => clock.parts.includes(part as DayPart));
  if (overlap.length === 0) return 0;
  if (overlap.includes('sunrise') || overlap.includes('sunset') || overlap.includes('golden')) return 3;
  if (overlap.includes('late') && clock.afterLastCall) return 3;
  if (overlap.includes('afterSchool') || overlap.includes('afterWork')) return 2;
  return 1;
}

function laterHint(spot: EvergreenSpot): string {
  if (spot.dayparts.includes('sunset') || spot.dayparts.includes('golden')) return 'sunset';
  if (spot.dayparts.includes('sunrise')) return 'sunrise';
  if (spot.dayparts.includes('late')) return 'late';
  if (spot.dayparts.includes('afterWork')) return 'after work';
  if (spot.dayparts.includes('afterSchool')) return 'after school';
  if (spot.dayparts.includes('morning')) return 'morning';
  return 'another hour';
}

export function skyFit(
  spot: EvergreenSpot,
  weather: PlaceSky,
  clock: CityClock,
): { fit: SkyFit; line: string; score: number } {
  const kind = weather.kind;
  const wet = kind === 'rain' || kind === 'thunder' || kind === 'drizzle';
  const indoor = spot.setting === 'indoor' || spot.indoorBoost;
  const hit = daypartHit(spot, clock);
  const bad = kind !== null && spot.badSky.includes(kind);
  const good = kind !== null && spot.goodSky.includes(kind);
  const cold = spot.minTempF != null && weather.temperatureF !== null && weather.temperatureF < spot.minTempF;
  const windy = spot.maxWindMph != null && weather.windMph !== null && weather.windMph > spot.maxWindMph;

  let result: { fit: SkyFit; line: string; score: number };
  if (indoor && wet) {
    result = {
      fit: hit ? 'now' : 'good',
      line: hit ? 'This hour · indoors' : 'This sky · indoors',
      score: 8 + hit,
    };
  } else if (bad || cold || windy) {
    const why = cold ? 'Too cold for this one' : windy ? 'Too windy up there' : wet ? 'Wait out the sky' : 'Not this weather';
    result = { fit: 'poor', line: why, score: -2 };
  } else if (kind === null) {
    result = hit
      ? { fit: 'good', line: 'Based on time of day · check venue hours', score: 5 + hit }
      : { fit: 'wait', line: `Better at ${laterHint(spot)} · check venue hours`, score: 1 };
  } else if (hit >= 2 && good) {
    const line =
      clock.aroundSunset && spot.dayparts.includes('sunset')
        ? 'Sunset is the hour'
        : clock.aroundSunrise && spot.dayparts.includes('sunrise')
          ? 'Sunrise is the hour'
          : clock.afterLastCall && spot.dayparts.includes('late')
            ? 'After last call'
            : clock.parts.includes('afterSchool') && spot.dayparts.includes('afterSchool')
              ? 'After school'
              : clock.parts.includes('afterWork') && spot.dayparts.includes('afterWork')
                ? 'After work'
                : 'This hour';
    result = { fit: 'now', line, score: 10 + hit };
  } else if (good && hit) {
    result = { fit: 'now', line: 'This hour', score: 7 + hit };
  } else if (good) {
    result = { fit: 'wait', line: `Better at ${laterHint(spot)}`, score: 3 };
  } else if (hit) {
    result = { fit: 'good', line: 'Good time of day · check venue hours', score: 5 + hit };
  } else {
    result = { fit: 'wait', line: `Better at ${laterHint(spot)}`, score: 1 };
  }

  if (isWatershed(spot)) {
    return { ...result, line: result.line.replace(/swim/gi, 'look') };
  }
  return result;
}

function visible(spot: EvergreenSpot, mode: TierMode): boolean {
  if (spot.rating === 'mature') return ratingsFor(mode).has('mature');
  if (mode === 'family') return spot.rating === 'family';
  return true;
}

function matchesFilter(spot: EvergreenSpot, placeKind: PlaceFilter): boolean {
  if (placeKind === 'all') return true;
  if (placeKind === 'indoor') return spot.setting === 'indoor' || spot.placeKind === 'indoor';
  return spot.placeKind === placeKind;
}

export function buildPlacesFeed(input: {
  now: Date;
  origin: { lat: number; lng: number };
  radiusMi: number;
  sort: PlaceSort;
  mode: TierMode;
  placeKind: PlaceFilter;
  query?: string;
  weather: PlaceSky;
  includeFar?: boolean;
  timeZone?: string;
  /** Tests pass one place. The app uses the catalog. */
  spots?: readonly EvergreenSpot[];
}): { nearby: RankedPlace[]; farther: RankedPlace[]; clock: CityClock } {
  const region = regionForSpot(input.origin);
  const timeZone = input.timeZone ?? (region ? getServiceRegion(region)?.timezone : null) ?? 'UTC';
  const clock = cityClock(input.now, input.weather.sunriseAt, input.weather.sunsetAt, timeZone, input.weather.nextSunriseAt);
  const q = (input.query ?? '').trim().toLowerCase();
  const nearby: RankedPlace[] = [];
  const farther: RankedPlace[] = [];

  for (const spot of input.spots ?? SPOTS) {
    // Containment precedes radius splitting: "farther" never means another region.
    if (!region || spot.serviceRegion !== region || regionForSpot(spot) !== region) continue;
    if (!visible(spot, input.mode)) continue;
    if (spot.weekdays && !spot.weekdays.includes(clock.weekday)) continue;
    if (!matchesFilter(spot, input.placeKind)) continue;
    if (q) {
      const hay = `${spot.title} ${spot.venue} ${spot.area} ${spot.short} ${spot.placeKind} ${spot.category}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const miles = milesBetween(input.origin.lat, input.origin.lng, spot.lat, spot.lng);
    const sky = skyFit(spot, input.weather, clock);
    const row: RankedPlace = { spot, miles, fit: sky.fit, line: sky.line, score: sky.score };
    if (miles <= input.radiusMi) nearby.push(row);
    else if (input.includeFar !== false) farther.push(row);
  }

  const rank = (a: RankedPlace, b: RankedPlace) => {
    if (input.sort === 'nearest') return a.miles - b.miles;
    if (input.sort === 'open') {
      const byFit = FIT_ORDER[a.fit] - FIT_ORDER[b.fit];
      return byFit !== 0 ? byFit : a.miles - b.miles;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.miles - b.miles;
  };
  nearby.sort(rank);
  farther.sort(rank);
  return { nearby, farther: farther.slice(0, 8), clock };
}

/** Suitability changes order and copy, never geographic/rating eligibility. */
export function skyList(rows: RankedPlace[], _sort: PlaceSort): RankedPlace[] {
  return rows;
}
