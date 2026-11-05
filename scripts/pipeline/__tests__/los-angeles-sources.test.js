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

describe('Los Angeles 50+ Source Registry & Fixture Contract', () => {
  const laFeeds = feeds.filter((feed) => feed.serviceRegion === 'los-angeles');

  it('registers at least 50 validated Los Angeles feeds in the los-angeles service region on Pacific time', () => {
    expect(laFeeds.length).toBeGreaterThanOrEqual(50);
    expect(laFeeds).toHaveLength(60);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of laFeeds) {
      expect(feed.timezone).toBe('America/Los_Angeles');
      expect(feed.serviceRegion).toBe('los-angeles');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the Los Angeles fixtures with >0 valid Los Angeles County records and 0 rejects', () => {
    for (const feed of laFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/Los_Angeles');
        expect(record.region).toBe('CA');
        expect(serviceRegionForLocation(record)?.id).toBe('los-angeles');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Los Angeles Public Library (LAPL) & Regional Library Branches', () => {
  it('maps Central Library programs to Los Angeles Public Library (Central Library)', () => {
    const result = fixtureFor('Los Angeles Public Library (Central Library)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Los Angeles Public Library (Central Library)');
      expect(record.locality).toBe('Los Angeles');
      expect(record.lat).toBeCloseTo(34.0503, 3);
      expect(record.lng).toBeCloseTo(-118.2553, 3);
    }
  });

  it('maps regional library branches to their authentic Los Angeles County coordinates', () => {
    const branches = [
      ['LAPL Hollywood Regional Branch Library', 'Hollywood', 34.1011, -118.3289],
      ['LAPL West Los Angeles Regional Branch Library', 'West Los Angeles', 34.0456, -118.4502],
      ['LAPL North Hollywood Regional Branch Library', 'North Hollywood', 34.1654, -118.3789],
      ['LAPL San Pedro Regional Branch Library', 'San Pedro', 33.7356, -118.2925],
      ['LA County Library — West Hollywood Library', 'West Hollywood', 34.0831, -118.3842],
      ['LA County Library — Culver City Julian Dixon Library', 'Culver City', 34.0092, -118.3965],
      ['LA County Library — Lancaster Library', 'Lancaster', 34.6983, -118.1417],
      ['Santa Monica Public Library (Main Library)', 'Santa Monica', 34.0181, -118.4917],
      ['Pasadena Public Library (Lamanda Park Branch)', 'Pasadena', 34.1481, -118.0967],
      ['Long Beach Public Library (Billie Jean King Main Library)', 'Long Beach', 33.7692, -118.1936],
      ['Glendale Central Library', 'Glendale', 34.1444, -118.2522],
    ];

    for (const [name, locality, lat, lng] of branches) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      const record = result.records[0];
      expect(record.locality).toBe(locality);
      expect(record.lat).toBeCloseTo(lat, 2);
      expect(record.lng).toBeCloseTo(lng, 2);
    }
  });
});

describe('Los Angeles Geographic Containment & Boundary Exclusions', () => {
  it('accepts venues in expanded Los Angeles, Orange, and Ventura counties', () => {
    // Anaheim (Orange County, CA)
    const anaheim = {
      name: 'Anaheim Central Library',
      address: '500 W Broadway, Anaheim, CA 92805',
      locality: 'Anaheim',
      region: 'CA',
      countryCode: 'US',
      lat: 33.8344,
      lng: -117.9189,
    };
    expect(serviceRegionForLocation(anaheim)?.id).toBe('los-angeles');

    // Thousand Oaks (Ventura County, CA)
    const thousandOaks = {
      name: 'Thousand Oaks Civic Arts Plaza',
      address: '2100 Thousand Oaks Blvd, Thousand Oaks, CA 91362',
      locality: 'Thousand Oaks',
      region: 'CA',
      countryCode: 'US',
      lat: 34.1758,
      lng: -118.8502,
    };
    expect(serviceRegionForLocation(thousandOaks)?.id).toBe('los-angeles');
  });

  it('rejects venues in neighboring counties outside the expanded footprint', () => {
    // Ontario (San Bernardino County, CA)
    const ontario = {
      name: 'Ontario Museum of History and Art',
      address: '225 S Euclid Ave, Ontario, CA 91762',
      locality: 'Ontario',
      region: 'CA',
      countryCode: 'US',
      lat: 34.0622,
      lng: -117.6508,
    };
    expect(serviceRegionForLocation(ontario)).toBeNull();

    // Riverside (Riverside County, CA)
    const riverside = {
      name: 'Riverside Art Museum',
      address: '3425 Mission Inn Avenue, Riverside, CA 92501',
      locality: 'Riverside',
      region: 'CA',
      countryCode: 'US',
      lat: 33.9806,
      lng: -117.3739,
    };
    expect(serviceRegionForLocation(riverside)).toBeNull();
  });
});
