const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Clock inside the 2026-10-16 capture window. Events before this instant are dropped.
const now = Date.parse('2026-10-16T15:00:00Z');

describe('NYC free community calendars', () => {
  const nycFeeds = feeds.filter((feed) => feed.serviceRegion === 'nyc');

  it('registers the verified NYC feeds in the nyc service region', () => {
    expect(nycFeeds.length).toBeGreaterThan(8);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of nycFeeds) {
      expect(feed.sourceKind).toBe('community');
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.serviceRegion).toBe('nyc');
      expect(feed.url).toMatch(/^https:\/\//);
      if (feed.kind === 'tribe') expect(feed.url).toMatch(/^https:\/\/[^?]+\/wp-json\/tribe\/events\/v1\/events$/);
    }
  });

  it('parses each fixture to mapped New York City records', () => {
    for (const feed of nycFeeds) {
      const adapter = SOURCES.find((source) => source.sourceName === feed.name);
      expect(adapter).toBeTruthy();
      const result = readSourceFixture(adapter, adapter.fixturePath, { now });
      if (feed.id === 'nyc-parks-queens') {
        expect(result).toMatchObject({
          records: [], rawCount: 0, truncated: true, retireMissing: false,
          skipReason: expect.stringContaining('Socrata reader not implemented'),
        });
        continue;
      }
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      expect(result.unmapped).toEqual({});
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/New_York');
        expect(record.region).toBe('NY');
        expect(record.sourceKind).toBe('community');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
        expect(serviceRegionForLocation(record)?.id).toBe('nyc');
      }
    }
  });

  it('does not turn a BMCC students-only workshop into a card', () => {
    const feed = feeds.find((item) => item.id === 'bmcc-public-events');
    const adapter = SOURCES.find((source) => source.sourceName === feed.name);
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.some((record) => /students only/i.test(record.title))).toBe(false);
    expect(result.skipped['restricted or room-booking listing']).toBeGreaterThan(0);
  });
});
