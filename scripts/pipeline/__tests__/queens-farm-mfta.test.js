const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { validateRegistries } = require('../registry-validation');
const { calendarAdapters } = require('../sources');
const { readSourceFixture } = require('../run-source');
const path = require('node:path');

const now = Date.parse('2026-10-18T06:00:00Z');

function run(id, fixturePath) {
  const feed = feeds.find((entry) => entry.id === id);
  const [adapter] = calendarAdapters([feed], venues);
  return readSourceFixture(adapter, fixturePath, { now });
}

it('accepts the farm and Materials for the Arts calendars at their published points', () => {
  expect(validateRegistries(feeds, venues)).toEqual([]);
  const farm = run('queensfarm-org', path.resolve(
    __dirname, '../fixtures/tribe/queens-county-farm-museum.json',
  ));
  const mfta = run('materials-for-the-arts');
  expect(farm.records).toHaveLength(31);
  expect(mfta.records).toHaveLength(4);
  expect(farm.records.find((record) => record.title === 'Halloween on the Farm')).toMatchObject({
    venue: 'Queens County Farm Museum',
    timezone: 'America/New_York',
  });
  expect(mfta.records.every((record) => record.venue === 'Materials for the Arts' && record.timezone === 'America/New_York')).toBe(true);
  expect(farm.records.every((record) => record.venue === 'Queens County Farm Museum')).toBe(true);
});

it('keeps the upstream farm capture mapped under the shared source identity', () => {
  const result = run('queensfarm-org');
  expect(result.records.length).toBeGreaterThan(0);
  expect(result.records.every((record) => record.sourceName === 'Queens County Farm Museum')).toBe(true);
  expect(result.unmapped).toEqual({});
  expect(result.rejects).toEqual([]);
});
