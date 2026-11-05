const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { validateRegistries } = require('../registry-validation');
const { calendarAdapters, SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { syncSources } = require('../sync-sources');
const { getServiceRegion, serviceRegionForLocation } = require('../service-regions');
const { CITIES, COMING_SOON_CITIES } = require('../../../data/cities');

const feed = feeds.find((entry) => entry.id === 'nyc-parks-queens');
const [adapter] = calendarAdapters([feed], venues);

it('lists the five NYC boroughs instead of a New York coming-soon entry', () => {
  expect(COMING_SOON_CITIES).not.toContain('New York');
  expect(CITIES.some((city) => city.name === 'New York')).toBe(false);
  expect(CITIES.filter((city) => city.serviceRegion === 'nyc').map((city) => city.name)).toEqual([
    'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island',
  ]);
});

it('registers only the reported Parks endpoint as a quarantined community candidate', () => {
  expect(validateRegistries(feeds, venues)).toEqual([]);
  expect(feed).toMatchObject({
    kind: 'socrata', sourceKind: 'community', serviceRegion: 'nyc',
    timezone: 'America/New_York', defaultCategory: 'outdoors', defaultRating: 'general',
    url: 'https://data.cityofnewyork.us/resource/w3wp-dpdi.json',
    termsCheckedOn: '2026-10-15', pausedReason: expect.any(String),
  });
  expect(feed.notes).toContain('REPORTED');
  expect(feed.notes).toContain('not independently VERIFIED');
  expect(SOURCES.find((source) => source.sourceName === feed.name)).toBeDefined();
  expect(validateRegistries([{ ...feed, pausedReason: undefined }], venues))
    .toContain(`Invalid feed: ${feed.id}`);
});

it('never fetches, writes, retires, or invents fixture records for the unsupported reader', async () => {
  expect(readSourceFixture(adapter)).toMatchObject({
    records: [], rawCount: 0, truncated: true, retireMissing: false,
    skipReason: expect.stringContaining('Socrata reader not implemented'),
  });
  const fetchImpl = jest.fn();
  const clientFactory = jest.fn();
  const { summaries } = await syncSources({
    sources: [adapter], fetchImpl, clientFactory, log: jest.fn(), logError: jest.fn(),
  });
  expect(summaries).toEqual([expect.objectContaining({
    sourceName: feed.name, status: 'skipped', recordCount: 0,
    reason: expect.stringContaining('paused:'),
  })]);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(clientFactory).not.toHaveBeenCalled();
  const [unpaused] = calendarAdapters([{ ...feed, pausedReason: undefined }], venues);
  expect(await unpaused.fetch({ fetchImpl })).toMatchObject({
    items: [], truncated: true, retireMissing: false,
    skipReason: expect.stringContaining('Socrata reader not implemented'),
  });
  expect(unpaused.normalize({ title: 'Unverified event' })).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('uses the shared NYC region without shadowing other borough sources', () => {
  expect(getServiceRegion('nyc-queens')).toBeUndefined();
  expect(getServiceRegion('nyc').preparationOnly).toBe(false);
  expect(getServiceRegion('nyc').timezone).toBe('America/New_York');
  const point = { lat: 40.745, lng: -73.845, locality: 'Queens', region: 'NY', countryCode: 'US' };
  expect(serviceRegionForLocation(point)?.id).toBe('nyc');
  expect(serviceRegionForLocation({ ...point, locality: 'queens, ny' })?.id).toBe('nyc');
  for (const locality of ['Manhattan', 'Brooklyn', 'Bronx', 'Long Island City']) {
    expect(serviceRegionForLocation({ ...point, locality })?.id).toBe('nyc');
  }
  for (const changes of [
    { locality: 'Unknown' }, { region: 'NJ' }, { countryCode: 'CA' }, { lat: 41 }, { lng: -73.6 },
  ]) expect(serviceRegionForLocation({ ...point, ...changes })).toBeNull();
});
