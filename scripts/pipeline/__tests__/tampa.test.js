const fs = require('node:fs');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { serviceRegionForLocation } = require('../service-regions');
const { validateRegistries } = require('../registry-validation');
const { localSnapshot } = require('../local-snapshot');
const { missingEvidence } = require('../adapters/schedule');
const { buildLocalGenerated } = require('../../refresh-core');

const NOW = Date.parse('2026-10-15T20:00:00Z');
const localFeeds = feeds.filter(feed => feed.serviceRegion === 'tampa-bay');
const names = new Set(localFeeds.map(feed => feed.name));
const sources = SOURCES.filter(source => names.has(source.sourceName));
const adapter = name => sources.find(source => source.sourceName === name);

it('registers at least 100 distinct, validated Tampa Bay publishers with real representative fixtures and honest public venues', () => {
  expect(sources.length).toBeGreaterThanOrEqual(100);
  expect(validateRegistries(feeds, venues)).toEqual([]);
  for (const source of sources) {
    const result = readSourceFixture(source, undefined, { now: NOW });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    expect(result.unmapped).toEqual({});
    for (const record of result.records) {
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('tampa-bay');
      expect(record.sourceName).toBe(source.sourceName);
      expect(record.sourceUrl).toMatch(/^https:/);
    }
  }
});

it('keeps the market and museum schedule on both sides of the Eastern DST change', () => {
  const market = readSourceFixture(adapter('Ybor City Saturday Market'), undefined, { now: NOW });
  expect(market.records.map(row => row.startsAtIso)).toEqual(expect.arrayContaining(['2026-10-17T13:00:00.000Z', '2026-11-07T14:00:00.000Z']));
  for (const row of market.records) {
    expect(row.rating).toBe('family');
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(6 * 3_600_000);
  }

  const museum = readSourceFixture(adapter('Tampa Museum of Art'), undefined, { now: NOW });
  expect(museum.records.map(row => row.startsAtIso)).toEqual(expect.arrayContaining(['2026-10-17T17:00:00.000Z', '2026-11-07T18:00:00.000Z']));
  for (const row of museum.records) {
    expect(row.rating).toBe('family');
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(1.5 * 3_600_000);
  }

  const library = readSourceFixture(adapter('Hillsborough County Public Library Downtown'), undefined, { now: NOW });
  expect(library.records.length).toBe(3);
  expect(library.records.map(row => row.startsAtIso)).toContain('2026-10-16T14:00:00.000Z');
});

it('verifies bounding envelope and municipality containment for Tampa Bay', () => {
  const record = { locality: 'Tampa', region: 'FL', countryCode: 'US' };
  expect(serviceRegionForLocation({ ...record, lat: 27.9510, lng: -82.4632 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'St. Petersburg', lat: 27.7676, lng: -82.6403 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'Clearwater', lat: 27.9659, lng: -82.8001 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'St. Pete Beach', lat: 27.6942, lng: -82.7388 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'Indian Shores', lat: 27.8485, lng: -82.8462 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'Palm Harbor', lat: 28.0862, lng: -82.7681 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'Riverview', lat: 27.8685, lng: -82.3382 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'Bradenton', lat: 27.4989, lng: -82.5748 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'Lakeland', lat: 28.0395, lng: -81.9498 })?.id).toBe('tampa-bay');
  expect(serviceRegionForLocation({ ...record, locality: 'New Port Richey', lat: 28.2442, lng: -82.7193 })?.id).toBe('tampa-bay');

  // Sarasota in Sarasota County (south of Tampa Bay bounds)
  expect(serviceRegionForLocation({ ...record, locality: 'Sarasota', lat: 27.3364, lng: -82.5307 })).toBeNull();
  // Brooksville in Hernando County (north of Tampa Bay bounds)
  expect(serviceRegionForLocation({ ...record, locality: 'Brooksville', lat: 28.5553, lng: -82.3879 })).toBeNull();
  // Orlando in Orange County (east of Tampa Bay bounds)
  expect(serviceRegionForLocation({ ...record, locality: 'Orlando', lat: 28.5383, lng: -81.3792 })?.id).toBe('orlando');
});

it('fails the standing schedule when publisher evidence disappears', () => {
  const market = localFeeds.find(feed => feed.id === 'ybor-city-saturday-market');
  const text = fs.readFileSync(adapter(market.name).fixturePath, 'utf8');
  expect(missingEvidence(text, market.schedule.evidence)).toEqual([]);
  expect(() => adapter(market.name).parseFixture(text.replaceAll('Saturday', 'Schedule removed'), { now: NOW })).toThrow('Published schedule');
});

it('exports clean app records and gives regional files their correct refresh command', () => {
  const records = sources.flatMap(source => readSourceFixture(source, undefined, { now: NOW }).records);
  const result = localSnapshot(records, NOW);
  expect(result.length).toBeGreaterThan(0);
  for (const record of result) {
    expect(record).not.toHaveProperty('ratingBasis');
    expect(record).not.toHaveProperty('sourceKind');
    expect(record).not.toHaveProperty('venueKind');
  }
  expect(buildLocalGenerated(result, new Date(NOW).toISOString(), 'tampa-bay')).toContain('npm run events:refresh:local -- --region tampa-bay');
});
