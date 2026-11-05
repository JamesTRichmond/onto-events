const fs = require('node:fs');
const { calendarAdapters, SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');

const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

describe('Royalton & Woodstock Pipeline Sources & Venues', () => {
  it('validates entire feeds and venues registries without errors', () => {
    const errors = validateRegistries(feeds, venues);
    expect(errors).toEqual([]);
  });

  it('contains verified physical venues for the Royalton-Woodstock corridor contained in vermont-corridor', () => {
    const corridorVenues = [
      'Norman Williams Public Library',
      'Royalton Memorial Library',
      'Billings Farm & Museum',
      'Marsh-Billings-Rockefeller National Historical Park',
      'Mount Tom & Faulkner Park',
      'Woodstock Town Hall Theatre (Pentangle Arts)',
      'South Royalton Town Green & Bandstand',
      'White River Public Access & Stearns Park',
      'ArtisTree Community Arts Center',
      'Silver Lake State Park',
      'Bethel Public Library',
      'Baxter Memorial Library',
      'VINS Nature Center',
    ];

    for (const venueName of corridorVenues) {
      const venue = venues.find((v) => v.name === venueName);
      expect(venue).toBeDefined();
      expect(venue.locality).toBeTruthy();
      expect(venue.region).toBe('VT');
      expect(venue.countryCode ?? 'US').toBe('US');
      expect(venue.lat).toBeGreaterThan(43.5);
      expect(venue.lat).toBeLessThan(44.0);
      expect(venue.lng).toBeGreaterThan(-72.7);
      expect(venue.lng).toBeLessThan(-72.3);

      const matchedRegion = serviceRegionForLocation(venue);
      expect(matchedRegion).toBeDefined();
      expect(matchedRegion?.id).toBe('vermont-corridor');
    }
  });

  it('parses Royalton Memorial Library ICS fixture deterministically', () => {
    const feed = feeds.find((f) => f.id === 'royalton-memorial-library');
    expect(feed).toBeDefined();

    const [adapter] = calendarAdapters([feed], venues);
    expect(adapter).toBeDefined();

    const now = Date.parse('2026-10-31T18:00:00Z');
    const result = readSourceFixture(adapter, feed.fixturePath, { now });
    expect(result.records.length).toBeGreaterThanOrEqual(2);
    expect(result.rejectedCount).toBe(0);

    const robotics = result.records.find((r) => r.title.includes('Robotics'));
    expect(robotics).toBeDefined();
    expect(robotics.venue).toBe('Royalton Memorial Library');
    expect(robotics.locality).toBe('Royalton');
    expect(robotics.region).toBe('VT');
    expect(robotics.timezone).toBe('America/New_York');
  });

  it('parses Pentangle Arts ICS fixture with valid cinema and music events', () => {
    const feed = feeds.find((f) => f.id === 'pentangle-arts');
    expect(feed).toBeDefined();

    const [adapter] = calendarAdapters([feed], venues);
    expect(adapter).toBeDefined();

    const now = Date.parse('2026-10-31T18:00:00Z');
    const result = readSourceFixture(adapter, feed.fixturePath, { now });
    expect(result.records.length).toBeGreaterThanOrEqual(2);
    expect(result.rejectedCount).toBe(0);

    const film = result.records.find((r) => r.title.includes('Documentary'));
    expect(film).toBeDefined();
    expect(film.venue).toBe('Woodstock Town Hall Theatre (Pentangle Arts)');
    expect(film.locality).toBe('Woodstock');
    expect(film.region).toBe('VT');
  });

  it('parses Billings Farm & Museum fixture cleanly', () => {
    const feed = feeds.find((f) => f.id === 'billings-farm-and-museum');
    expect(feed).toBeDefined();

    const [adapter] = calendarAdapters([feed], venues);
    expect(adapter).toBeDefined();

    const now = Date.parse('2026-10-31T18:00:00Z');
    const result = readSourceFixture(adapter, feed.fixturePath, { now });
    expect(result.records.length).toBeGreaterThanOrEqual(1);

    const milking = result.records[0];
    expect(milking.venue).toBe('Billings Farm & Museum');
    expect(milking.locality).toBe('Woodstock');
    expect(milking.rating).toBe('family');
  });

  it('maintains Eastern Time civil clock daylight saving invariance across November transition', () => {
    // 2026 Fall-back occurs on Sunday, Nov 1, 2026 at 02:00 EDT -> EST
    const preDST = '2026-10-31T20:00:00.000Z'; // 4:00 PM EDT (UTC-4)
    const postDST = '2026-11-02T21:00:00.000Z'; // 4:00 PM EST (UTC-5)

    const formatHour = (iso) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(iso));

    expect(formatHour(preDST)).toBe('16');
    expect(formatHour(postDST)).toBe('16');
  });
});
