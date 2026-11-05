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
const localFeeds = feeds.filter(feed => feed.serviceRegion === 'key-west');
const names = new Set(localFeeds.map(feed => feed.name));
const sources = SOURCES.filter(source => names.has(source.sourceName));
const adapter = name => sources.find(source => source.sourceName === name);

it('registers validated Key West publishers with real representative fixtures and honest public venues', () => {
  expect(sources.length).toBeGreaterThanOrEqual(3);
  expect(validateRegistries(feeds, venues)).toEqual([]);
  for (const source of sources) {
    const result = readSourceFixture(source, undefined, { now: NOW });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    expect(result.unmapped).toEqual({});
    for (const record of result.records) {
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('key-west');
      expect(record.sourceName).toBe(source.sourceName);
      expect(record.sourceUrl).toMatch(/^https:/);
    }
  }
});

it('keeps the market and studios schedule on both sides of the Eastern DST change', () => {
  const market = readSourceFixture(adapter('Truman Waterfront Farmers Market'), undefined, { now: NOW });
  expect(market.records.map(row => row.startsAtIso)).toEqual(
    expect.arrayContaining(['2026-10-15T18:00:00.000Z', '2026-11-05T19:00:00.000Z']),
  );
  for (const row of market.records) {
    expect(row.rating).toBe('family');
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(5 * 3_600_000);
  }

  const studios = readSourceFixture(adapter('The Studios of Key West'), undefined, { now: NOW });
  expect(studios.records.map(row => row.startsAtIso)).toEqual(
    expect.arrayContaining(['2026-10-17T17:00:00.000Z', '2026-11-07T18:00:00.000Z']),
  );
  for (const row of studios.records) {
    expect(row.rating).toBe('general');
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(3 * 3_600_000);
  }

  const library = readSourceFixture(adapter('Key West Public Library'), undefined, { now: NOW });
  expect(library.records.length).toBe(3);
  expect(library.records.map(row => row.startsAtIso)).toContain('2026-10-16T14:00:00.000Z');
});

it('verifies bounding envelope and municipality containment for Monroe County and the Florida Keys', () => {
  const record = { locality: 'Key West', region: 'FL', countryCode: 'US' };
  expect(serviceRegionForLocation({ ...record, lat: 24.5574, lng: -81.7997 })?.id).toBe('key-west');
  expect(serviceRegionForLocation({ ...record, locality: 'Stock Island', lat: 24.5683, lng: -81.7412 })?.id).toBe('key-west');
  expect(serviceRegionForLocation({ ...record, locality: 'Marathon', lat: 24.7208, lng: -81.0435 })?.id).toBe('key-west');
  expect(serviceRegionForLocation({ ...record, locality: 'Islamorada', lat: 24.9243, lng: -80.6278 })?.id).toBe('key-west');
  expect(serviceRegionForLocation({ ...record, locality: 'Key Largo', lat: 25.0865, lng: -80.4473 })?.id).toBe('key-west');

  // Fort Lauderdale in Broward County (north of bounds)
  expect(serviceRegionForLocation({ ...record, locality: 'Fort Lauderdale', lat: 26.1224, lng: -80.1373 })).toBeNull();
  // Downtown Miami in Miami-Dade (north of bounds)
  expect(serviceRegionForLocation({ ...record, locality: 'Miami', lat: 25.7753, lng: -80.1963 })?.id).toBe('miami');
});

it('fails the standing schedule when publisher evidence disappears', () => {
  const market = localFeeds.find(feed => feed.id === 'key-west-truman-market');
  const text = fs.readFileSync(adapter(market.name).fixturePath, 'utf8');
  expect(missingEvidence(text, market.schedule.evidence)).toEqual([]);
  expect(() => adapter(market.name).parseFixture(text.replace('Thursday', 'Schedule cancelled'), { now: NOW })).toThrow('Published schedule');
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
  expect(buildLocalGenerated(result, new Date(NOW).toISOString(), 'key-west')).toContain('npm run events:refresh:local -- --region key-west');
});

it('verifies the 100+ vetted sources expansion ledger for Monroe County and the Florida Keys', () => {
  const ledger = require('../../../docs/sources/2026-10-15-key-west-leads.json');
  expect(ledger.leads.length).toBeGreaterThanOrEqual(100);
  expect(ledger.serviceRegion).toBe('key-west');
  expect(ledger.summary.monroeCountyContained).toBe(true);
  for (const lead of ledger.leads) {
    expect(lead.id).toBeTruthy();
    expect(lead.publisher).toBeTruthy();
    expect(lead.evidence.length).toBeGreaterThan(0);
    expect(lead.status).toBe('onboarded');
  }
});


it('resolves the two Key Largo parks inside the Miami/Key West bounds overlap to key-west', () => {
  for (const name of ['John Pennekamp Coral Reef State Park', 'Dagny Johnson Key Largo Hammock Botanical State Park']) {
    const venue = venues.find(v => v.name === name);
    expect(venue).toBeDefined();
    expect(serviceRegionForLocation({ ...venue, countryCode: venue.countryCode ?? 'US' })?.id).toBe('key-west');
  }
});
