/**
 * onto (onto.events) demo seed data — Salt Lake City.
 *
 * Venues and recurring public happenings are real SLC places (Pioneer Park's
 * Downtown Farmers Market runs Saturdays 8am–2pm, Jun 6–Oct 24 2026; Liberty
 * Park, Ensign Peak, The Front Climbing Club, The King's English, Gallivan
 * Center, etc.). Times, headcounts, and user-posted items are demo values —
 * the live-data pipeline replaces this file in a later milestone.
 *
 * The genuinely weekly series carry a `recurrence` rule, so they read true on
 * whatever day the app is opened instead of repeating the day they were
 * authored on. Member-posted items are one-off posts and keep their relative
 * demo times.
 */

import { type Recurrence } from '@/lib/recurrence';
import type { EventFacts } from '@/lib/event-facts';

export type ActivityCategory =
  | 'outdoors'
  | 'fitness'
  | 'food'
  | 'hiking'
  | 'arts'
  | 'learning'
  | 'other'
  | 'sports'
  | 'games'
  | 'sales'
  | 'music'
  | 'community'
  | 'nightlife'
  | 'roadtrip';

export type ActivityRating = 'family' | 'general' | 'mature';

export const ALL_CATEGORIES: ActivityCategory[] = [
  'outdoors',
  'fitness',
  'food',
  'hiking',
  'arts',
  'learning',
  'other',
  'sports',
  'games',
  'sales',
  'music',
  'community',
  'nightlife',
  'roadtrip',
];

export type Activity = {
  hosted?: { meetingInstructions: string; newcomersWelcome: boolean };
  id: string;
  title: string;
  category: ActivityCategory;
  venue: string;
  area: string;
  lat: number;
  lng: number;
  /** Human-readable time, e.g. "Happening now" or "Sat 8:00 AM – 2:00 PM" */
  whenLabel: string;
  /** Minutes from now until it starts; 0 = happening now. Drives "Soonest" sort. */
  startsInMinutes: number;
  description: string;
  attendees: number;
  /** Only set 'free' when the publisher explicitly confirms free admission. */
  admission?: 'free' | 'paid';
  /** Public publisher evidence; food category/venue never establish inclusion. */
  eventFacts?: EventFacts;
  openSlots?: number;
  /** ISO start time for live events; when present the app computes freshness at runtime. */
  startsAtIso?: string;
  /** ISO end time for multi-day/timed events; keeps them in the feed until they truly end. */
  endsAtIso?: string;
  /** Content tier: family = all-ages, general = default, mature = 21+ gated. */
  rating: ActivityRating;
  /** 'user' = posted by a member; 'seed' = demo venue/event; 'live' = real feed data. */
  source: 'seed' | 'user' | 'live';
  /** Where a live item came from; shown as a quiet per-card credit ("via NHMU"). */
  sourceName?: string;
  /** Public listing URL at the source (https only) — the tap that leads somewhere. */
  sourceUrl?: string;
  /**
   * Real recurring schedule. When present it OVERRIDES whenLabel and
   * startsInMinutes at render time, so a weekly series tells the truth on
   * whatever day it is read (see lib/recurrence.ts). The frozen fields stay
   * as the static-render fallback.
   */
  recurrence?: Recurrence;
  // Optional fields emitted by the live-events pipeline (Ticketmaster etc.).
  // Kept optional so seed/user activities stay lean; present on source:'live'.
  /** Upstream provider event id (without the tm- prefix). */
  sourceEventId?: string;
  locality?: string;
  region?: string;
  countryCode?: string;
  timezone?: string;
  imageUrl?: string;
  isCancelled?: boolean;
};

/** Downtown Salt Lake City anchor (demo stand-in for device GPS). */
export const SLC_ANCHOR = { lat: 40.7608, lng: -111.891 };

const EARTH_RADIUS_MI = 3958.8;

export function milesBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

export type Travel = { mode: 'walk' | 'drive'; minutes: number };

/** Rough travel estimate: walk under ~1.2 mi, otherwise drive (incl. parking). */
export function travelFor(miles: number): Travel {
  if (miles <= 1.2) {
    return { mode: 'walk', minutes: Math.max(2, Math.round((miles / 3.1) * 60)) };
  }
  if (miles > 30) {
    // Road-trip distances: highway speeds dominate, not city driving.
    return { mode: 'drive', minutes: Math.round((miles / 65) * 60) + 8 };
  }
  return { mode: 'drive', minutes: Math.max(5, Math.round((miles / 28) * 60) + 4) };
}

export const SEED_ACTIVITIES: Activity[] = [
  {
    id: 'farmers-market',
    title: 'Downtown Farmers Market',
    category: 'community',
    venue: 'Pioneer Park',
    area: 'Downtown',
    lat: 40.7644,
    lng: -111.9035,
    whenLabel: 'Sat 8:00 AM – 2:00 PM',
    startsInMinutes: 540,
    // Saturdays 8am–2pm, Jun 6 – Oct 24 2026 (the market's published season).
    recurrence: {
      days: [6],
      startHour: 8,
      endHour: 14,
      seasonStart: '2026-06-06',
      seasonEnd: '2026-10-24',
    },
    description:
      'Produce, food stalls, and live music. Runs Saturdays through Oct 24.',
    attendees: 120,
    rating: 'family',
    source: 'seed',
  },
  {
    id: 'chess-liberty',
    title: 'Pickup chess in the park',
    category: 'games',
    venue: 'Liberty Park',
    area: 'Liberty Wells',
    lat: 40.7434,
    lng: -111.8746,
    whenLabel: 'Happening now',
    startsInMinutes: 0,
    description: 'Boards out near the north pavilion. All levels, drop in.',
    attendees: 6,
    openSlots: 2,
    rating: 'family',
    source: 'user',
  },
  {
    id: 'ensign-sunset',
    title: 'Sunset hike: Ensign Peak',
    category: 'outdoors',
    venue: 'Ensign Peak Trailhead',
    area: 'Capitol Hill',
    lat: 40.793,
    lng: -111.8878,
    whenLabel: 'Today 7:30 PM',
    startsInMinutes: 260,
    description:
      'Short, steep, and the best city view there is. Strangers welcome.',
    attendees: 3,
    openSlots: 5,
    rating: 'general',
    source: 'user',
  },
  {
    id: 'living-room',
    title: 'The Living Room hike, easy pace',
    category: 'outdoors',
    venue: 'Living Room Trailhead',
    area: 'Foothills',
    lat: 40.7659,
    lng: -111.816,
    whenLabel: 'Tomorrow 9:00 AM',
    startsInMinutes: 900,
    description: 'The one with the rock couches. Coffee after, optional.',
    attendees: 4,
    openSlots: 4,
    rating: 'general',
    source: 'user',
  },
  {
    id: 'spotter-front',
    title: 'Need a spotter, here till noon',
    category: 'fitness',
    venue: 'The Front Climbing Club',
    area: 'Granary District',
    lat: 40.737,
    lng: -111.8977,
    whenLabel: 'Happening now',
    startsInMinutes: 0,
    description: 'Bouldering, working V4s. Trade spots and beta.',
    attendees: 1,
    openSlots: 1,
    rating: 'general',
    source: 'user',
  },
  {
    id: 'yoga-liberty',
    title: 'Yoga in the park (free)',
    category: 'fitness',
    venue: 'Liberty Park',
    area: 'Liberty Wells',
    lat: 40.744,
    lng: -111.8752,
    whenLabel: 'Sat 9:00 AM',
    startsInMinutes: 600,
    // Saturday mornings, city free summer series. The published final date
    // is unconfirmed, so the season is bounded at end of summer rather than
    // left open: hiding a real session is a smaller failure than sending
    // someone to an empty park. Verify before the demo (BACKLOG §2).
    recurrence: { days: [6], startHour: 9, endHour: 10, seasonEnd: '2026-09-30' },
    description: "Part of the city's free summer series. Bring a mat.",
    admission: 'free',
    attendees: 22,
    rating: 'family',
    source: 'seed',
  },
  {
    id: 'jefferson-jams',
    title: 'Jefferson Jams: live music',
    category: 'music',
    venue: 'Jefferson Park',
    area: 'Ballpark',
    lat: 40.7375,
    lng: -111.893,
    whenLabel: 'Fri 6:00 PM',
    startsInMinutes: 1320,
    // Friday evenings, SLC Public Lands' neighborhood concert series. Season
    // end unconfirmed — bounded like the yoga series, same reasoning.
    recurrence: { days: [5], startHour: 18, endHour: 20, seasonEnd: '2026-09-30' },
    description: 'Free neighborhood concert series from SLC Public Lands.',
    admission: 'free',
    attendees: 45,
    rating: 'general',
    source: 'seed',
  },
  {
    id: 'yard-sale-sugarhouse',
    title: 'Multi-family yard sale',
    category: 'sales',
    venue: 'Posted address after you join',
    area: 'Sugar House',
    lat: 40.725,
    lng: -111.86,
    whenLabel: 'Sat 7:00 AM – 1:00 PM',
    startsInMinutes: 480,
    description: 'Tools, records, camping gear, kid stuff. Cash and Venmo.',
    attendees: 9,
    rating: 'family',
    source: 'user',
  },
  {
    id: 'estate-sale-avenues',
    title: 'Estate sale, everything goes',
    category: 'sales',
    venue: 'Posted address after you join',
    area: 'The Avenues',
    lat: 40.777,
    lng: -111.876,
    whenLabel: 'Sat 9:00 AM',
    startsInMinutes: 600,
    description: 'Mid-century furniture, books, shop tools. Early birds welcome.',
    attendees: 14,
    rating: 'family',
    source: 'user',
  },
  {
    id: 'hoops-sugarhouse',
    title: 'Pickup basketball run',
    category: 'fitness',
    venue: 'Sugar House Park courts',
    area: 'Sugar House',
    lat: 40.722,
    lng: -111.848,
    whenLabel: 'Today 6:00 PM',
    startsInMinutes: 170,
    description: 'Full court 5s if we get ten. Decent runs, no egos.',
    attendees: 7,
    openSlots: 3,
    rating: 'general',
    source: 'user',
  },
  {
    id: 'book-club-kings-english',
    title: 'Book club, new members night',
    category: 'community',
    venue: "The King's English Bookshop",
    area: '15th & 15th',
    lat: 40.7365,
    lng: -111.839,
    whenLabel: 'Thu 7:00 PM',
    startsInMinutes: 2900,
    description: 'This month: a short one, so joining late is fine.',
    attendees: 11,
    openSlots: 6,
    rating: 'family',
    source: 'seed',
  },
  {
    id: 'mahjong-library',
    title: 'Mahjong night',
    category: 'games',
    venue: 'Salt Lake City Public Library',
    area: 'Downtown',
    lat: 40.7622,
    lng: -111.883,
    whenLabel: 'Today 5:30 PM',
    startsInMinutes: 140,
    description: 'Casual tables, teachers on hand for first-timers.',
    attendees: 12,
    openSlots: 4,
    rating: 'family',
    source: 'user',
  },
  {
    id: 'city-creek-walk',
    title: 'City Creek Canyon walk-and-talk',
    category: 'outdoors',
    venue: 'City Creek Canyon Road',
    area: 'Capitol Hill',
    lat: 40.781,
    lng: -111.879,
    whenLabel: 'Today 5:00 PM',
    startsInMinutes: 110,
    description: 'Shaded paved road, easy pace, good conversation.',
    attendees: 5,
    openSlots: 5,
    rating: 'general',
    source: 'user',
  },
  {
    id: 'gallivan-concert',
    title: 'Concert on the plaza',
    category: 'music',
    venue: 'Gallivan Center',
    area: 'Downtown',
    lat: 40.7643,
    lng: -111.8874,
    whenLabel: 'Fri 7:00 PM',
    startsInMinutes: 1380,
    description: 'Outdoor stage downtown. Lawn chairs and food trucks.',
    attendees: 210,
    rating: 'general',
    source: 'seed',
  },
  {
    id: 'happy-hour-beerbar',
    title: 'Happy hour meetup',
    category: 'nightlife',
    venue: 'Beer Bar',
    area: 'Downtown',
    lat: 40.7658,
    lng: -111.8867,
    whenLabel: 'Today 5:00 PM',
    startsInMinutes: 110,
    description: 'Long tables, easy to join. First-round introductions.',
    attendees: 8,
    openSlots: 8,
    rating: 'mature',
    source: 'user',
  },
  {
    id: 'poker-barx',
    title: 'Casual poker night',
    category: 'nightlife',
    venue: 'Bar-X',
    area: 'Downtown',
    lat: 40.7658,
    lng: -111.8869,
    whenLabel: 'Today 8:00 PM',
    startsInMinutes: 290,
    description: 'Low stakes, high trash talk. Seats capped at eight.',
    attendees: 5,
    openSlots: 3,
    rating: 'mature',
    source: 'user',
  },
  // Road Trip category (decided spec Q8): "legal elsewhere" and
  // worth-the-drive destinations get their own flavor. These bypass the
  // radius filter — the honest drive time carries the distance story.
  {
    id: 'roadtrip-bonneville',
    title: 'Sunset drive: Bonneville Salt Flats',
    category: 'roadtrip',
    venue: 'Bonneville Salt Flats',
    area: 'Wendover, UT',
    lat: 40.7666,
    lng: -113.8966,
    whenLabel: 'Golden hour, any clear day',
    startsInMinutes: 600,
    description:
      'Miles of white salt and a horizon that bends. Park off I-80 exit 4; check flooding before you go.',
    attendees: 23,
    rating: 'general',
    source: 'seed',
  },
  {
    id: 'roadtrip-peppermill',
    title: 'Casino showroom night',
    category: 'roadtrip',
    venue: 'Peppermill Concert Hall',
    area: 'West Wendover, NV',
    lat: 40.7391,
    lng: -114.0733,
    whenLabel: 'Shows most weekends',
    startsInMinutes: 720,
    description:
      'Utah has zero legal gambling — Wendover is where SLC goes for it. Concert hall and casino floors, 21+.',
    attendees: 87,
    rating: 'mature',
    source: 'seed',
  },
  {
    id: 'roadtrip-forthall',
    title: 'Shoshone-Bannock Casino weekend',
    category: 'roadtrip',
    venue: 'Shoshone-Bannock Casino Hotel',
    area: 'Fort Hall, ID',
    lat: 43.033,
    lng: -112.438,
    whenLabel: 'Open around the clock',
    startsInMinutes: 900,
    description:
      'The nearest tribal gaming to SLC — about 2.5 hours north. Event calendar runs concerts and tournaments.',
    attendees: 41,
    rating: 'mature',
    source: 'seed',
  },
];
