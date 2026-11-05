const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Fixed evaluation clock matching source-trust.test.js
const now = Date.parse('2026-10-18T12:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  if (!adapter) throw new Error(`Source not found: ${sourceName}`);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

describe('Philadelphia 60-Source Registry & Fixture Contract', () => {
  const philadelphiaFeeds = feeds.filter((feed) => feed.serviceRegion === 'philadelphia');

  it('registers at least 50 validated Philadelphia feeds in the philadelphia service region on Eastern time', () => {
    expect(philadelphiaFeeds.length).toBeGreaterThanOrEqual(50);
    expect(philadelphiaFeeds).toHaveLength(60);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of philadelphiaFeeds) {
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.serviceRegion).toBe('philadelphia');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the Philadelphia fixtures with >0 valid Philadelphia County records and 0 rejects', () => {
    for (const feed of philadelphiaFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/New_York');
        expect(record.region).toBe('PA');
        expect(serviceRegionForLocation(record)?.id).toBe('philadelphia');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Free Library of Philadelphia (16 Vetted Branches)', () => {
  it('maps Main Library programs to Parkway Central Library', () => {
    const result = fixtureFor('Free Library of Philadelphia — Parkway Central Library');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Free Library of Philadelphia — Parkway Central Library');
      expect(record.locality).toBe('Philadelphia');
      expect(record.lat).toBeCloseTo(39.9598, 3);
      expect(record.lng).toBeCloseTo(-75.1710, 3);
    }
  });

  it('maps neighborhood library feeds to their authentic Philadelphia County coordinates', () => {
    const branches = [
      ['FLP Lucien E. Blackwell West Philadelphia Regional Library', 'Philadelphia', 39.9575, -75.2260],
      ['FLP Chestnut Hill Branch Library', 'Philadelphia', 40.0776, -75.2072],
      ['FLP Fishtown Community Library', 'Philadelphia', 39.9722, -75.1278],
      ['FLP South Philadelphia Library', 'Philadelphia', 39.9288, -75.1685],
      ['FLP Roxborough Branch Library', 'Philadelphia', 40.0388, -75.2238],
      ['FLP Independence Branch Library', 'Philadelphia', 39.9501, -75.1517],
      ['FLP Northeast Regional Library', 'Philadelphia', 40.0402, -75.0560],
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

describe('Philadelphia Geographic Containment & Boundary Exclusions', () => {
  it('accepts venues across the 5-county Greater Delaware Valley footprint', () => {
    const venues = [
      {
        name: 'Camden Waterfront Park',
        address: 'Riverside Dr, Camden, NJ 08103',
        locality: 'Camden',
        region: 'NJ',
        countryCode: 'US',
        lat: 39.9448,
        lng: -75.1199,
      },
      {
        name: 'Tower Theater',
        address: '69th & Ludlow, Upper Darby, PA 19082',
        locality: 'Upper Darby',
        region: 'PA',
        countryCode: 'US',
        lat: 39.9598,
        lng: -75.2598,
      },
      {
        name: 'Subaru Park',
        address: '1 Stadium Dr, Chester, PA 19013',
        locality: 'Chester',
        region: 'PA',
        countryCode: 'US',
        lat: 39.8328,
        lng: -75.3785,
      },
      {
        name: 'Montgomery County Courthouse',
        address: '2 E Airy St, Norristown, PA 19401',
        locality: 'Norristown',
        region: 'PA',
        countryCode: 'US',
        lat: 40.1158,
        lng: -75.3444,
      },
      {
        name: 'Cherry Hill Community Center',
        address: '820 Mercer St, Cherry Hill, NJ 08002',
        locality: 'Cherry Hill',
        region: 'NJ',
        countryCode: 'US',
        lat: 39.9428,
        lng: -75.0275,
      },
      {
        name: 'Michener Art Museum',
        address: '138 S Pine St, Doylestown, PA 18901',
        locality: 'Doylestown',
        region: 'PA',
        countryCode: 'US',
        lat: 40.3101,
        lng: -75.1299,
      },
    ];

    for (const venue of venues) {
      const region = serviceRegionForLocation(venue);
      expect(region).not.toBeNull();
      expect(region.id).toBe('philadelphia');
    }
  });

  it('rejects venues in neighboring counties outside the 5-county footprint and across unserved state lines', () => {
    // Wilmington (New Castle County, DE) - DE is not in philadelphia regions
    const wilmington = {
      name: 'The Grand Opera House',
      address: '818 N Market St, Wilmington, DE 19801',
      locality: 'Wilmington',
      region: 'DE',
      countryCode: 'US',
      lat: 39.7447,
      lng: -75.5484,
    };
    expect(serviceRegionForLocation(wilmington)).toBeNull();

    // Trenton (Mercer County, NJ) - outside lngMax
    const trenton = {
      name: 'New Jersey State Museum',
      address: '205 W State St, Trenton, NJ 08608',
      locality: 'Trenton',
      region: 'NJ',
      countryCode: 'US',
      lat: 40.2171,
      lng: -74.7429,
    };
    expect(serviceRegionForLocation(trenton)).toBeNull();

    // Allentown (Lehigh County, PA) - outside latMax
    const allentown = {
      name: 'Allentown Art Museum',
      address: '31 N 5th St, Allentown, PA 18101',
      locality: 'Allentown',
      region: 'PA',
      countryCode: 'US',
      lat: 40.6023,
      lng: -75.4714,
    };
    expect(serviceRegionForLocation(allentown)).toBeNull();

    // Reading (Berks County, PA) - outside lngMin
    const reading = {
      name: 'Reading Public Museum',
      address: '500 Museum Rd, Reading, PA 19611',
      locality: 'Reading',
      region: 'PA',
      countryCode: 'US',
      lat: 40.3356,
      lng: -75.9269,
    };
    expect(serviceRegionForLocation(reading)).toBeNull();

    // Atlantic City (Atlantic County, NJ) - outside latMin and lngMax
    const atlanticCity = {
      name: 'Boardwalk Hall',
      address: '2301 Boardwalk, Atlantic City, NJ 08401',
      locality: 'Atlantic City',
      region: 'NJ',
      countryCode: 'US',
      lat: 39.3643,
      lng: -74.4229,
    };
    expect(serviceRegionForLocation(atlanticCity)).toBeNull();
  });
});
