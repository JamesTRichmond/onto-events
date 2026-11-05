const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

const now = Date.parse('2026-10-31T12:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  if (!adapter) throw new Error(`Source not found: ${sourceName}`);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

describe('Brooklyn Anchor Source Registry & Fixture Contract', () => {
  const brooklynFeedIds = [
    'pioneer-works',
    'coney-island-usa',
    'weeksville-heritage-center',
    'industry-city',
    'prospect-park-alliance',
  ];

  it('validates entire feeds and venues registries with 0 errors', () => {
    expect(validateRegistries(feeds, venues)).toEqual([]);
  });

  it('registers all 5 Brooklyn anchor feeds in NYC service region on Eastern time', () => {
    for (const id of brooklynFeedIds) {
      const feed = feeds.find((f) => f.id === id);
      expect(feed).toBeDefined();
      expect(feed.serviceRegion).toBe('nyc');
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses Pioneer Works ICS fixture with valid records and 0 rejects', () => {
    const result = fixtureFor('Pioneer Works');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.timezone).toBe('America/New_York');
      expect(record.region).toBe('NY');
      expect(serviceRegionForLocation(record)?.id).toBe('nyc');
      expect(record.venue).toBe('Pioneer Works');
      expect(record.lat).toBeCloseTo(40.6797, 2);
      expect(record.lng).toBeCloseTo(-74.0135, 2);
    }
  });

  it('parses Coney Island USA ICS fixture with valid records and 0 rejects', () => {
    const result = fixtureFor('Coney Island USA');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.timezone).toBe('America/New_York');
      expect(record.region).toBe('NY');
      expect(serviceRegionForLocation(record)?.id).toBe('nyc');
      expect(record.venue).toBe('Coney Island USA');
      expect(record.lat).toBeCloseTo(40.5755, 2);
      expect(record.lng).toBeCloseTo(-73.9788, 2);
    }
  });

  it('resolves all 5 Brooklyn anchor venues inside NYC service region', () => {
    const anchorVenues = [
      'Pioneer Works',
      'Coney Island USA',
      'Weeksville Heritage Center',
      'Industry City',
      'Prospect Park Alliance',
    ];
    for (const name of anchorVenues) {
      const venue = venues.find((v) => v.name === name);
      expect(venue).toBeDefined();
      expect(serviceRegionForLocation({ ...venue, latitude: venue.lat, longitude: venue.lng })?.id).toBe('nyc');
      expect(venue.locality).toBe('Brooklyn');
      expect(venue.region).toBe('NY');
      expect(venue.countryCode).toBe('US');
    }
  });
});
