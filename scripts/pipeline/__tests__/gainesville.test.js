const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { serviceRegionForLocation } = require('../service-regions');
const { validateRegistries } = require('../registry-validation');

const NOW = Date.parse('2026-10-17T20:00:00Z');
const local = feeds.filter(feed => feed.serviceRegion === 'gainesville');

it('pins the verified Gainesville feeds and their region', () => {
  expect(local.map(feed => [feed.id, feed.kind])).toEqual([['uf-libraries-events', 'ics'], ['haile-farmers-market', 'schedule'], ['alachua-trick-or-treat-on-main', 'schedule']]);
  expect(validateRegistries(feeds, venues)).toEqual([]);
});

it('maps every fixture event to a registered Gainesville venue', () => {
  for (const feed of local) {
    const source = SOURCES.find(s => s.sourceName === feed.name);
    expect(source).toBeDefined();
    const result = readSourceFixture(source, undefined, { now: NOW });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    expect(result.unmapped).toEqual({});
    for (const record of result.records) {
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('gainesville');
    }
  }
});

it('keeps every venue inside the Gainesville box tagged FL and resolving to gainesville', () => {
  const box = venues.filter(v => v.lat >= 29.4 && v.lat <= 29.92 && v.lng >= -82.72 && v.lng <= -82.02);
  expect(box.length).toBeGreaterThan(0);
  for (const venue of box) {
    expect(venue.region).toBe('FL');
    expect(serviceRegionForLocation({ ...venue, countryCode: venue.countryCode ?? 'US' })?.id).toBe('gainesville');
  }
});
