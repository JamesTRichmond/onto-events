const core = require('../../refresh-core');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { createIcsAdapter } = require('../adapters/ics');
const { readSourceFixture } = require('../run-source');
const {
  venueKey, meetingSpotFromDescription, resolveVenue, isPlaceholderEvent, locationCandidate,
} = require('../calendar-record');
const { validateRegistries } = require('../registry-validation');

const keys = new Set(venues.flatMap((v) => [v.name, ...v.aliases].map(venueKey)));
const saturday = feeds.find((feed) => feed.id === 'slc-track-club-saturday-runs');
const thursday = feeds.find((feed) => feed.id === 'slc-track-club-thursday-trail-runs');

it('keeps the Saturday track club feed live instead of pausing it', () => {
  expect(saturday.pausedReason).toBeUndefined();
  expect(saturday.name).toBe('Salt Lake City Track Club Saturday Runs');
  expect(validateRegistries([saturday], venues)).toEqual([]);
});

it('allows an already-empty catalog to stay empty without failing the job', () => {
  expect(core.shouldRefuseWrite(0, 0, false)).toBe(false);
  expect(core.shouldRefuseWrite(12, 0, false)).toBe(true);
});

it('extracts the meet-at phrase and maps it with an exact venueKey', () => {
  expect(meetingSpotFromDescription('Host: Jon Hansen\nMeet at the Historic Sandy TRAX station at 7:30 to carpool'))
    .toBe('the Historic Sandy TRAX station');
  expect(keys.has(venueKey('Historic Sandy TRAX station'))).toBe(true);
  const { venue } = resolveVenue({
    location: '',
    description: 'Host: Jon Hansen\nMeet at the Historic Sandy TRAX station at 7:30 to carpool',
  }, saturday, venues);
  expect(venue.name).toBe('Historic Sandy TRAX Station');
});

it('still prefers an explicit LOCATION alias such as the Hogle Zoo address', () => {
  const { venue } = resolveVenue({
    location: '2600 Sunnyside Ave S, Salt Lake City, UT 84108, USA',
    description: 'Host: Amber',
  }, saturday, venues);
  expect(venue.name).toBe("Utah's Hogle Zoo");
});

it('maps the Saturday Wasatch trailhead address from LOCATION', () => {
  const { venue } = resolveVenue({
    location: '2900 Wasatch Blvd, Salt Lake City, UT 84109, USA',
    description: 'Host: Saturday crew',
  }, saturday, venues);
  expect(venue.name).toBe('Grandeur Peak Trailhead');
});

it('does not treat placeholder host slots or map URLs as places', () => {
  expect(isPlaceholderEvent('Run Host Needed')).toBe(true);
  expect(locationCandidate('https://maps.app.goo.gl/cqnoBjbBK17NcGCh7')).toBe('');
  const { venue, candidate } = resolveVenue({
    location: '',
    description: 'Sign up to host a run in Discord; choose the route and coffee shop.',
  }, saturday, venues);
  expect(venue).toBeNull();
  expect(candidate).toBe('');
});

it('maps the in-horizon Saturday override to Historic Sandy and skips host-needed slots', () => {
  const adapter = createIcsAdapter(saturday, venues);
  const result = readSourceFixture(adapter, saturday.fixturePath, { now: Date.parse('2026-09-09T12:00:00Z') });
  expect(result.records.map((row) => [row.title, row.venue])).toEqual([
    ['Mt Nebo', 'Historic Sandy TRAX Station'],
  ]);
  expect(result.skipped['placeholder event']).toBeGreaterThan(0);
  expect(result.skipped['unmapped venue'] ?? 0).toBe(0);
});

it('still maps the Thursday City Creek address', () => {
  expect(keys.has(venueKey('670 Victory Rd, Salt Lake City, UT 84103'))).toBe(true);
  expect(keys.has(venueKey('5425 Wasatch Blvd, Holladay, UT 84124'))).toBe(true);
  const { venue } = resolveVenue({
    location: '5425 Wasatch Blvd, Holladay, UT 84124',
    description: 'Host: TBD',
  }, thursday, venues);
  expect(venue?.name).toBe('Mount Olympus Trailhead');
  expect(thursday.pausedReason).toBeUndefined();
});
