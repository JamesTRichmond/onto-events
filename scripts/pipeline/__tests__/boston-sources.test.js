const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Fixed evaluation clock
const now = Date.parse('2026-10-18T12:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  if (!adapter) throw new Error(`Source not found: ${sourceName}`);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

describe('Boston 60 Source Registry & Fixture Contract', () => {
  const bostonFeeds = feeds.filter((feed) => feed.serviceRegion === 'boston');

  it('registers at least 60 validated Boston feeds in the boston service region on Eastern time', () => {
    expect(bostonFeeds.length).toBeGreaterThanOrEqual(50);
    expect(bostonFeeds).toHaveLength(60);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of bostonFeeds) {
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.serviceRegion).toBe('boston');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the Boston fixtures with >0 valid Greater Boston records and 0 rejects', () => {
    for (const feed of bostonFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/New_York');
        expect(record.region).toBe('MA');
        expect(serviceRegionForLocation(record)?.id).toBe('boston');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Boston Public Library & Regional Civic Networks', () => {
  it('maps Central Library programs to Copley Square anchor', () => {
    const result = fixtureFor('Boston Public Library (Central Library in Copley Square)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Boston Public Library (Central Library in Copley Square)');
      expect(record.locality).toBe('Boston');
    }
  });

  it('maps Cambridge Main Library programs to Cambridge', () => {
    const result = fixtureFor('Cambridge Public Library (Main Library)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Cambridge Public Library (Main Library)');
      expect(record.locality).toBe('Cambridge');
    }
  });
});
