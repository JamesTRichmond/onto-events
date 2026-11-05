const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

const now = Date.parse('2026-10-08T15:12:42.253Z');

describe('Middlebury & Addison County Feed Registries & Fixture Contract', () => {
  const middleburyFeedIds = [
    'middlebury-public-arts',
    'middlebury-community-music-center',
    'henry-sheldon-museum',
    'bread-loaf-mountain-zen',
  ];
  const middleburyFeeds = feeds.filter((f) => middleburyFeedIds.includes(f.id));

  it('verifies all Middlebury anchor feeds in data/feeds.json', () => {
    expect(middleburyFeeds.length).toBeGreaterThanOrEqual(4);
    for (const feed of middleburyFeeds) {
      expect(feed.serviceRegion).toBe('vermont-corridor');
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
    expect(validateRegistries(feeds, venues)).toEqual([]);
  });

  it('parses Middlebury Public Arts fixture with valid Vermont records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Middlebury College Public Arts');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('VT');
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('vermont-corridor');
      expect(record.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('parses Middlebury Community Music Center fixture with valid Vermont records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Middlebury Community Music Center');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('VT');
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('vermont-corridor');
    }
  });
});
