const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SOURCES } = require('../sources');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const quarantine = require('../../../data/discovery/atlanta/source-candidates.json');
const index = require('../../../docs/sources/2026-10-31-atlanta-stream-index.json');

it('preserves all 60 candidates without registering fabricated event supply', () => {
  expect(quarantine.candidates).toHaveLength(60);
  expect(new Set(quarantine.candidates.map(c => c.id)).size).toBe(60);
  expect(validateRegistries(feeds, venues)).toEqual([]);
  for (const candidate of quarantine.candidates) {
    expect(candidate.verificationStatus).toBe('unverified');
    expect(feeds.some(feed => feed.id === candidate.id)).toBe(false);
    expect(SOURCES.some(source => source.sourceName === candidate.proposedFeed.name)).toBe(false);
    expect(candidate.proposedFeed.schedule).toBeUndefined();
  }
  expect(SOURCES.some(source => source.sourceName.toLowerCase() === 'ticketmaster')).toBe(true);
  expect(SOURCES.length).toBeGreaterThan(60);
});

it('retains original discovery IDs while separating candidates from generated search ideas', () => {
  expect(index.streams).toHaveLength(365);
  expect(new Set(index.streams.map(s => s.id)).size).toBe(365);
  expect(index.streams.filter(s => s.status === 'unverified-candidate')).toHaveLength(60);
  expect(index.streams.filter(s => s.status === 'unverified-search-idea')).toHaveLength(305);
  for (const stream of index.streams) {
    expect(stream.verifiedOn).toBeNull();
    expect(stream.endpointType).toBeNull();
    if (stream.status === 'unverified-search-idea') {
      expect(stream.candidateUrl).toBeNull();
      expect(stream.publisher).toBeNull();
      expect(stream.searchQuery).toContain(stream.municipality);
    }
  }
});

it.each([
  ['Atlanta', 33.7573, -84.3892, 'atlanta'],
  ['Decatur', 33.7748, -84.2963, 'atlanta'],
  ['Marietta', 33.9526, -84.5499, 'atlanta'],
  ['Lawrenceville', 33.9564, -83.9882, 'atlanta'],
  ['Jonesboro', 33.5218, -84.3541, 'atlanta'],
  ['Conyers', 33.6676, -84.0177, null],
  ['McDonough', 33.4473, -84.1469, null],
])('contains only the target county geometry for %s', (locality, lat, lng, expected) => {
  // An accepted locality forces negative points to be rejected by geometry, not just the allowlist.
  expect(serviceRegionForLocation({ locality: expected ? locality : 'Atlanta', lat, lng, region: 'GA', countryCode: 'US' })?.id ?? null).toBe(expected);
});

it('keeps both inventory generators read-only on repeated runs', () => {
  const root = path.resolve(__dirname, '../../..');
  const files = ['data/feeds.json', 'data/venues.json', 'checkpoint.jsonl', 'shared_sources.csv', 'vectors.csv', 'docs/sources/2026-10-31-atlanta-stream-index.json'];
  const before = files.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
  for (let run = 0; run < 2; run++) {
    for (const script of ['generate-atlanta-launch.mjs', 'append-atlanta-checkpoints.mjs']) {
      execFileSync(process.execPath, [path.join(root, 'scripts/pipeline', script)], { cwd: root });
    }
  }
  expect(files.map(file => fs.readFileSync(path.join(root, file), 'utf8'))).toEqual(before);
});

it('keeps accepted Vermont rows and appended Atlanta rows as distinct CSV records', () => {
  const root = path.resolve(__dirname, '../../..');
  const csvRows = file => fs.readFileSync(path.join(root, file), 'utf8').trimEnd().split(/\r?\n/)
    // These research tables use quoted commas and doubled quotes, with no multiline fields.
    .map(line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const shared = csvRows('shared_sources.csv');
  const vectors = csvRows('vectors.csv');
  expect(shared[0]).toHaveLength(12);
  expect(vectors[0]).toHaveLength(18);
  for (const row of shared) expect(row).toHaveLength(12);
  for (const row of vectors) expect(row).toHaveLength(18);
  expect(shared.filter(row => row[0] === 'vermont-humanities')).toHaveLength(1);
  expect(shared.filter(row => row[0] === 'afpls-system')).toHaveLength(1);
  expect(vectors.filter(row => row[0] === 'Winooski' && row[1] === 'Chittenden')).toHaveLength(4);
  expect(vectors.filter(row => row[0] === 'Atlanta' && row[1] === 'Fulton')).toHaveLength(1);
});
