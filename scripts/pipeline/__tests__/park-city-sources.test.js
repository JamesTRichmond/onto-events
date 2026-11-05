const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { createIcsAdapter } = require('../adapters/ics');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const now = Date.parse('2026-10-01T15:00:00.000Z');

describe('Park City Feed Registries & Fixture Contract', () => {
  const parkCityFeedIds = [
    'park-city-library',
    'egyptian-theatre',
    'kimball-art-center',
    'swaner-ecocenter',
  ];
  const parkCityFeeds = feeds.filter((f) => parkCityFeedIds.includes(f.id));

  it('verifies all Park City anchor feeds in data/feeds.json', () => {
    expect(parkCityFeeds.length).toBe(4);
    for (const feed of parkCityFeeds) {
      expect(feed.serviceRegion).toBe('park-city');
      expect(feed.timezone).toBe('America/Denver');
      expect(feed.url).toMatch(/^https:\/\//);
      expect(feed.termsUrl).toMatch(/^https:\/\//);
      expect(feed.fixturePath).toBeDefined();
    }
    expect(validateRegistries(feeds, venues)).toEqual([]);
  });

  it.each([
    ['park-city-library', 'scripts/pipeline/fixtures/ics/park-city-library.ics'],
    ['egyptian-theatre', 'scripts/pipeline/fixtures/ics/egyptian-theatre.ics'],
    ['kimball-art-center', 'scripts/pipeline/fixtures/ics/kimball-art-center.ics'],
    ['swaner-ecocenter', 'scripts/pipeline/fixtures/ics/swaner-ecocenter.ics'],
  ])('parses fixture for %s with valid Park City records', (feedId, fixturePath) => {
    const feed = feeds.find((f) => f.id === feedId);
    expect(feed).toBeDefined();
    const adapter = createIcsAdapter(feed, venues);
    const fullPath = path.join(repoRoot, fixturePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const snapshot = adapter.parseFixture(content, { now });
    expect(snapshot.items.length).toBeGreaterThan(0);
    const records = snapshot.items.map((item) => adapter.normalize(item, { now })).filter(Boolean);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.region).toBe('UT');
      expect(record.timezone).toBe('America/Denver');
      expect(serviceRegionForLocation(record)?.id).toBe('park-city');
      expect(record.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});
