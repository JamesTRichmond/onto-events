import type { EvergreenSpot } from '@/data/spots';

const shared: Pick<
  EvergreenSpot,
  'serviceRegion' | 'basin' | 'checkedOn' | 'approximate' | 'goodSky' | 'badSky' | 'dayparts'
> = {
  serviceRegion: 'naples',
  basin: 'naples',
  checkedOn: '2026-11-14',
  approximate: true,
  goodSky: ['clear', 'cloud', 'overcast'],
  badSky: ['thunder', 'rain'],
  dayparts: ['morning', 'midday', 'afterSchool', 'afterWork'],
};

/** Collier County places checked against the publisher's own page on 2026-11-14.
 * The Naples Pier is left out: the city says it is closed for the rebuild.
 */
export const NAPLES_SPOTS: EvergreenSpot[] = [
  {
    ...shared,
    id: 'spot-naples-regional-library',
    title: 'Naples Regional Library',
    placeKind: 'indoor',
    category: 'learning',
    venue: 'Naples Regional Library',
    area: 'Old Naples',
    address: '650 Central Ave, Naples, FL 34102',
    lat: 26.146459,
    lng: -81.798961,
    setting: 'indoor',
    rating: 'family',
    indoorBoost: true,
    short: 'Downtown branch with study rooms and a public catalog.',
    description:
      'Collier County Public Library branch at 650 Central Avenue. The county page lists study rooms, computers, and a 24/7 book drop. The map point is the one the library publishes.',
    stewardship: 'Quiet floors stay quiet. Follow the posted library rules.',
    hours: 'Monday–Thursday 9:00 a.m.–8:00 p.m.; Friday and Saturday 9:00 a.m.–5:00 p.m.; closed Sunday.',
    sourceName: 'Collier County Public Library',
    sourceUrl: 'https://library.collier.gov/About-Us/Locations/Naples-Regional-Branch',
    price: 'Free',
    goodSky: ['clear', 'cloud', 'overcast', 'rain', 'drizzle', 'thunder'],
    badSky: [],
    dayparts: ['anytime'],
  },

  {
    ...shared,
    id: 'spot-naples-lowdermilk',
    title: 'Lowdermilk Park',
    placeKind: 'water',
    category: 'outdoors',
    venue: 'Lowdermilk Park',
    area: 'Gulf Shore Boulevard',
    address: '1301 Gulf Shore Blvd N, Naples, FL 34102',
    lat: 26.162992,
    lng: -81.810110,
    setting: 'outdoor',
    rating: 'family',
    short: 'Beachfront park with a playground, showers, and gulf access.',
    description:
      'City beach park on Gulf Shore Boulevard. The city lists parking, sand volleyball, a playground, picnic tables, restrooms, showers, and an ADA beach mat. Beach parking needs a permit or pay-by-space.',
    stewardship: 'Vehicles have to be out by 11 p.m. Pack out what you bring onto the sand.',
    hours: '5:00 a.m.–11:00 p.m.',
    sourceName: 'City of Naples',
    sourceUrl: 'https://www.naplesgov.com/parksrec/park/lowdermilk-park',
    price: 'Free to enter; beach parking is paid or by permit',
    effort: 'easy',
    dayparts: ['sunrise', 'morning', 'midday', 'afterWork', 'sunset'],
  },
];
