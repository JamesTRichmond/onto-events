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
const localFeeds = feeds.filter(feed => feed.serviceRegion === 'jacksonville');
const names = new Set(localFeeds.map(feed => feed.name));
const sources = SOURCES.filter(source => names.has(source.sourceName));
const adapter = name => sources.find(source => source.sourceName === name);

it('registers three distinct, validated publishers with real representative fixtures and honest public venues', () => {
  expect(sources).toHaveLength(3);
  expect(validateRegistries(feeds, venues)).toEqual([]);
  for (const source of sources) {
    const result = readSourceFixture(source, undefined, { now: NOW });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    expect(result.unmapped).toEqual({});
    for (const record of result.records) {
      expect(record.timezone).toBe('America/New_York');
      expect(serviceRegionForLocation(record)?.id).toBe('jacksonville');
      expect(record.sourceName).toBe(source.sourceName);
      expect(record.sourceUrl).toMatch(/^https:/);
    }
  }
});

it('keeps the venue index and weekday schedule on both sides of the Eastern DST change', () => {
  const fountain = readSourceFixture(adapter('Downtown Jacksonville Friendship Fountain'), undefined, { now: NOW });
  expect(fountain.records.map(row => row.startsAtIso)).toEqual(expect.arrayContaining(['2026-10-20T22:00:00.000Z', '2026-11-03T23:00:00.000Z']));
  expect(fountain.retireMissing).toBe(false);
  expect(fountain.records.find(row => /18\+/.test(row.title))?.rating).toBe('mature');
  const market = readSourceFixture(adapter('Riverside Arts Market'), undefined, { now: NOW });
  expect(market.records.map(row => row.startsAtIso)).toEqual(expect.arrayContaining(['2026-10-31T14:00:00.000Z', '2026-11-07T15:00:00.000Z']));
  for (const row of market.records) {
    expect(row.rating).toBe('family');
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(5 * 3_600_000);
  }
  const museum = readSourceFixture(adapter('Cummer Museum'), undefined, { now: NOW });
  expect(museum.records.find(row => /Storytime/.test(row.title))?.startsAtIso).toBe('2026-10-21T15:15:00.000Z');
  expect(museum.records.find(row => /Yoga/.test(row.title))?.startsAtIso).toBe('2026-11-01T16:00:00.000Z');
});

it('classifies complete access and age evidence before emitting short public facts', () => {
  const source = adapter('Cummer Museum');
  const raw = source.parseFixture(fs.readFileSync(source.fixturePath, 'utf8'), { now: NOW }).items[0];
  const normalize = description => source.normalize({ ...raw, description, displayDescription: 'Short public prose.' }, { now: NOW, skip: () => {} });
  expect(normalize('Public program. ' + 'Background. '.repeat(400) + ' Members-only event.')).toBeNull();
  expect(normalize('Online-only event on Zoom.')).toBeNull();
  const mature = normalize('Public event. ' + 'Background. '.repeat(400) + ' Ages 18+. Contact Private Contact at person@example.org or 904-555-1234.');
  expect(mature.rating).toBe('mature');
  expect(mature.title).toBe(raw.title);
  expect(mature.description).not.toMatch(/Private Contact|example\.org|904-555/);
  expect(mature.description).toContain('publisher');
});

it('checks the county polygon even when a neighboring point claims a Jacksonville locality', () => {
  const record = { locality: 'Jacksonville', region: 'FL', countryCode: 'US' };
  expect(serviceRegionForLocation({ ...record, lat: 30.3298, lng: -81.6589 })?.id).toBe('jacksonville');
  for (const [lat, lng] of [[30.1661, -81.7065], [30.2400, -81.3850], [30.3830, -81.9400]]) {
    expect(serviceRegionForLocation({ ...record, lat, lng })).toBeNull();
  }
  expect(serviceRegionForLocation({ ...record, lat: 30.3298, lng: -81.6589, locality: 'Ponte Vedra Beach' })).toBeNull();
});

it('fails the standing schedule when publisher evidence disappears and fetches no prohibited venue-calendar query URLs', async () => {
  const market = localFeeds.find(feed => feed.kind === 'schedule');
  const text = fs.readFileSync(adapter(market.name).fixturePath, 'utf8');
  expect(missingEvidence(text, market.schedule.evidence)).toEqual([]);
  expect(() => adapter(market.name).parseFixture(text.replace('Every Saturday', 'Schedule removed'), { now: NOW })).toThrow('Published schedule');
  const source = adapter('Downtown Jacksonville Friendship Fountain');
  const fixture = JSON.parse(fs.readFileSync(source.fixturePath, 'utf8'));
  const requested = [];
  await source.fetch({ now: NOW, fetchImpl: async url => {
    requested.push(url);
    return { ok: true, text: async () => fixture.index };
  } });
  expect(requested).toEqual(['https://dtjax.com/venue/friendship-fountain/']);
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
  expect(buildLocalGenerated(result, new Date(NOW).toISOString(), 'jacksonville')).toContain('npm run events:refresh:local -- --region jacksonville');
  expect(validateRegistries([{ ...localFeeds[0], omitContactDetails: 'yes' }], venues).length).toBeGreaterThan(0);
});
