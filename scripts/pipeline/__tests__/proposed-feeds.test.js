// Dry-run evidence for the staged (not live) calendar sources from the 2026-09
// source discovery run. The staged registries must validate together with the
// live ones, and every staged fixture must flow through its real adapter and
// map at least one venue, so James can promote entries with a copy.
const liveFeeds = require('../../../data/feeds.json');
const liveVenues = require('../../../data/venues.json');
const proposedFeeds = require('../../../docs/sources/proposals/feeds.proposed.json');
const proposedVenues = require('../../../docs/sources/proposals/venues.proposed.json');
const { validateRegistries } = require('../registry-validation');
const { calendarAdapters } = require('../sources');
const { readSourceFixture } = require('../run-source');

// Fixtures were captured on 2026-09-05; a fixed clock keeps the evidence stable.
const now = Date.parse('2026-09-05T00:00:00Z');
const liveFeedIds = new Set(liveFeeds.map((feed) => feed.id));
const liveVenueNames = new Set(liveVenues.map((venue) => venue.name));
const stagedFeeds = proposedFeeds.filter((feed) => !liveFeedIds.has(feed.id));
const stagedVenues = proposedVenues.filter((venue) => !liveVenueNames.has(venue.name));
const venues = [...liveVenues, ...stagedVenues];

it('validates the staged feeds and venues together with the live registries', () => {
  expect(validateRegistries([...liveFeeds, ...stagedFeeds], venues)).toEqual([]);
  expect(proposedFeeds.length).toBeGreaterThanOrEqual(12);
});

it('keeps historical Path A and reviewed Vermont promotions registered', () => {
  expect(liveVenueNames.has('Gallivan Hall')).toBe(true);
  expect(liveVenueNames.has('Murray Museum')).toBe(true);
  expect(liveFeedIds.has('clark-planetarium')).toBe(true);
  expect(liveFeedIds.has('slco-parks-recreation')).toBe(true);
  expect(stagedVenues).toEqual([]);
  expect(stagedFeeds).toEqual([]);
});

it.each(proposedFeeds.map((feed) => [feed.id, feed]))('%s dry-runs through its declared adapter and maps a venue', (id, feed) => {
  const [adapter] = calendarAdapters([feed], venues);
  const result = readSourceFixture(adapter, undefined, { now });
  // Narrow new public exports contain one car meetup and two sale days. Keep
  // the older three-row fixture requirement for the historical sources.
  const narrowExport = ['vermont-auto-public-car-meets', 'south-burlington-library-book-sale'].includes(id);
  expect(result.rawCount).toBeGreaterThanOrEqual(narrowExport ? 1 : 3);
  expect(result.records.length).toBeGreaterThanOrEqual(1);
  expect(result.records.every((r) => r.sourceName === feed.name && r.source === 'live' && r.id.startsWith(`${feed.kind}-${feed.id}-`))).toBe(true);
  expect(result.records.every((r) => ['family', 'general', 'mature'].includes(r.rating))).toBe(true);
});
