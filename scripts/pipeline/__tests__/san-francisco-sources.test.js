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

describe('San Francisco & Bay Area Core 60 Source Registry & Fixture Contract', () => {
  const sfFeeds = feeds.filter((feed) => feed.serviceRegion === 'san-francisco');

  it('registers at least 60 validated San Francisco feeds in the san-francisco service region on Pacific time', () => {
    expect(sfFeeds.length).toBeGreaterThanOrEqual(50);
    expect(sfFeeds).toHaveLength(60);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of sfFeeds) {
      expect(feed.timezone).toBe('America/Los_Angeles');
      expect(feed.serviceRegion).toBe('san-francisco');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the San Francisco fixtures with >0 valid Bay Area records and 0 rejects', () => {
    for (const feed of sfFeeds) {
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
        expect(serviceRegionForLocation(record)?.id).toBe('san-francisco');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('San Francisco Public Library & Regional Bay Area Libraries', () => {
  it('maps Main Library programs to San Francisco Public Library (Main Library)', () => {
    const result = fixtureFor('San Francisco Public Library (Main Library)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('San Francisco Public Library (Main Library)');
      expect(record.locality).toBe('San Francisco');
      expect(record.lat).toBeCloseTo(37.7793, 3);
      expect(record.lng).toBeCloseTo(-122.4161, 3);
    }
  });

  it('maps suburban and regional library feeds to authentic Bay Area coordinates', () => {
    const branches = [
      ['SFPL Mission Branch Library', 'San Francisco', 37.7528, -122.4198],
      ['SFPL Chinatown/Him Mark Lai Branch', 'San Francisco', 37.7947, -122.4095],
      ['Oakland Public Library Main Branch', 'Oakland', 37.7997, -122.2635],
      ['Berkeley Public Library Central', 'Berkeley', 37.8690, -122.2685],
      ['San Mateo County Libraries (San Carlos Branch)', 'San Carlos', 37.5065, -122.2605],
      ['Marin County Free Library (Civic Center Branch)', 'San Rafael', 37.9984, -122.5307],
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

describe('San Francisco & Bay Area Geographic Containment & Boundary Exclusions', () => {
  it('rejects venues outside San Francisco, Alameda, San Mateo, and Marin counties', () => {
    // Sacramento (Sacramento County)
    const sacramento = {
      name: 'California State Capitol Museum',
      address: '1315 10th St, Sacramento, CA 95814',
      locality: 'Sacramento',
      region: 'CA',
      countryCode: 'US',
      lat: 38.5766,
      lng: -121.4934,
    };
    expect(serviceRegionForLocation(sacramento)).toBeNull();

    // San Jose (Santa Clara County)
    const sanjose = {
      name: 'San Jose Museum of Art',
      address: '110 S Market St, San Jose, CA 95113',
      locality: 'San Jose',
      region: 'CA',
      countryCode: 'US',
      lat: 37.3337,
      lng: -121.8894,
    };
    expect(serviceRegionForLocation(sanjose)).toBeNull();

    // Santa Cruz (Santa Cruz County)
    const santacruz = {
      name: 'Santa Cruz Beach Boardwalk',
      address: '400 Beach St, Santa Cruz, CA 95060',
      locality: 'Santa Cruz',
      region: 'CA',
      countryCode: 'US',
      lat: 36.9644,
      lng: -122.0177,
    };
    expect(serviceRegionForLocation(santacruz)).toBeNull();

    // Richmond (Contra Costa County)
    const richmond = {
      name: 'Richmond Art Center',
      address: '2540 Barrett Ave, Richmond, CA 94804',
      locality: 'Richmond',
      region: 'CA',
      countryCode: 'US',
      lat: 37.9358,
      lng: -122.3477,
    };
    expect(serviceRegionForLocation(richmond)).toBeNull();

    // Concord (Contra Costa County)
    const concord = {
      name: 'Concord Pavilion',
      address: '2000 Kirker Pass Rd, Concord, CA 94521',
      locality: 'Concord',
      region: 'CA',
      countryCode: 'US',
      lat: 37.9780,
      lng: -122.0311,
    };
    expect(serviceRegionForLocation(concord)).toBeNull();

    // Reno (Nevada)
    const reno = {
      name: 'Nevada Museum of Art',
      address: '160 W Liberty St, Reno, NV 89501',
      locality: 'Reno',
      region: 'NV',
      countryCode: 'US',
      lat: 39.5228,
      lng: -119.8123,
    };
    expect(serviceRegionForLocation(reno)).toBeNull();
  });
});
