// node scripts/pipeline/dry-run-proposed.js [out.json]
// Runs every staged calendar fixture through the real adapter offline and writes
// the per-source evidence the discovery inventory cites. No network, no database.
const fs = require('node:fs');
const liveVenues = require('../../data/venues.json');
const proposedFeeds = require('../../docs/sources/proposals/feeds.proposed.json');
const proposedVenues = require('../../docs/sources/proposals/venues.proposed.json');
const { calendarAdapters } = require('./sources');
const { readSourceFixture } = require('./run-source');

const now = Date.parse(process.env.ONTO_FIXTURE_NOW ?? '2026-09-05T00:00:00Z');
const count = (items, key) => items.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] ?? 0) + 1 }), {});
const sources = calendarAdapters(proposedFeeds, [...liveVenues, ...proposedVenues]).map((adapter, index) => {
  const feed = proposedFeeds[index];
  const result = readSourceFixture(adapter, undefined, { now });
  return {
    id: feed.id, name: feed.name, fixturePath: feed.fixturePath, rawCount: result.rawCount,
    normalizedCount: result.normalizedCount, validCount: result.validCount, rejectedCount: result.rejectedCount,
    recordCount: result.records.length, skipped: result.skipped, rejects: result.rejects.map((r) => r.errors),
    ratings: count(result.records, 'rating'), categories: count(result.records, 'category'),
    venues: count(result.records, 'venue'), sample: result.records.slice(0, 3).map((r) => `${r.startsAtIso} ${r.title}`),
  };
});
const report = { evidence: 'fixture', clock: new Date(now).toISOString(), sources,
  totals: { sources: sources.length, records: sources.reduce((n, s) => n + s.recordCount, 0) } };
const out = process.argv[2];
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(out ? report.totals : report, null, 2));
