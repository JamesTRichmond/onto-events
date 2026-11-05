const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { calendarRecord } = require('../calendar-record');
const venues = require('../../../data/venues.json');

// Synthetic contract examples, never added to the live supply registries.
const record = {
  id: 'contract-vt', title: 'Public concert', category: 'music', rating: 'general',
  source: 'live', sourceName: 'Contract calendar', sourceKind: 'community',
  venue: 'Contract Hall', area: 'Public venue', lat: 44.4759, lng: -73.2121,
  locality: 'Burlington', region: 'VT', countryCode: 'US', timezone: 'America/New_York',
  whenLabel: 'Thu evening', description: 'Synthetic test only', startsInMinutes: 0,
  startsAtIso: '2026-10-01T23:00:00Z', attendees: 0,
};
const venue = {
  name: 'Contract Hall', aliases: [], address: 'Public venue', locality: 'Burlington',
  region: 'VT', lat: 44.4759, lng: -73.2121, kind: 'hall', allAges: 'unknown',
  sourceUrl: 'https://fixture.example/venue', verifiedOn: '2026-09-29',
};
const feed = {
  id: 'vt-contract', name: 'Contract calendar', kind: 'ics', sourceKind: 'community',
  serviceRegion: 'vermont-corridor', timezone: 'America/New_York',
  url: 'https://fixture.example/calendar.ics', defaultCategory: 'music', defaultRating: 'general',
  venueHint: 'Contract Hall', termsUrl: 'https://fixture.example/terms', termsCheckedOn: '2026-09-29',
  notes: 'Synthetic test only', fixturePath: 'scripts/pipeline/fixtures/ics/contract.ics',
};

it.each([
  ['Burlington', 44.4759, -73.2121], ['White River Junction', 43.6489, -72.3193],
  ['Montpelier', 44.2601, -72.5754], ['Rutland', 43.6106, -72.9726],
  ['Middlebury', 44.0153, -73.1673], ['Bristol', 44.1334, -73.079],
  ['Vergennes', 44.167, -73.2546],
])('accepts a located Vermont record from %s', (locality, lat, lng) => {
  expect(validateRecord({ ...record, locality, lat, lng }).ok).toBe(true);
});

it('accepts covered connecting towns and case/spacing locality aliases', () => {
  for (const locality of ['Richmond', 'Randolph', 'Woodstock', 'Ferrisburg', '  WHITE   RIVER JUNCTION  ']) {
    expect(validateRecord({ ...record, locality }).ok).toBe(true);
  }
});

it('accepts a located Tallahassee record', () => {
  expect(validateRecord({ ...record, locality: 'Tallahassee', region: 'FL', lat: 30.4383, lng: -84.2807 }).ok).toBe(true);
  expect(validateRecord({ ...record, locality: 'Woodville', region: 'FL', lat: 30.3108, lng: -84.2505 }).ok).toBe(true);
});

it('requires regional geometry even for an accepted Austin locality', () => {
  const austin = { ...record, region: 'TX', timezone: 'America/Chicago', locality: 'Austin' };
  expect(validateRecord({ ...austin, locality: 'Creedmoor', lat: 30.0894, lng: -97.7447 }).ok).toBe(true);
  expect(validateRecord({ ...austin, lat: 29.4241, lng: -98.4936 }).ok).toBe(false);
  expect(validateRegistries([], [
    { ...venue, region: 'TX', locality: 'Austin', lat: 29.4241, lng: -98.4936 },
  ])).not.toEqual([]);
  expect(validateRegistries([], [
    { ...venue, region: 'TX', locality: 'Creedmoor', lat: 30.0894, lng: -97.7447 },
  ])).toEqual([]);
});

it.each([
  { region: 'NH', locality: 'Hanover', lat: 43.7022, lng: -72.2896 },
  { locality: 'Stowe' }, { locality: 'Burlington', region: 'UT' },
  { region: undefined }, { locality: undefined }, { countryCode: 'CA' },
  { lat: 41.8819, lng: -87.6278 }, { lat: 44.476, lng: -73.212, region: 'VT', countryCode: undefined },
])('rejects unrelated or inconsistent regional metadata: %j', (change) => {
  expect(validateRecord({ ...record, ...change }).ok).toBe(false);
});

it('preserves legacy Utah and neighboring road-trip coordinate acceptance', () => {
  expect(validateRecord({ ...record, lat: 40.7608, lng: -111.891, region: 'UT', locality: 'Salt Lake City' }).ok).toBe(true);
  expect(validateRecord({ ...record, lat: 40.7372, lng: -114.0375, region: 'NV', locality: 'West Wendover' }).ok).toBe(true);
});

it('uses the same geographic rules for curated venues and records', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  expect(validateRegistries([feed], [{ ...venue, region: undefined }])).not.toEqual([]);
  expect(validateRegistries([feed], [{ ...venue, locality: 'Stowe' }])).not.toEqual([]);
});

it('requires valid service-region metadata, its timezone, and matching venue hints', () => {
  expect(validateRegistries([{ ...feed, serviceRegion: 'unknown' }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, timezone: 'America/Denver' }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, serviceRegion: undefined }], [venue])).not.toEqual([]);
  expect(validateRegistries([feed], [{ ...venue, lat: 40.7608, lng: -111.891, region: 'UT', locality: 'Salt Lake City' }])).not.toEqual([]);
});

it('resolves all reviewed Vermont activation venue hints and publisher-scoped aliases', () => {
  const contracts = [
    { id: 'first-united', venueHint: 'First United Methodist Church Burlington Vermont' },
    { id: 'auto-meets', venueAliases: { 'Island Ice Cream': 'Island Ice Cream Williston' } },
    { id: 'library-sale', venueAliases: { 'South Burlington Public Library, Community': 'South Burlington Public Library' } },
    { id: 'quarterstaff', venueHint: 'Quarterstaff Games Burlington' },
    { id: 'gaming-expansion', venueHint: 'Vermont Gaming Academy South Burlington' },
    { id: 'gaming-vault', venueHint: 'Vermont Gaming Academy South Burlington',
      venueAliases: { 'The Vault at VGA': 'Vermont Gaming Academy South Burlington' } },
  ];
  const feeds = contracts.map((contract) => ({
    ...feed, ...contract, venueHint: contract.venueHint ?? null,
    name: contract.id, url: `https://fixture.example/${contract.id}.ics`,
  }));
  expect(validateRegistries(feeds, venues)).toEqual([]);
});

it('retains VT locality and source identity through calendar normalization', () => {
  const event = { uid: 'public-concert', title: 'Public concert', location: 'Contract Hall', start: '2026-10-01T23:00:00Z' };
  const normalized = calendarRecord(event, { feed, venues: [venue] });
  expect(validateRecord(normalized).ok).toBe(true);
  expect(normalized).toMatchObject({ region: 'VT', locality: 'Burlington', timezone: 'America/New_York',
    sourceName: 'Contract calendar', sourceEventId: '["single","public-concert"]' });
});

it('skips a calendar event outside its declared service region', () => {
  const skipped = [];
  const event = { uid: 'offsite', title: 'Public concert', location: 'Contract Hall', start: '2026-10-01T23:00:00Z' };
  const utahVenue = { ...venue, lat: 40.7608, lng: -111.891, region: 'UT', locality: 'Salt Lake City' };
  expect(calendarRecord(event, { feed, venues: [utahVenue], skip: (reason) => skipped.push(reason) })).toBeNull();
  expect(skipped).toEqual(['outside feed service region']);
});

it('reports an invalid venue alias collection instead of crashing feed-hint validation', () => {
  expect(validateRegistries([feed], [{ ...venue, aliases: null }])).toContain('Invalid venue: Contract Hall');
});
