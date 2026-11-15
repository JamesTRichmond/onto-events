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
];
