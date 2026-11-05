const fs = require('node:fs');
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

describe('Orlando 50+ Source Registry & Fixture Contract', () => {
  const orlandoFeeds = feeds.filter((feed) => feed.serviceRegion === 'orlando');

  it('registers at least 50 validated Orlando feeds in the orlando service region on Eastern time', () => {
    expect(orlandoFeeds.length).toBeGreaterThanOrEqual(50);
    expect(orlandoFeeds).toHaveLength(61);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of orlandoFeeds) {
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.serviceRegion).toBe('orlando');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the Orlando fixtures with >0 valid Orange County records and 0 rejects', () => {
    for (const feed of orlandoFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/New_York');
        expect(record.region).toBe('FL');
        expect(serviceRegionForLocation(record)?.id).toBe('orlando');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Orange County Public Library System (17 Vetted Branches & Municipal Libraries)', () => {
  it('maps Main Library programs to Orlando Public Library Main Library', () => {
    const result = fixtureFor('Orlando Public Library (OCLS Main Branch)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Orlando Public Library (OCLS Main Branch)');
      expect(record.locality).toBe('Orlando');
      expect(record.lat).toBeCloseTo(28.5412, 3);
      expect(record.lng).toBeCloseTo(-81.3789, 3);
    }
  });

  it('maps suburban library feeds to their authentic Orange County coordinates', () => {
    const branches = [
      ['OCLS Alafaya Branch', 'Orlando', 28.5661, -81.1895],
      ['OCLS Eatonville Branch', 'Eatonville', 28.6186, -81.3855],
      ['OCLS North Orange Branch', 'Apopka', 28.6756, -81.4921],
      ['OCLS Winter Garden Branch (S.C. Battaglia)', 'Winter Garden', 28.5658, -81.5744],
      ['OCLS Windermere Branch', 'Windermere', 28.4969, -81.5347],
      ['Winter Park Public Library', 'Winter Park', 28.5956, -81.3625],
      ['Maitland Public Library', 'Maitland', 28.6258, -81.3644],
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

describe('Orlando Geographic Containment & Boundary Exclusions', () => {
  it('rejects venues in neighboring counties outside Orange County', () => {
    // Kissimmee (Osceola County)
    const kissimmee = {
      name: 'Kissimmee Lakefront Park',
      address: '201 Lakeview Dr, Kissimmee, FL 34741',
      locality: 'Kissimmee',
      region: 'FL',
      countryCode: 'US',
      lat: 28.2911,
      lng: -81.4089,
    };
    expect(serviceRegionForLocation(kissimmee)).toBeNull();

    // Sanford (Seminole County)
    const sanford = {
      name: 'Wayne Densch Performing Arts Center',
      address: '203 S Magnolia Ave, Sanford, FL 32771',
      locality: 'Sanford',
      region: 'FL',
      countryCode: 'US',
      lat: 28.8105,
      lng: -81.2678,
    };
    expect(serviceRegionForLocation(sanford)).toBeNull();

    // Clermont (Lake County)
    const clermont = {
      name: 'Lake Louisa State Park',
      address: '7305 US-27, Clermont, FL 34714',
      locality: 'Clermont',
      region: 'FL',
      countryCode: 'US',
      lat: 28.4389,
      lng: -81.7342,
    };
    expect(serviceRegionForLocation(clermont)).toBeNull();
  });
});
