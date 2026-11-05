const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Fixed evaluation clock matching source-trust.test.js
const now = Date.parse('2026-10-16T12:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  if (!adapter) throw new Error(`Source not found: ${sourceName}`);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

describe('Tucson / Southern Arizona 60 Source Registry & Fixture Contract', () => {
  const tucsonFeeds = feeds.filter((feed) => feed.serviceRegion === 'tucson');

  it('registers 60 validated Tucson feeds in the tucson service region on Mountain Standard Time (no DST)', () => {
    expect(tucsonFeeds.length).toBeGreaterThanOrEqual(50);
    expect(tucsonFeeds).toHaveLength(60);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of tucsonFeeds) {
      expect(feed.timezone).toBe('America/Phoenix');
      expect(feed.serviceRegion).toBe('tucson');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the Tucson fixtures with >0 valid Southern Arizona records and 0 rejects', () => {
    for (const feed of tucsonFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/Phoenix');
        expect(record.region).toBe('AZ');
        expect(serviceRegionForLocation(record)?.id).toBe('tucson');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Pima County Public Library System & Regional Anchors', () => {
  it('maps Main Library programs to Joel D. Valdez Main Library', () => {
    const result = fixtureFor('Joel D. Valdez Main Library (PCPL)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Joel D. Valdez Main Library');
      expect(record.locality).toBe('Tucson');
    }
  });

  it('maps Desert Museum programs to Arizona-Sonora Desert Museum', () => {
    const result = fixtureFor('Arizona-Sonora Desert Museum');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Arizona-Sonora Desert Museum');
      expect(record.locality).toBe('Tucson');
    }
  });
});
