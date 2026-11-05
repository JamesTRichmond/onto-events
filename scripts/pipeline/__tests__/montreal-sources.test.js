const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

const now = Date.parse('2026-11-01T15:00:00.000Z');

describe('Montreal & Greater Montreal Feed Registries & Fixture Contract', () => {
  const montrealFeedIds = [
    'banq-grande-bibliotheque',
    'place-des-arts-montreal',
    'mbam-montreal',
    'sat-montreal',
    'maison-des-arts-laval',
    'theatre-de-la-ville-longueuil',
  ];
  const montrealFeeds = feeds.filter((f) => montrealFeedIds.includes(f.id));

  it('verifies all Montreal anchor feeds in data/feeds.json', () => {
    expect(montrealFeeds.length).toBeGreaterThanOrEqual(6);
    for (const feed of montrealFeeds) {
      expect(feed.serviceRegion).toBe('montreal');
      expect(feed.timezone).toBe('America/Toronto');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
    expect(validateRegistries(feeds, venues)).toEqual([]);
  });

  it('parses BAnQ Grande Bibliothèque fixture with valid Quebec records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'BAnQ Grande Bibliothèque');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('QC');
      expect(record.countryCode).toBe('CA');
      expect(record.timezone).toBe('America/Toronto');
      expect(serviceRegionForLocation(record)?.id).toBe('montreal');
      expect(record.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('parses Place des Arts fixture with valid Quebec records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Place des Arts Montréal');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('QC');
      expect(record.countryCode).toBe('CA');
      expect(record.timezone).toBe('America/Toronto');
      expect(serviceRegionForLocation(record)?.id).toBe('montreal');
    }
  });

  it('parses MBAM fixture with valid Quebec records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Musée des beaux-arts de Montréal');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('QC');
      expect(record.countryCode).toBe('CA');
      expect(record.timezone).toBe('America/Toronto');
      expect(serviceRegionForLocation(record)?.id).toBe('montreal');
    }
  });

  it('parses SAT fixture with valid Quebec records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Société des arts technologiques');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('QC');
      expect(record.countryCode).toBe('CA');
      expect(record.timezone).toBe('America/Toronto');
      expect(serviceRegionForLocation(record)?.id).toBe('montreal');
    }
  });

  it('parses Maison des arts de Laval fixture with valid Laval records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Maison des arts de Laval');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('QC');
      expect(record.countryCode).toBe('CA');
      expect(record.locality).toBe('Laval');
      expect(record.timezone).toBe('America/Toronto');
      expect(serviceRegionForLocation(record)?.id).toBe('montreal');
    }
  });

  it('parses Théâtre de la Ville Longueuil fixture with valid South Shore records', () => {
    const adapter = SOURCES.find((s) => s.sourceName === 'Théâtre de la Ville Longueuil');
    expect(adapter).toBeDefined();
    const result = readSourceFixture(adapter, adapter.fixturePath, { now });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('QC');
      expect(record.countryCode).toBe('CA');
      expect(record.locality).toBe('Longueuil');
      expect(record.timezone).toBe('America/Toronto');
      expect(serviceRegionForLocation(record)?.id).toBe('montreal');
    }
  });
});
