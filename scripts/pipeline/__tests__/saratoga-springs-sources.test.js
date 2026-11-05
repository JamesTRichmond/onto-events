const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

const now = Date.parse('2026-10-31T18:00:00.000Z');

describe('Saratoga Springs & Regional Feed Registries & Fixture Contract', () => {
  const saratogaFeedIds = [
    'saratoga-springs-public-library',
    'caffe-lena-concerts',
    'spac-classical-series',
    'crandall-public-library',
    'saratoga-farmers-market',
    'tang-teaching-museum',
  ];
  const saratogaFeeds = feeds.filter((f) => saratogaFeedIds.includes(f.id));

  it('verifies all Saratoga Springs anchor feeds in data/feeds.json', () => {
    expect(saratogaFeeds.length).toBeGreaterThanOrEqual(6);
    for (const feed of saratogaFeeds) {
      expect(feed.serviceRegion).toBe('saratoga-springs');
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
    expect(validateRegistries(feeds, venues)).toEqual([]);
  });

  it('parses Saratoga Springs Public Library schedule fixture with valid New York records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Saratoga Springs Public Library');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('NY');
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('saratoga-springs');
      expect(record.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('parses Caffè Lena schedule fixture with valid New York records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Caffè Lena');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('NY');
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('saratoga-springs');
    }
  });

  it('parses Saratoga Farmers Market schedule fixture with valid New York records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === "Saratoga Farmers' Market");
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('NY');
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('saratoga-springs');
    }
  });
});
