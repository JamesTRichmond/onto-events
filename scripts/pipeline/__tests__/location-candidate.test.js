const { locationCandidate } = require('../calendar-record');
const venues = require('../../../data/venues.json');

// onto never geocodes, so an unresolved location is only useful as an alias
// candidate for review. A web address is never one, and must not reach that list.
it.each([
  'wilkescenter.utah.edu…',
  'www.example.com/events',
  'example.org',
  'maps.app.goo.gl/example',
  'https://zoom.us/j/123',
  'SLCC.edu',
])('treats %s as a web address rather than a venue name', (value) => {
  expect(locationCandidate(value)).toBe('');
});

it.each([
  'J. Willard Marriott Library',
  'The Murray Theater',
  "Utah's Hogle Zoo",
  'Mt. Olympus Park',
  'SLCC South City Campus Center for Arts & Media',
  'Gallivan Hall, 50 E 200 S, Salt Lake City, 84111, United States',
])('keeps %s intact as a venue name', (value) => {
  expect(locationCandidate(value)).toBe(value);
});

// The filter feeds venue resolution as well as the report, so a curated name it
// rejects would drop events silently and never appear in the worklist either.
it('never rejects a name in the production venue registry', () => {
  const rejected = venues
    .flatMap((v) => [v.name, ...v.aliases])
    .filter((name) => locationCandidate(name) !== name);
  expect(rejected).toEqual([]);
});
