/**
 * CURATED FILE — real "Road Trip" listings, sourced Aug 29 2026 by the CIM
 * sourcing pass. Utah has zero legal gambling, so these live 2+ hours out:
 * West Wendover NV (Peppermill, via WendoverFun.com — ticketing runs on AXS,
 * venue 130306) and the Shoshone-Bannock Casino Hotel at Fort Hall ID
 * (in-house Yapsody; scrape shobangaming.com/events/month/YYYY-MM/).
 * All items are 21+ casino venues: rating 'mature', category 'roadtrip'
 * (which bypasses the radius filter by design).
 * TZ note (QA finding): West Wendover NV officially observes MOUNTAIN time —
 * the only Nevada town that does — so offsets here are -06:00 in summer.
 */
import { Activity } from './activities';

export const ROADTRIP_ACTIVITIES: Activity[] = [
  {
    id: 'rt-wendover-beerfest',
    title: 'Peppermill Wendover Beer Fest & BBQ',
    category: 'roadtrip',
    venue: 'Peppermill Concert Hall',
    area: 'West Wendover, NV',
    lat: 40.7391,
    lng: -114.0733,
    whenLabel: 'Sat, Aug 29, 12:00 PM – 5:00 PM',
    startsInMinutes: 0,
    startsAtIso: '2026-08-29T12:00:00-06:00',
    endsAtIso: '2026-08-29T17:00:00-06:00',
    description:
      '10th annual craft beer fest with 40+ breweries, BBQ, and live DJ in the Peppermill lot. Free entry; beer area is 21+.',
    attendees: 164,
    rating: 'mature',
    source: 'live',
    sourceName: 'Peppermill Resort (WendoverFun.com)',
    sourceUrl: 'https://wendoverfun.com/resort/casino-events/beerfest-bbq/',
  },
  {
    id: 'rt-gerardo-ortiz',
    title: 'Gerardo Ortiz',
    category: 'roadtrip',
    venue: 'Peppermill Concert Hall',
    area: 'West Wendover, NV',
    lat: 40.7391,
    lng: -114.0733,
    whenLabel: 'Fri, Sep 4, 9:00 PM',
    startsInMinutes: 0,
    startsAtIso: '2026-09-04T21:00:00-06:00',
    description:
      'Regional Mexican/corrido star live at the intimate Peppermill Concert Hall. Doors 8pm. 21+ casino venue.',
    attendees: 178,
    rating: 'mature',
    source: 'live',
    sourceName: 'Peppermill Concert Hall (WendoverFun.com)',
    sourceUrl: 'https://wendoverfun.com/shows/gerardo%20ortiz/',
  },
  {
    id: 'rt-brett-young',
    title: 'Brett Young',
    category: 'roadtrip',
    venue: 'Peppermill Concert Hall',
    area: 'West Wendover, NV',
    lat: 40.7391,
    lng: -114.0733,
    whenLabel: 'Fri, Sep 25, 9:00 PM',
    startsInMinutes: 0,
    startsAtIso: '2026-09-25T21:00:00-06:00',
    description:
      "Country hitmaker Brett Young ('In Case You Didn't Know,' 'Mercy') live. Doors 8pm. 21+ casino venue.",
    attendees: 171,
    rating: 'mature',
    source: 'live',
    sourceName: 'Peppermill Concert Hall (WendoverFun.com)',
    sourceUrl: 'https://wendoverfun.com/shows/brett%20young/',
  },
  {
    id: 'rt-gene-simmons',
    title: 'Gene Simmons Band',
    category: 'roadtrip',
    venue: 'Peppermill Concert Hall',
    area: 'West Wendover, NV',
    lat: 40.7391,
    lng: -114.0733,
    whenLabel: 'Fri, Oct 9, 9:00 PM',
    startsInMinutes: 0,
    startsAtIso: '2026-10-09T21:00:00-06:00',
    description:
      'KISS co-founder Gene Simmons brings his solo band to the Concert Hall. Doors 8pm. 21+ casino venue.',
    attendees: 180,
    rating: 'mature',
    source: 'live',
    sourceName: 'Peppermill Concert Hall (WendoverFun.com)',
    sourceUrl: 'https://wendoverfun.com/shows/gene%20simmons%20band/',
  },
  {
    id: 'rt-forthall-hotseat',
    title: '$25,000 Ultimate Buddy Scooter Hot Seat Giveaway',
    category: 'roadtrip',
    venue: 'Shoshone-Bannock Casino Hotel',
    area: 'Fort Hall, ID',
    lat: 43.0331,
    lng: -112.4344,
    whenLabel: 'Sun, Aug 30, 5:00 PM – 8:00 PM',
    startsInMinutes: 0,
    startsAtIso: '2026-08-30T17:00:00-06:00',
    endsAtIso: '2026-08-30T20:00:00-06:00',
    description:
      'Casino hot-seat drawing for a $25,000 cash & prize pool on the gaming floor. Free to join; 21+ gaming areas.',
    attendees: 92,
    rating: 'mature',
    source: 'live',
    sourceName: 'Shoshone-Bannock Casino Hotel',
    sourceUrl: 'https://www.shobangaming.com/events/month/2026-08/',
  },
];
