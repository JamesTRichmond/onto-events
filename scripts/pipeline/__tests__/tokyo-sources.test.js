const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Fixed evaluation clock
const now = Date.parse('2026-10-31T12:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  if (!adapter) throw new Error(`Source not found: ${sourceName}`);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

describe('Tokyo 60 Source Registry & Fixture Contract', () => {
  const tokyoFeeds = feeds.filter((feed) => feed.serviceRegion === 'tokyo');

  it('registers at least 60 validated Tokyo feeds in the tokyo service region on Asia/Tokyo time', () => {
    expect(tokyoFeeds.length).toBeGreaterThanOrEqual(60);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of tokyoFeeds) {
      expect(feed.timezone).toBe('Asia/Tokyo');
      expect(feed.serviceRegion).toBe('tokyo');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses Tokyo fixtures with >0 valid Tokyo records and 0 rejects', () => {
    for (const feed of tokyoFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('Asia/Tokyo');
        expect(record.region).toBe('Tokyo');
        expect(record.countryCode).toBe('JP');
        expect(serviceRegionForLocation(record)?.id).toBe('tokyo');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Tokyo Metropolitan Central Library & Civic Hubs', () => {
  it('maps Central Library programs to Tokyo Metropolitan Central Library', () => {
    const result = fixtureFor('Tokyo Metropolitan Central Library (東京都立中央図書館)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Tokyo Metropolitan Central Library');
      expect(record.locality).toBe('Tokyo');
      expect(record.timezone).toBe('Asia/Tokyo');
    }
  });

  it('verifies all Tokyo venues belong to the tokyo service region', () => {
    const tokyoVenues = venues.filter((venue) => venue.region === 'Tokyo' && venue.countryCode === 'JP');
    expect(tokyoVenues.length).toBeGreaterThanOrEqual(60);
    for (const v of tokyoVenues) {
      const region = serviceRegionForLocation(v);
      expect(region?.id).toBe('tokyo');
      expect(v.sourceUrl).toMatch(/^https:\/\//);
      expect(v.address).toBeDefined();
      expect(v.lat).toBeGreaterThan(35.15);
      expect(v.lat).toBeLessThan(36.15);
      expect(v.lng).toBeGreaterThan(139.20);
      expect(v.lng).toBeLessThan(140.40);
    }
  });
});
