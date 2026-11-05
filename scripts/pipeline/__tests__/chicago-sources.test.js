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

describe('Chicago 60+ Source Registry & Fixture Contract', () => {
  const chicagoFeeds = feeds.filter((feed) => feed.serviceRegion === 'chicago');

  it('registers at least 60 validated Chicago feeds in the chicago service region on Central time', () => {
    expect(chicagoFeeds.length).toBeGreaterThanOrEqual(60);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of chicagoFeeds) {
      expect(feed.timezone).toBe('America/Chicago');
      expect(feed.serviceRegion).toBe('chicago');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the Chicago fixtures with >0 valid Cook County records and 0 rejects', () => {
    for (const feed of chicagoFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/Chicago');
        expect(record.region).toBe('IL');
        expect(serviceRegionForLocation(record)?.id).toBe('chicago');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Chicago Public Library & Suburban Municipal Libraries', () => {
  it('maps Main Library programs to Harold Washington Library Center', () => {
    const result = fixtureFor('Harold Washington Library Center (CPL Main)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Harold Washington Library Center (CPL Main)');
      expect(record.locality).toBe('Chicago');
      expect(record.lat).toBeCloseTo(41.8763, 3);
      expect(record.lng).toBeCloseTo(-87.6281, 3);
    }
  });

  it('maps suburban and regional library feeds to authentic Cook County coordinates', () => {
    const branches = [
      ['CPL Sulzer Regional Library', 'Chicago', 41.9625, -87.6865],
      ['CPL Woodson Regional Library', 'Chicago', 41.7208, -87.6432],
      ['CPL Legler Regional Library', 'Chicago', 41.8792, -87.7261],
      ['Evanston Public Library (Main)', 'Evanston', 42.0487, -87.6817],
      ['Oak Park Public Library (Main)', 'Oak Park', 41.8887, -87.7972],
      ['Skokie Public Library', 'Skokie', 42.0264, -87.7573],
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

describe('Greater Chicagoland 5-County Containment & Exclusions', () => {
  it('accepts venues across all five Chicagoland counties (Cook, DuPage, Lake, Will, Kane)', () => {
    const venuesIn5Counties = [
      { name: 'Center on Halsted', locality: 'Chicago', region: 'IL', countryCode: 'US', lat: 41.9482, lng: -87.6495 },
      { name: 'Naper Settlement', locality: 'Naperville', region: 'IL', countryCode: 'US', lat: 41.7686, lng: -88.1478 },
      { name: 'Genesee Theatre', locality: 'Waukegan', region: 'IL', countryCode: 'US', lat: 42.3636, lng: -87.8348 },
      { name: 'Rialto Square Theatre', locality: 'Joliet', region: 'IL', countryCode: 'US', lat: 41.5250, lng: -88.0817 },
      { name: 'Paramount Theatre', locality: 'Aurora', region: 'IL', countryCode: 'US', lat: 41.7606, lng: -88.3142 },
    ];
    for (const v of venuesIn5Counties) {
      expect(serviceRegionForLocation(v)?.id).toBe('chicago');
    }
  });

  it('rejects venues outside the 5-county Greater Chicagoland footprint', () => {
    // Rockford (Winnebago County)
    const rockford = {
      name: 'Coronado Performing Arts Center',
      address: '314 N Main St, Rockford, IL 61101',
      locality: 'Rockford',
      region: 'IL',
      countryCode: 'US',
      lat: 42.2725,
      lng: -89.0925,
    };
    expect(serviceRegionForLocation(rockford)).toBeNull();

    // Kankakee (Kankakee County)
    const kankakee = {
      name: 'Kankakee County Museum',
      address: '801 S 8th Ave, Kankakee, IL 60901',
      locality: 'Kankakee',
      region: 'IL',
      countryCode: 'US',
      lat: 41.1118,
      lng: -87.8732,
    };
    expect(serviceRegionForLocation(kankakee)).toBeNull();

    // Kenosha (Wisconsin)
    const kenosha = {
      name: 'Kenosha Public Museum',
      address: '5500 1st Ave, Kenosha, WI 53140',
      locality: 'Kenosha',
      region: 'WI',
      countryCode: 'US',
      lat: 42.5835,
      lng: -87.8170,
    };
    expect(serviceRegionForLocation(kenosha)).toBeNull();

    // Gary (Lake County, Indiana)
    const gary = {
      name: 'West Beach Bathhouse',
      address: '376 N County Line Rd, Gary, IN 46403',
      locality: 'Gary',
      region: 'IN',
      countryCode: 'US',
      lat: 41.5934,
      lng: -87.3464,
    };
    expect(serviceRegionForLocation(gary)).toBeNull();
  });
});

describe('Northalsted & Andersonville LGBTQ+ Cultural Spine Feeds', () => {
  it('maps Center on Halsted, Gerber/Hart, Merlo Library, Legacy Walk, and Women & Children First', () => {
    const lgbtqAnchors = [
      ['Center on Halsted Community & Cultural Programs', 'Center on Halsted', 41.9488, -87.6495],
      ['Gerber/Hart Library & Archives Exhibits and Book Clubs', 'Gerber/Hart Library and Archives', 42.0006, -87.6722],
      ['The Legacy Project: Northalsted LGBTQ+ History Tours', 'The Legacy Walk (Northalsted Cultural Spine)', 41.9482, -87.6495],
      ['Women & Children First Author Readings & Conversations', 'Women & Children First Bookstore', 41.9772, -87.6681],
      ['CPL Merlo Branch Library (Lakeview)', 'CPL Merlo Branch Library', 41.9398, -87.6457],
    ];
    for (const [sourceName, venueName, lat, lng] of lgbtqAnchors) {
      const result = fixtureFor(sourceName);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      for (const record of result.records) {
        expect(record.venue).toBe(venueName);
        expect(record.lat).toBeCloseTo(lat, 2);
        expect(record.lng).toBeCloseTo(lng, 2);
        expect(serviceRegionForLocation(record)?.id).toBe('chicago');
      }
    }
  });
});

describe('Outer Chicagoland 4-County Flagship Library Hub Feeds', () => {
  it('maps Naperville, Waukegan, Joliet, and Aurora flagship library hubs', () => {
    const countyHubs = [
      ['Naperville Public Library (Nichols Hub)', 'Naperville Public Library (Nichols Library)', 'Naperville', 41.7686, -88.1478],
      ['Waukegan Public Library (Main Hub)', 'Waukegan Public Library (Main)', 'Waukegan', 42.3636, -87.8348],
      ['Joliet Public Library (Ottawa Street Hub)', 'Joliet Public Library (Ottawa Street Branch)', 'Joliet', 41.5250, -88.0817],
      ['Aurora Public Library District (Santori Hub)', 'Aurora Public Library District (Santori Library)', 'Aurora', 41.7606, -88.3142],
    ];
    for (const [sourceName, venueName, locality, lat, lng] of countyHubs) {
      const result = fixtureFor(sourceName);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      for (const record of result.records) {
        expect(record.venue).toBe(venueName);
        expect(record.locality).toBe(locality);
        expect(record.lat).toBeCloseTo(lat, 2);
        expect(record.lng).toBeCloseTo(lng, 2);
        expect(serviceRegionForLocation(record)?.id).toBe('chicago');
      }
    }
  });
});
