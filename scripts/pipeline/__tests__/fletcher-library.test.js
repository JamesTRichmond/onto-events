const fs = require('node:fs');
const { createIcsAdapter } = require('../adapters/ics');
const { resolveVenue } = require('../calendar-record');
const { readSourceFixture, processSourceItems } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const now = Date.parse('2026-10-08T14:18:08.762Z');
const feed = feeds.find((f) => f.id === 'fletcher-free-library');
const main = 'Fletcher Free Library Main Library';
const branch = 'Fletcher Free Library New North End Branch';
const adapter = createIcsAdapter(feed, venues);

it('scopes generic library rooms to their publisher and leaves off-site or missing locations unresolved', () => {
  expect(resolveVenue({ location: 'Main Library' }, feed, venues).venue.name).toBe(main);
  expect(resolveVenue({ location: 'New North End Branch, New North End Branch' }, feed, venues).venue.name).toBe(branch);
  const { venueAliases, ...otherPublisher } = feed;
  expect(resolveVenue({ location: 'Main Library' }, otherPublisher, venues).venue).toBeNull();
  expect(resolveVenue({ location: 'Unverified off-site address' }, { ...feed, venueHint: main }, venues).venue).toBeNull();
  expect(resolveVenue({ location: '' }, feed, venues).venue).toBeNull();
});

it('rejects malformed, ambiguous and cross-region room maps before a feed can run', () => {
  expect(validateRegistries([feed], venues)).toEqual([]);
  for (const venueAliases of [null, [], { '': main }, { room: 'Kilby Court' }, { room: 'Unknown building' }, { 'Main Library': main, ' main library ': branch }]) {
    expect(validateRegistries([{ ...feed, venueAliases }], venues).some((error) => error.startsWith('Invalid feed venue alias'))).toBe(true);
  }
  expect(validateRegistries([{ ...feed, retireMissing: true }], venues)).toContain(`Invalid feed: ${feed.id}`);
});

it('keeps real occurrence times and Census-verified points across the two Burlington buildings', () => {
  const result = readSourceFixture(adapter, adapter.fixturePath, { now });
  expect(result.rejectedCount).toBe(0);
  expect(new Set(result.records.map((r) => r.venue))).toEqual(new Set([main, branch]));
  for (const record of result.records) {
    expect(record).toMatchObject({ locality: 'Burlington', region: 'VT', timezone: 'America/New_York' });
    expect(record.lat).toBe(record.venue === main ? 44.477108053089 : 44.507169997605);
    expect(record.lng).toBe(record.venue === main ? -73.210961024167 : -73.245274978488);
  }
  expect(result.records.some((r) => r.startsAtIso.startsWith('2026-11-02'))).toBe(true);
});

it('protects the rolling subscription from absence retirement while preserving explicit cancellations and identity', async () => {
  const content = fs.readFileSync(adapter.fixturePath, 'utf8');
  const first = adapter.parseFixture(content, { now });
  expect(first.retireMissing).toBe(false);
  const fetched = await adapter.fetch({ now, fetchImpl: async () => ({ ok: true, text: async () => content }) });
  expect(fetched.retireMissing).toBe(false);
  const unchanged = readSourceFixture(adapter, adapter.fixturePath, { now }).records;
  const cancelled = processSourceItems(adapter, adapter.parseFixture(content.replace(/END:VEVENT/g, 'STATUS:CANCELLED\r\nEND:VEVENT'), { now }), { now }).records;
  expect(cancelled.map((r) => r.id)).toEqual(unchanged.map((r) => r.id));
  expect(cancelled.every((r) => r.isCancelled)).toBe(true);
  const { retireMissing, ...regularFeed } = feed;
  expect(createIcsAdapter(regularFeed, venues).parseFixture(content, { now }).retireMissing).toBeUndefined();
});
