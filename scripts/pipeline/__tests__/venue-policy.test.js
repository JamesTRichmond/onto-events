const venues = require('../../../data/venues.json');
const { rateCalendarEvent } = require('../calendar-record');
const { validateRegistries } = require('../registry-validation');
const ticketmaster = require('../adapters/ticketmaster');

const feed = { defaultCategory: 'music', defaultRating: 'general' };

it('distinguishes a venue with no age exceptions from individually advertised all-ages shows', () => {
  const quarters = venues.find((v) => v.name === 'Quarters Arcade Bar Downtown');
  const commonwealth = venues.find((v) => v.name === 'The Commonwealth Room');
  const kilby = venues.find((v) => v.name === 'Kilby Court');
  const allAges = { title: 'All ages concert', description: 'Live music' };
  expect(rateCalendarEvent(allAges, quarters, feed)).toBe('mature');
  expect(rateCalendarEvent(allAges, commonwealth, feed)).toBe('general');
  expect(rateCalendarEvent({ title: 'Concert' }, commonwealth, feed)).toBe('mature');
  expect(rateCalendarEvent(allAges, kilby, feed)).toBe('general');
  expect(rateCalendarEvent({ title: 'Concert', description: '21+ only' }, kilby, feed)).toBe('mature');
});

it('validates curated venue policy and refuses contradictory or non-boolean restrictions', () => {
  expect(validateRegistries([], venues)).toEqual([]);
  const venue = venues.find((v) => v.legalAgeEnforced);
  expect(validateRegistries([], [{ ...venue, legalAgeEnforced: 'true' }])).not.toEqual([]);
  expect(validateRegistries([], [{ ...venue, allAges: true }])).not.toEqual([]);
});

it.each([
  ['Quarters Arcade Bar Downtown', 'All ages party', false, 'mature'],
  ['The Commonwealth Room', 'Concert', false, 'mature'],
  ['The Commonwealth Room', 'All ages concert', false, 'general'],
  ['Kilby Court', 'All ages concert', false, 'general'],
  ['Kilby Court', 'All ages concert', true, 'mature'],
])('applies %s venue policy to Ticketmaster %s listings', (name, title, enforced, rating) => {
  const venue = venues.find((v) => v.name === name);
  const record = ticketmaster.normalize({
    id: 'synthetic-policy-case', name: title,
    classifications: [{ segment: { name: 'Music' } }],
    ageRestrictions: { legalAgeEnforced: enforced },
    dates: { start: { dateTime: '2026-09-10T00:00:00Z' } },
    _embedded: { venues: [{ name, city: { name: venue.locality },
      location: { latitude: String(venue.lat), longitude: String(venue.lng) } }] },
  });
  expect(record).toMatchObject({ rating, venueKind: venue.kind });
});
