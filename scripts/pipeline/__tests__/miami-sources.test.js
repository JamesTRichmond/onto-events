const fs = require('node:fs');
const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const { missingEvidence } = require('../adapters/schedule');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Fixed evaluation clock matching source-trust.test.js.
const now = Date.parse('2026-10-15T20:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  if (!adapter) throw new Error(`Source not found: ${sourceName}`);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

describe('Miami 51-Source Registry & Fixture Contract', () => {
  const miamiFeeds = feeds.filter((feed) => feed.serviceRegion === 'miami');

  it('registers 51 validated Miami feeds in the miami service region on Eastern time', () => {
    expect(miamiFeeds).toHaveLength(51);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of miamiFeeds) {
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.serviceRegion).toBe('miami');
      expect(feed.url).toMatch(/^https:\/\//);
    }
  });

  it('parses every single one of the 51 Miami fixtures with >0 valid Miami-Dade County records and 0 rejects', () => {
    for (const feed of miamiFeeds) {
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
        expect(serviceRegionForLocation(record)?.id).toBe('miami');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Miami-Dade Public Library System (14 Branch Feeds)', () => {
  const mdplsFeeds = feeds.filter(
    (feed) => feed.serviceRegion === 'miami' && feed.kind === 'ics' && feed.name.includes('Library')
  );

  it('registers 14 distinct MDPLS library branches across Miami-Dade municipalities', () => {
    expect(mdplsFeeds).toHaveLength(14);
  });

  it('maps key branch library feeds to their authentic civic coordinates and venues', () => {
    const branches = [
      ['Miami-Dade Public Library Main Library', 'Miami', 25.7753, -80.1963],
      ['Miami Beach Regional Library', 'Miami Beach', 25.7981, -80.1315],
      ['Coral Gables Branch Library', 'Coral Gables', 25.7410, -80.2705],
      ['Coconut Grove Branch Library', 'Miami', 25.7275, -80.2415],
      ['Doral Branch Library', 'Doral', 25.8220, -80.3370],
      ['Homestead Branch Library', 'Homestead', 25.4740, -80.4735],
      ['Key Biscayne Branch Library', 'Key Biscayne', 25.6930, -80.1610],
      ['Pinecrest Branch Library', 'Pinecrest', 25.6660, -80.2880],
      ['Sunny Isles Beach Branch Library', 'Sunny Isles Beach', 25.9430, -80.1205],
      ['Hialeah Gardens Branch Library', 'Hialeah Gardens', 25.8970, -80.3710],
    ];

    for (const [name, locality, lat, lng] of branches) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      for (const record of result.records) {
        expect(record.venue).toBe(name);
        expect(record.locality).toBe(locality);
        expect(record.region).toBe('FL');
        expect(record.lat).toBeCloseTo(lat, 3);
        expect(record.lng).toBeCloseTo(lng, 3);
      }
    }
  });
});

describe('Miami Major Performing Arts & Theatres (7 Feeds)', () => {
  const performingArts = [
    'Adrienne Arsht Center for the Performing Arts',
    'New World Symphony',
    'Miami New Drama at Colony Theatre',
    "Actors' Playhouse at Miracle Theatre",
    'GableStage at the Biltmore',
    'Aventura Arts & Cultural Center',
    'Dennis C. Moss Cultural Arts Center',
  ];

  it('maps each performing arts institution to verified venues with real schedules', () => {
    for (const name of performingArts) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      for (const record of result.records) {
        expect(record.venue).toBeTruthy();
        expect(serviceRegionForLocation(record)?.id).toBe('miami');
      }
    }
  });
});

describe('Miami Museums & Cultural Institutions (12 Feeds)', () => {
  const museums = [
    'Pérez Art Museum Miami',
    'Frost Museum of Science',
    'HistoryMiami Museum',
    'Institute of Contemporary Art, Miami',
    'The Bass Museum of Art',
    'Museum of Contemporary Art North Miami',
    'Coral Gables Museum',
    'Jewish Museum of Florida-FIU',
    'Patricia & Phillip Frost Art Museum FIU',
    'The Wolfsonian–FIU',
    'Lowe Art Museum, University of Miami',
    'Wynwood Walls',
  ];

  it('maps all 12 museums with valid exhibitions, tours, and public programs', () => {
    for (const name of museums) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      for (const record of result.records) {
        expect(['general', 'family']).toContain(record.rating);
        expect(serviceRegionForLocation(record)?.id).toBe('miami');
      }
    }
  });
});

describe('Miami Public Gardens, Historic Estates & Nature Centers (9 Feeds)', () => {
  const greenSpaces = [
    'Fairchild Tropical Botanic Garden',
    'Pinecrest Gardens',
    'Deering Estate',
    'Vizcaya Museum & Gardens',
    'Fruit & Spice Park',
    'Crandon Park Nature Center',
    'Bill Baggs Cape Florida State Park',
    'The Kampong',
    'Miami Beach Botanical Garden',
  ];

  it('maps all 9 botanical, estate, and park institutions within Miami-Dade bounds', () => {
    for (const name of greenSpaces) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      for (const record of result.records) {
        expect(serviceRegionForLocation(record)?.id).toBe('miami');
        expect(record.region).toBe('FL');
      }
    }
  });
});

describe('Miami Community, Cinema & Cultural Centers (6 Feeds)', () => {
  const centers = [
    'Little Haiti Cultural Complex',
    'MDC Koubek Center',
    'Books & Books Coral Gables',
    'O Cinema South Beach',
    'Bill Cosford Cinema, University of Miami',
    'UM Frost School of Music',
  ];

  it('maps community centers, independent cinemas, and academic arts programs', () => {
    for (const name of centers) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.unmapped).toEqual({});
      for (const record of result.records) {
        expect(serviceRegionForLocation(record)?.id).toBe('miami');
      }
    }
  });
});

describe('Miami Farmers & Artisan Markets (3 Feeds)', () => {
  const markets = [
    'Coconut Grove Organic Market',
    'Lincoln Road Farmers Market',
    'Legion Park Farmers Market',
  ];

  it('maps outdoor recurring weekend community markets with family/general ratings', () => {
    for (const name of markets) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      for (const record of result.records) {
        expect(['family', 'general']).toContain(record.rating);
        expect(serviceRegionForLocation(record)?.id).toBe('miami');
      }
    }
  });
});

describe('Miami Regional Containment and Boundary Guard', () => {
  it('strictly contains Miami-Dade locations and rejects adjacent counties', () => {
    const base = { region: 'FL', countryCode: 'US' };

    // Valid Miami-Dade points
    expect(serviceRegionForLocation({ ...base, locality: 'Miami', lat: 25.7617, lng: -80.1918 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Miami Beach', lat: 25.7907, lng: -80.1300 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Coral Gables', lat: 25.7505, lng: -80.2575 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Hialeah', lat: 25.8576, lng: -80.2781 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Aventura', lat: 25.9565, lng: -80.1392 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Homestead', lat: 25.4687, lng: -80.4776 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Cutler Bay', lat: 25.5710, lng: -80.3665 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Key Biscayne', lat: 25.6925, lng: -80.1635 })?.id).toBe('miami');
    expect(serviceRegionForLocation({ ...base, locality: 'Sunny Isles Beach', lat: 25.9425, lng: -80.1245 })?.id).toBe('miami');

    // Reject Broward County (north)
    expect(serviceRegionForLocation({ ...base, locality: 'Fort Lauderdale', lat: 26.1224, lng: -80.1373 })).toBeNull();
    expect(serviceRegionForLocation({ ...base, locality: 'Hollywood', lat: 26.0112, lng: -80.1495 })).toBeNull();
    expect(serviceRegionForLocation({ ...base, locality: 'Hallandale Beach', lat: 25.9860, lng: -80.1440 })).toBeNull();

    // Monroe County (south / Florida Keys) is never Miami; it routes to key-west
    expect(serviceRegionForLocation({ ...base, locality: 'Key Largo', lat: 25.0865, lng: -80.4473 })?.id).toBe('key-west');
    expect(serviceRegionForLocation({ ...base, locality: 'Key West', lat: 24.5551, lng: -81.7800 })?.id).toBe('key-west');

    // Reject Palm Beach County
    expect(serviceRegionForLocation({ ...base, locality: 'Boca Raton', lat: 26.3683, lng: -80.1289 })).toBeNull();
  });
});
