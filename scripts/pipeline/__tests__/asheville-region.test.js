const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { calendarRecord } = require('../calendar-record');
const { parseCalendar } = require('../adapters/ics');
const { SERVICE_REGIONS, LEGACY_REGION_ID, coverageGroupForLocation, serviceRegionForLocation } = require('../service-regions');

// Synthetic contract examples, never added to the live supply registries.
// Coordinates are test inputs near each named place, not venue evidence.
const record = {
  id: 'contract-avl', title: 'Public concert', category: 'music', rating: 'general',
  source: 'live', sourceName: 'Asheville contract calendar', sourceKind: 'community',
  venue: 'Asheville Contract Hall', area: 'Public venue', lat: 35.5951, lng: -82.5515,
  locality: 'Asheville', region: 'NC', countryCode: 'US', timezone: 'America/New_York',
  whenLabel: 'Thu evening', description: 'Synthetic test only', startsInMinutes: 0,
  startsAtIso: '2026-10-15T23:00:00Z', attendees: 0,
};
const venue = {
  name: 'Asheville Contract Hall', aliases: [], address: 'Public venue', locality: 'Asheville',
  region: 'NC', lat: 35.5951, lng: -82.5515, kind: 'hall', allAges: 'unknown',
  sourceUrl: 'https://fixture.example/venue', verifiedOn: '2026-10-08',
};
const feed = {
  id: 'avl-contract', name: 'Asheville contract calendar', kind: 'ics', sourceKind: 'community',
  serviceRegion: 'asheville', timezone: 'America/New_York',
  url: 'https://fixture.example/asheville.ics', defaultCategory: 'music', defaultRating: 'general',
  venueHint: 'Asheville Contract Hall', termsUrl: 'https://fixture.example/terms', termsCheckedOn: '2026-10-08',
  notes: 'Synthetic test only', fixturePath: 'scripts/pipeline/fixtures/ics/contract.ics',
};
const vermontVenue = {
  ...venue, name: 'Vermont Contract Hall', locality: 'Burlington', region: 'VT', lat: 44.4759, lng: -73.2121,
};
const utahVenue = {
  ...venue, name: 'Utah Contract Hall', locality: 'Salt Lake City', region: 'UT', lat: 40.7608, lng: -111.891,
};
const event = { uid: 'public-concert', title: 'Public concert', location: 'Asheville Contract Hall', start: '2026-10-15T23:00:00Z' };

it('registers Asheville as a third state-scoped region beside Utah and Vermont', () => {
  expect(SERVICE_REGIONS.map((region) => region.id)).toEqual([
    'utah',
    'vermont-corridor',
    'asheville',
    'tallahassee',
    'jacksonville',
    'hoboken',
    'nyc',
    'miami',
    'tampa-bay',
    'orlando',
    'key-west',
    'gainesville',
    'pensacola',
    'flagstaff',
    'austin',
    'chicago',
    'westchester',
    'montreal',
    'los-angeles',
    'tucson',
    'philadelphia',
    'san-francisco',
    'park-city',
    'saratoga-springs',
    'boston',
    'tokyo',
    'atlanta',
  ]);
  expect(LEGACY_REGION_ID).toBe('utah');
  const asheville = SERVICE_REGIONS.find((region) => region.id === 'asheville');
  expect(asheville).toMatchObject({ region: 'NC', countryCode: 'US', timezone: 'America/New_York' });
  expect(asheville.anchor).toMatchObject({ sourceUrl: expect.stringMatching(/^https:/), checkedOn: '2026-10-08' });
  expect(asheville.hubs.map((hub) => hub.municipality)).toEqual(['Asheville', 'Black Mountain', 'Weaverville']);
});

it.each([
  ['Asheville', 35.5951, -82.5515], ['Biltmore Forest', 35.5334, -82.5287],
  ['Black Mountain', 35.6179, -82.3212], ['Montreat', 35.644, -82.3015],
  ['Weaverville', 35.697, -82.5607], ['Woodfin', 35.6334, -82.5821],
])('accepts a located record from the municipality of %s', (locality, lat, lng) => {
  expect(validateRecord({ ...record, locality, lat, lng }).ok).toBe(true);
  expect(coverageGroupForLocation({ ...record, locality, lat, lng })).toBe('buncombe-municipalities');
});

it.each([
  ['Swannanoa', 35.5979, -82.3998], ['Fairview', 35.5446, -82.3957], ['Barnardsville', 35.7776, -82.4593],
  ['Bent Creek', 35.5079, -82.6129], ['Avery Creek', 35.4685, -82.5779], ['Royal Pines', 35.4762, -82.5129],
  ['Emma', 35.6151, -82.622],
])('accepts the evidence-listed unincorporated place %s', (locality, lat, lng) => {
  expect(validateRecord({ ...record, locality, lat, lng }).ok).toBe(true);
  expect(coverageGroupForLocation({ ...record, locality, lat, lng })).toBe('buncombe-unincorporated');
});

// Venue registration, 2026-10-08: single-county postal communities, each
// with Buncombe County civic points for the venues registered there.
it.each([['Candler', 35.539, -82.6926], ['Leicester', 35.6526, -82.6996]])(
  'accepts the unincorporated Buncombe community %s', (locality, lat, lng) => {
    expect(validateRecord({ ...record, locality, lat, lng }).ok).toBe(true);
    expect(coverageGroupForLocation({ ...record, locality, lat, lng })).toBe('buncombe-communities');
  },
);

it('accepts official municipal names and case or spacing differences, without fuzzy matching', () => {
  for (const locality of ['City of Asheville', '  BLACK   MOUNTAIN  ', 'town of woodfin', 'Town of Montreat']) {
    expect(validateRecord({ ...record, locality }).ok).toBe(true);
  }
  expect(validateRecord({ ...record, locality: 'Ashville' }).ok).toBe(false);
  expect(validateRecord({ ...record, locality: 'Black Mtn' }).ok).toBe(false);
});

it.each([
  ['Tennessee label inside the envelope', { region: 'TN' }],
  ['Tennessee town', { region: 'TN', locality: 'Newport', lat: 35.967, lng: -83.1877 }],
  ['South Carolina label inside the envelope', { region: 'SC' }],
  ['South Carolina town', { region: 'SC', locality: 'Greenville', lat: 34.8526, lng: -82.394 }],
  ['Henderson County: Hendersonville', { locality: 'Hendersonville', lat: 35.3187, lng: -82.461 }],
  ['Henderson County: Fletcher inside the envelope', { locality: 'Fletcher', lat: 35.4307, lng: -82.5012 }],
  ['Haywood County: Canton inside the envelope', { locality: 'Canton', lat: 35.5329, lng: -82.8374 }],
  ['Madison County: Marshall inside the envelope', { locality: 'Marshall', lat: 35.7973, lng: -82.6843 }],
  ['McDowell County: Old Fort inside the envelope', { locality: 'Old Fort', lat: 35.6287, lng: -82.1787 }],
  ['postal-only Arden, which spans two counties', { locality: 'Arden', lat: 35.4668, lng: -82.5165 }],
  ['same-name Fairview in Union County', { locality: 'Fairview', lat: 34.9946, lng: -80.5398 }],
  ['missing state', { region: undefined }],
  ['missing locality', { locality: undefined }],
  ['missing country', { countryCode: undefined }],
])('rejects %s', (_label, change) => {
  expect(validateRecord({ ...record, ...change }).ok).toBe(false);
});

it('keeps Utah and Vermont acceptance unchanged and keeps the regions apart', () => {
  expect(serviceRegionForLocation({ ...record, lat: 40.7608, lng: -111.891, region: 'UT', locality: 'Salt Lake City' })?.id).toBe('utah');
  expect(serviceRegionForLocation({ ...record, lat: 40.7372, lng: -114.0375, region: 'NV', locality: 'West Wendover' })?.id).toBe('utah');
  expect(serviceRegionForLocation({ ...record, lat: 44.4759, lng: -73.2121, region: 'VT', locality: 'Burlington' })?.id).toBe('vermont-corridor');
  expect(serviceRegionForLocation(record)?.id).toBe('asheville');
  // The legacy Utah box never claims a location labeled with a state-scoped region.
  expect(serviceRegionForLocation({ ...record, lat: 40.7608, lng: -111.891, region: 'NC', locality: 'Asheville' })).toBeNull();
  expect(serviceRegionForLocation({ ...record, lat: 40.7608, lng: -111.891, region: 'VT', locality: 'Burlington' })).toBeNull();
});

it('validates Asheville feeds, timezones and venue hints through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  expect(validateRegistries([feed], [{ ...venue, region: undefined }])).not.toEqual([]);
  expect(validateRegistries([feed], [{ ...venue, locality: 'Fletcher' }])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, timezone: 'America/Chicago' }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, serviceRegion: undefined }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, venueHint: 'Vermont Contract Hall' }], [venue, vermontVenue])).not.toEqual([]);
});

it('normalizes an Asheville calendar event with its locality, timezone and source identity', () => {
  const normalized = calendarRecord(event, { feed, venues: [venue] });
  expect(validateRecord(normalized).ok).toBe(true);
  expect(normalized).toMatchObject({ region: 'NC', locality: 'Asheville', timezone: 'America/New_York',
    sourceName: 'Asheville contract calendar', sourceEventId: '["single","public-concert"]' });
});

it('skips calendar events whose venue sits in another region than the feed declares', () => {
  const skipped = [];
  const skip = (reason) => skipped.push(reason);
  expect(calendarRecord({ ...event, location: 'Vermont Contract Hall' }, { feed, venues: [vermontVenue], skip })).toBeNull();
  expect(calendarRecord({ ...event, location: 'Utah Contract Hall' }, { feed, venues: [utahVenue], skip })).toBeNull();
  const vermontFeed = { ...feed, serviceRegion: 'vermont-corridor', venueHint: null };
  expect(calendarRecord(event, { feed: vermontFeed, venues: [venue], skip })).toBeNull();
  expect(skipped).toEqual(['outside feed service region', 'outside feed service region', 'outside feed service region']);
});

it('lets a feed without a declared region touch only the legacy Utah region', () => {
  const skipped = [];
  const skip = (reason) => skipped.push(reason);
  const legacyFeed = { ...feed, serviceRegion: undefined, timezone: 'America/Denver', venueHint: null };
  expect(calendarRecord(event, { feed: legacyFeed, venues: [venue], skip })).toBeNull();
  expect(calendarRecord({ ...event, location: 'Vermont Contract Hall' }, { feed: legacyFeed, venues: [vermontVenue], skip })).toBeNull();
  expect(skipped).toEqual(['missing feed service region', 'missing feed service region']);
  expect(calendarRecord({ ...event, location: 'Utah Contract Hall' }, { feed: legacyFeed, venues: [utahVenue] })).toMatchObject({ region: 'UT' });
});

describe('Asheville local times across daylight saving', () => {
  const calendar = (dtstart) => `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:avl-dst\nSUMMARY:Public concert\nLOCATION:Asheville Contract Hall\nDTSTART;TZID=America/New_York:${dtstart}\nEND:VEVENT\nEND:VCALENDAR`;
  const startOf = (dtstart, now) =>
    parseCalendar(calendar(dtstart), { now: Date.parse(now), timezone: 'America/New_York' }).items.map((item) => item.start);

  it('moves from standard to daylight time across the March 14, 2027 spring transition', () => {
    expect(startOf('20270313T190000', '2027-03-01T00:00:00Z')).toEqual(['2027-03-14T00:00:00.000Z']);
    expect(startOf('20270314T190000', '2027-03-01T00:00:00Z')).toEqual(['2027-03-14T23:00:00.000Z']);
    // 02:30 does not exist that night; it resolves with the pre-gap offset
    // (RFC 5545 section 3.3.5) to an explicit UTC instant.
    expect(startOf('20270314T023000', '2027-03-01T00:00:00Z')).toEqual(['2027-03-14T07:30:00.000Z']);
  });

  it('moves from daylight to standard time across the November 1, 2026 fall fold', () => {
    expect(startOf('20261031T190000', '2026-10-20T00:00:00Z')).toEqual(['2026-10-31T23:00:00.000Z']);
    expect(startOf('20261101T190000', '2026-10-20T00:00:00Z')).toEqual(['2026-11-02T00:00:00.000Z']);
    // 01:30 happens twice that night. The contract is one explicit UTC
    // occurrence that is one of the two real instants, never a guess between.
    const [folded] = startOf('20261101T013000', '2026-10-20T00:00:00Z');
    expect(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']).toContain(folded);
  });
});
