const venues = require('../../../data/venues.json');
const { venueKey } = require('../calendar-record');
const { validateRegistries } = require('../registry-validation');

const keys = new Set(venues.flatMap((v) => [v.name, ...v.aliases].map(venueKey)));

it('keeps the production venue registry valid after the campus promotion', () => {
  expect(validateRegistries([], venues)).toEqual([]);
});

it.each([
  'Marriott Library - J. Willard (M LIB)',
  'Eccles Business Building - Spencer Fox (SFEBB)',
  'Pioneer Memorial Theatre - Simmons (PMT)',
  'Warnock Engineering Building - John and Marva (WEB)',
  'Red Butte Garden & Arboretum (CVC)',
  'Red Butte Garden Amphitheatre (RBGAMP)',
  'Skaggs Biology Building - Aline Wilmot (ASB)',
  'Union - A. Ray Olpin (UNION)',
  'Bennion Center (UNION)',
  'Kingsbury Hall - Joseph T. (KH)',
  'Tanner Irish Humanities Building - Carolyn (CTIHB)',
  'Lassonde Studios (LSND)',
  'Utah Museum of Fine Arts (UMFA)',
  'Natural History Museum of Utah (NHMU)',
  'Center For Arts & Media , The Edna Runswick Taylor Foyer / East Entrance',
  'Jordan Campus , JHS Lobby',
  'Wheeler Farm',
  'Midvale Senior Center 7550 S Main , Midvale , Utah 84047',
  'Gallivan Hall, 50 E 200 S, Salt Lake City, 84111, United States',
  'Murray Museum - 4872 S Poplar Street Murray UT 84107',
])('maps live LOCATION %s', (location) => {
  expect(keys.has(venueKey(location))).toBe(true);
});

it.each([
  'Zoom',
  'Microsoft Teams',
  'Virtual',
  'N/A',
  'Meldrum Theatre (FLD H)',
  'GARFF 3422',
])('still skips %s', (location) => {
  expect(keys.has(venueKey(location))).toBe(false);
});
