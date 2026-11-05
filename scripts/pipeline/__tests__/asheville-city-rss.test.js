const fs = require('node:fs');
const path = require('node:path');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { createRssAdapter, parseFeed } = require('../adapters/rss');
const { validateRegistries } = require('../registry-validation');
const { readSourceFixture, fetchSourceRecords } = require('../run-source');
const { SOURCES } = require('../sources');

const now = Date.parse('2026-10-18T00:00:00Z');

it('preserves the City of Asheville candidate and its verified pubDate event starts', () => {
  const feed = feeds.find((entry) => entry.id === 'asheville-city-events');
  expect(feed).toMatchObject({
    kind: 'rss',
    sourceKind: 'community',
    serviceRegion: 'asheville',
    timezone: 'America/New_York',
    url: 'https://www.ashevillenc.gov/events/feed/',
    eventDateField: 'pubDate',
    fixturePath: 'scripts/pipeline/fixtures/rss/asheville-city-events.xml',
  });
  expect(validateRegistries(feeds, venues)).toEqual([]);
  const xml = fs.readFileSync(path.join(__dirname, '../../..', feed.fixturePath), 'utf8');
  const dated = parseFeed(xml, feed, now);
  expect(dated.items.map((item) => [item.title, item.start])).toEqual([
    ['Historic Resources Commission Executive Committee (Virtual)', '2026-10-20T13:00:00.000Z'],
    ['Ribbon cutting for the Broadway Public Safety Station Public Art project', '2026-10-20T21:00:00.000Z'],
    ['Burton St Community Association Monthly Meeting', '2026-10-20T22:00:00.000Z'],
  ]);
  expect(dated.items.every((item) => item.location === '')).toBe(true);
  const undated = parseFeed(xml, { ...feed, eventDateField: undefined }, now);
  expect(undated.items).toEqual([]);
  expect(undated.diagnostics).toEqual({ 'missing unambiguous event date': 3 });
});

it('demonstrates why dated RSS items alone cannot activate the source', () => {
  const feed = feeds.find((entry) => entry.id === 'asheville-city-events');
  // Bypass registration quarantine only to exercise the real parser and
  // normalizer. Keep the original publisher capture: do not invent locations.
  const result = readSourceFixture(createRssAdapter(feed, venues), undefined, { now });
  expect(result).toMatchObject({
    rawCount: 3,
    records: [],
    normalizedCount: 0,
    rejectedCount: 0,
    skipped: { 'missing location': 3 },
    truncated: true,
    retireMissing: false,
  });
});

it('quarantines the incomplete enrollment in fixture and live-fetch modes', async () => {
  const feed = feeds.find((entry) => entry.id === 'asheville-city-events');
  expect(feed.pausedReason).toBe('RSS items have no usable location; verified publisher-page venue resolution and a nonempty canonical fixture are required before activation (PR #387).');
  const adapter = SOURCES.find((source) => source.sourceName === feed.name);
  expect(adapter.sourceKind).toBe('community');
  const expected = {
    records: [], rawCount: 0, normalizedCount: 0, rejectedCount: 0,
    truncated: true, retireMissing: false, skipReason: `paused: ${feed.pausedReason}`,
  };
  expect(readSourceFixture(adapter, undefined, { now })).toMatchObject(expected);
  const politeFetch = jest.fn(() => { throw new Error('Paused source must never fetch'); });
  expect(await fetchSourceRecords(adapter, { now, politeFetch, overrides: {} })).toMatchObject(expected);
  expect(politeFetch).not.toHaveBeenCalled();
});
