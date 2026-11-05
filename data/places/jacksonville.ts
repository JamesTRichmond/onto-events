import type { EvergreenSpot } from '@/data/spots';

const cityParks = 'https://www.jacksonville.gov/departments/parks-and-recreation/jaxparks/specialty-parks';
const shared: Pick<EvergreenSpot, 'serviceRegion' | 'basin' | 'rating' | 'checkedOn' | 'approximate' | 'goodSky' | 'badSky' | 'dayparts'> = {
  serviceRegion: 'jacksonville', basin: 'jacksonville', rating: 'family',
  checkedOn: '2026-10-15', approximate: true,
  goodSky: ['clear', 'cloud', 'overcast'], badSky: ['thunder', 'rain'],
  dayparts: ['morning', 'midday', 'afterSchool', 'afterWork'],
};

/** Real, independently visitable public destinations; public map points are approximate. */
export const JACKSONVILLE_SPOTS: EvergreenSpot[] = [
  {
    ...shared, id: 'spot-jax-main-library', title: 'Jacksonville Main Library',
    placeKind: 'indoor', category: 'learning', venue: 'Jacksonville Public Library Main Library',
    area: 'Downtown Jacksonville', address: '303 N Laura Street, Jacksonville, FL 32202',
    lat: 30.3298, lng: -81.6589, setting: 'indoor', indoorBoost: true,
    short: 'Books and a quiet indoor stop in the downtown library.',
    description: 'Visit the Main Library for reading and public library services. Scheduled programs have their own times and registration details.',
    stewardship: 'Keep shared reading areas quiet and follow library policies.',
    hours: 'Check the library website for current hours and holiday closures.',
    sourceName: 'Jacksonville Public Library', sourceUrl: 'https://jaxpubliclibrary.org/locations/main-library',
    goodSky: ['clear', 'cloud', 'overcast', 'rain', 'drizzle', 'thunder'], badSky: [],
    dayparts: ['anytime'],
  },
  {
    ...shared, id: 'spot-jax-friendship-fountain', title: 'Friendship Fountain',
    placeKind: 'water', category: 'outdoors', venue: 'Friendship Fountain', area: 'Southbank',
    address: '1015 Museum Circle, Jacksonville, FL 32207', lat: 30.3199, lng: -81.6598,
    setting: 'outdoor', short: 'A riverfront pause beside the fountain and downtown skyline.',
    description: 'St. Johns River Park has seating, open space and Friendship Fountain. Check the city for fountain schedules and current access notices.',
    stewardship: 'Enjoy the fountain from public paths; stay out of the fountain basin.',
    hours: 'Check posted park hours and the city’s fountain schedule.',
    sourceName: 'City of Jacksonville', sourceUrl: cityParks,
    dayparts: ['morning', 'afterWork', 'golden', 'sunset', 'evening'],
  },
  {
    ...shared, id: 'spot-jax-hanna-park', title: 'Kathryn Abbey Hanna Park',
    placeKind: 'trail', category: 'outdoors', venue: 'Kathryn Abbey Hanna Park', area: 'East Jacksonville',
    address: '500 Wonderwood Drive, Jacksonville, FL 32233', lat: 30.3699, lng: -81.4056,
    setting: 'outdoor', short: 'Wooded trails and oceanfront park space for a longer outing.',
    description: 'Choose a walking route in Hanna Park and check the city’s trail guidance, access conditions and admission before setting out.',
    stewardship: 'Use designated trails, respect wildlife and obey posted water and weather closures.',
    hours: 'Check current park hours, entry fees and trail notices.',
    sourceName: 'City of Jacksonville', sourceUrl: 'https://www.jacksonville.gov/departments/parks-and-recreation/jaxparks/oceanfront-parks/kathryn-abbey-hanna-park',
    effort: 'easy',
  },
  {
    ...shared, id: 'spot-jax-cummer', title: 'Cummer Museum of Art & Gardens',
    placeKind: 'indoor', category: 'arts', venue: 'Cummer Museum of Art & Gardens', area: 'Riverside',
    address: '829 Riverside Avenue, Jacksonville, FL 32204', lat: 30.3145, lng: -81.6779,
    setting: 'mixed', indoorBoost: true, short: 'Art galleries and riverside gardens in one visit.',
    description: 'Explore the museum’s art and gardens. Check admission and current visiting hours; individual programs may need separate registration.',
    stewardship: 'Follow gallery and garden guidance and leave plants and artworks untouched.',
    hours: 'Check the museum website for current hours, admission and garden access.',
    sourceName: 'Cummer Museum', sourceUrl: 'https://www.cummermuseum.org/visit/',
    goodSky: ['clear', 'cloud', 'overcast', 'rain', 'drizzle'], badSky: [],
  },
  {
    ...shared, id: 'spot-jax-treaty-oak', title: 'Treaty Oak at Jesse Ball duPont Park',
    placeKind: 'hang', category: 'outdoors', venue: 'Jesse Ball duPont Park', area: 'Southbank',
    address: '1123 Prudential Drive, Jacksonville, FL 32207', lat: 30.3181, lng: -81.6566,
    setting: 'outdoor', short: 'A small city-park stop beneath the landmark oak.',
    description: 'Visit the city’s Treaty Oak park for a short outdoor pause near downtown. Follow current park notices and keep to public paths.',
    stewardship: 'Protect the oak: keep off its branches and respect barriers around the tree.',
    hours: 'Follow posted park hours and current city access notices.',
    sourceName: 'City of Jacksonville', sourceUrl: cityParks,
  },
];
