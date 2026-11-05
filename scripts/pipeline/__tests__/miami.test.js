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
const localFeeds = feeds.filter(feed => feed.serviceRegion === 'miami');
const names = new Set(localFeeds.map(feed => feed.name));
const sources = SOURCES.filter(source => names.has(source.sourceName));
const adapter = name => sources.find(source => source.sourceName === name);

it('registers 51 distinct, validated Miami publishers with real representative fixtures and honest public venues', () => {
  expect(sources).toHaveLength(51);
  expect(validateRegistries(feeds, venues)).toEqual([]);
  for (const source of sources) {
    const result = readSourceFixture(source, undefined, { now: NOW });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    expect(result.unmapped).toEqual({});
    for (const record of result.records) {
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('miami');
      expect(record.sourceName).toBe(source.sourceName);
      expect(record.sourceUrl).toMatch(/^https:/);
    }
  }
});

it('keeps the market and museum schedule on both sides of the Eastern DST change', () => {
  const market = readSourceFixture(adapter('Coconut Grove Organic Market'), undefined, { now: NOW });
  expect(market.records.map(row => row.startsAtIso)).toEqual(expect.arrayContaining(['2026-10-17T14:00:00.000Z', '2026-11-07T15:00:00.000Z']));
  for (const row of market.records) {
    expect(row.rating).toBe('family');
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(9 * 3_600_000);
  }

  const pamm = readSourceFixture(adapter('Pérez Art Museum Miami'), undefined, { now: NOW });
  expect(pamm.records.map(row => row.startsAtIso)).toEqual(expect.arrayContaining(['2026-10-17T18:00:00.000Z', '2026-11-07T19:00:00.000Z']));
  for (const row of pamm.records) {
    expect(row.rating).toBe('general');
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(1.5 * 3_600_000);
  }

  const library = readSourceFixture(adapter('Miami-Dade Public Library Main Library'), undefined, { now: NOW });
  expect(library.records.length).toBe(3);
  expect(library.records.map(row => row.startsAtIso)).toContain('2026-10-16T14:00:00.000Z');
});

it('verifies bounding envelope and municipality containment for Miami-Dade County', () => {
  const record = { locality: 'Miami', region: 'FL', countryCode: 'US' };
  expect(serviceRegionForLocation({ ...record, lat: 25.7753, lng: -80.1963 })?.id).toBe('miami');
  expect(serviceRegionForLocation({ ...record, locality: 'Miami Beach', lat: 25.7656, lng: -80.1325 })?.id).toBe('miami');
  expect(serviceRegionForLocation({ ...record, locality: 'Coral Gables', lat: 25.6792, lng: -80.2742 })?.id).toBe('miami');

  // Fort Lauderdale in Broward County (north of Miami-Dade bounds)
  expect(serviceRegionForLocation({ ...record, locality: 'Fort Lauderdale', lat: 26.1224, lng: -80.1373 })).toBeNull();
  // Key Largo in Monroe County (south of Miami-Dade bounds; contained in key-west)
  expect(serviceRegionForLocation({ ...record, locality: 'Key Largo', lat: 25.0865, lng: -80.4473 })?.id).toBe('key-west');
});

it('fails the standing schedule when publisher evidence disappears', () => {
  const market = localFeeds.find(feed => feed.id === 'miami-coconut-grove-organic-market');
  const text = fs.readFileSync(adapter(market.name).fixturePath, 'utf8');
  expect(missingEvidence(text, market.schedule.evidence)).toEqual([]);
  expect(() => adapter(market.name).parseFixture(text.replace('Saturday', 'Schedule removed'), { now: NOW })).toThrow('Published schedule');
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
  expect(buildLocalGenerated(result, new Date(NOW).toISOString(), 'miami')).toContain('npm run events:refresh:local -- --region miami');
});
