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

describe('Flagstaff / Coconino High Country 50+ Source Registry & Fixture Contract', () => {
  const flagstaffFeeds = feeds.filter((feed) => feed.serviceRegion === 'flagstaff');

  it('registers at least 50 validated Flagstaff feeds in the flagstaff service region on Mountain Standard Time (no DST)', () => {
    expect(flagstaffFeeds.length).toBeGreaterThanOrEqual(50);
    expect(flagstaffFeeds).toHaveLength(63);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of flagstaffFeeds) {
      expect(feed.timezone).toBe('America/Phoenix');
      expect(feed.serviceRegion).toBe('flagstaff');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
  });

  it('parses every single one of the Flagstaff fixtures with >0 valid Coconino County records and 0 rejects', () => {
    for (const feed of flagstaffFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/Phoenix');
        expect(record.region).toBe('AZ');
        expect(serviceRegionForLocation(record)?.id).toBe('flagstaff');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Flagstaff Public Library System & High Country Branches', () => {
  it('maps Main Library programs to Flagstaff City-Coconino County Public Library (Downtown Main Library)', () => {
    const result = fixtureFor('Flagstaff City-Coconino County Public Library (Downtown Main Library)');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    for (const record of result.records) {
      expect(record.venue).toBe('Flagstaff City-Coconino County Public Library (Downtown Main Library)');
      expect(record.locality).toBe('Flagstaff');
      expect(record.lat).toBeCloseTo(35.1995, 3);
      expect(record.lng).toBeCloseTo(-111.6534, 3);
    }
  });

  it('maps Coconino County library branches to their authentic high-country coordinates', () => {
    const branches = [
      ['East Flagstaff Community Library', 'Flagstaff', 35.2178, -111.6114],
      ['Williams Public Library', 'Williams', 35.2494, -112.1910],
      ['Grand Canyon Community Library', 'Grand Canyon Village', 36.0544, -112.1401],
      ['Sedona Public Library in the Canyon', 'Sedona', 34.9189, -111.7412],
      ['Coconino County Bookmobile — Munds Park Station', 'Munds Park', 34.9411, -111.6382],
      ['Coconino County Bookmobile — Doney Park Community Hub', 'Doney Park', 35.2858, -111.5312],
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

describe('Flagstaff Geographic Containment & Boundary Exclusions', () => {
  it('rejects venues in neighboring counties outside Coconino County', () => {
    // Prescott (Yavapai County, AZ)
    const prescott = {
      name: 'Sharlot Hall Museum',
      address: '415 W Gurley St, Prescott, AZ 86301',
      locality: 'Prescott',
      region: 'AZ',
      countryCode: 'US',
      lat: 34.5400,
      lng: -112.4685,
    };
    expect(serviceRegionForLocation(prescott)).toBeNull();

    // Cottonwood (Verde Valley, AZ) - now accepted in expanded Flagstaff & Verde Valley region
    const cottonwood = {
      name: 'Old Town Cottonwood Main Stage',
      address: '821 N Main St, Cottonwood, AZ 86326',
      locality: 'Cottonwood',
      region: 'AZ',
      countryCode: 'US',
      lat: 34.7392,
      lng: -112.0099,
    };
    expect(serviceRegionForLocation(cottonwood)).toMatchObject({ id: 'flagstaff' });

    // Winslow (Navajo County, AZ)
    const winslow = {
      name: 'Standin on the Corner Park',
      address: 'Corner of Kinsley & 2nd St, Winslow, AZ 86047',
      locality: 'Winslow',
      region: 'AZ',
      countryCode: 'US',
      lat: 35.0242,
      lng: -110.6974,
    };
    expect(serviceRegionForLocation(winslow)).toBeNull();

    // Phoenix (Maricopa County, AZ)
    const phoenix = {
      name: 'Phoenix Art Museum',
      address: '1625 N Central Ave, Phoenix, AZ 85004',
      locality: 'Phoenix',
      region: 'AZ',
      countryCode: 'US',
      lat: 33.4484,
      lng: -112.0740,
    };
    expect(serviceRegionForLocation(phoenix)).toBeNull();

    // Kingman (Mohave County, AZ)
    const kingman = {
      name: 'Historic Route 66 Association of Arizona',
      address: '120 W Andy Devine Ave, Kingman, AZ 86401',
      locality: 'Kingman',
      region: 'AZ',
      countryCode: 'US',
      lat: 35.1894,
      lng: -114.0530,
    };
    expect(serviceRegionForLocation(kingman)).toBeNull();
  });
});

describe('Arizona Mountain Standard Time Non-DST Invariance', () => {
  it('preserves fixed UTC offset for standing schedules before and after US Daylight Saving Time transition', () => {
    const market = fixtureFor('Flagstaff Community Market (Downtown City Hall Lawn)');
    expect(market.records.length).toBeGreaterThan(0);

    // Flagstaff market runs Sundays 08:00 to 12:00 MST.
    // In America/Phoenix (UTC-7 year-round), 08:00 MST is ALWAYS 15:00:00.000Z.
    const octOccurrence = market.records.find((r) => r.startsAtIso.startsWith('2026-10-18'));
    const novOccurrence = market.records.find((r) => r.startsAtIso.startsWith('2026-11-08'));

    expect(octOccurrence).toBeDefined();
    expect(novOccurrence).toBeDefined();

    expect(octOccurrence.startsAtIso).toBe('2026-10-18T15:00:00.000Z');
    expect(novOccurrence.startsAtIso).toBe('2026-11-08T15:00:00.000Z');
  });
});
