jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const fs = require('node:fs');
const path = require('node:path');
const { SOURCES } = require('../sources');
const { createMyrecAdapter, parseDirectory, parseProgram, parseSchedule } = require('../adapters/myrec');
const { readSourceFixture, processSourceItems, fetchSourceRecords } = require('../run-source');
const { syncSources } = require('../sync-sources');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const productionFeeds = require('../../../data/feeds.json');
const productionVenues = require('../../../data/venues.json');
const batchDir = path.resolve(__dirname, '../../../docs/sources/vermont-round-two/batch-02-myrec');
const feeds = fs.existsSync(path.join(batchDir, 'feeds.json')) ? require(path.join(batchDir, 'feeds.json')) : [];
const venues = fs.existsSync(path.join(batchDir, 'venues.json')) ? require(path.join(batchDir, 'venues.json')) : [];
const resolvedVenues = [...productionVenues, ...venues.filter((venue) => !productionVenues.some((live) => live.name === venue.name))];
const now = Date.parse('2026-10-15T04:53:28.000Z');
const adapterFor = (id) => createMyrecAdapter(feeds.find((feed) => feed.id === id), resolvedVenues);
const read = (id) => readSourceFixture(adapterFor(id), undefined, { now });
const fixtureFor = (id) => JSON.parse(fs.readFileSync(adapterFor(id).fixturePath, 'utf8'));

it('registers only the reviewed public Hartford and Brandon subsets', () => {
  expect(feeds.map((feed) => feed.id)).toEqual(['hartford-recreation', 'brandon-recreation']);
  expect(validateRegistries(feeds, resolvedVenues)).toEqual([]);
  for (const proposal of feeds) {
    const active = productionFeeds.find((feed) => feed.id === proposal.id);
    expect(active).toBeDefined();
    const { notes: _proposalNotes, ...reviewed } = proposal;
    const { notes: _activeNotes, ...registered } = active;
    expect(registered).toEqual(reviewed);
    expect(SOURCES.filter((source) => source.sourceName === proposal.name)).toHaveLength(1);
    expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain(`- '${proposal.name}'`);
  }
  for (const venue of venues) expect(productionVenues.find((live) => live.name === venue.name)).toEqual(venue);
  for (const feed of feeds) {
    const result = read(feed.id);
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.skipped).toEqual({});
    expect(result.records.every((record) => record.timezone === 'America/New_York' && record.region === 'VT')).toBe(true);
    expect(result.records.every((record) => !/[<>@]/.test(record.description))).toBe(true);
    expect(result.records.every((record) => catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record))) !== null)).toBe(true);
  }
});

it('delivers real public skating dates through catalog rows and the app while preserving Eastern DST and honest fees', () => {
  const result = read('hartford-recreation');
  expect(result.diagnostics).toEqual({ 'excluded schedule dates': 1 });
  const skate = result.records.filter((record) => record.title === 'Public Skating');
  expect(skate).toHaveLength(20);
  expect(skate.find((record) => record.startsAtIso.slice(0, 10) === '2026-10-17')).toMatchObject({ startsAtIso: '2026-10-17T20:15:00.000Z', endsAtIso: '2026-10-17T21:45:00.000Z', venue: 'Wendell A. Barwood Arena' });
  expect(skate.find((record) => record.startsAtIso.slice(0, 10) === '2026-11-07')).toMatchObject({ startsAtIso: '2026-11-07T21:15:00.000Z' });
  expect(skate.every((record) => !record.eventFacts?.admission)).toBe(true);
  expect(result.records.some((record) => record.title.includes('Hockey') && record.startsAtIso.slice(0, 10) === '2026-10-16')).toBe(false);
  for (const record of result.records) expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).not.toBeNull();
});

it('maps actual Brandon pickup sessions to each public school and preserves date identity through time edits and cancellations', () => {
  const source = adapterFor('brandon-recreation');
  const fixture = fixtureFor('brandon-recreation');
  const feed = feeds.find((feed) => feed.id === 'brandon-recreation');
  const [program] = parseDirectory(fixture.pages[feed.url], feed);
  const [activity] = parseProgram(fixture.pages[program.url], program);
  const result = read('brandon-recreation');
  expect(result.records.some((record) => record.startsAtIso.slice(0, 10) === '2026-10-15')).toBe(false);
  expect(result.records.find((record) => record.startsAtIso.slice(0, 10) === '2026-10-20')).toMatchObject({ title: '2026 - Adult Pick-up Basketball', venue: 'Neshobe Elementary School Gymnasium', startsAtIso: '2026-10-20T23:00:00.000Z', category: 'sports' });
  expect(result.records.every((record) => ['Sun', 'Tue'].includes(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(new Date(record.startsAtIso))))).toBe(true);
  expect(result.diagnostics['outside reviewed program weekdays']).toBeGreaterThan(0);
  expect(result.records.find((record) => record.startsAtIso.slice(0, 10) === '2026-10-18')).toMatchObject({ venue: 'Otter Valley High School Gymnasium', startsAtIso: '2026-10-18T11:00:00.000Z' });
  const original = result.records[0];
  const changed = structuredClone(fixture);
  changed.pages[activity.url] = changed.pages[activity.url].replace('7:00 AM', '7:15 AM');
  const run = (body) => readSourceFixture({ ...source, parseFixture: (_, context) => source.parseFixture(JSON.stringify(body), context) }, undefined, { now });
  expect(run(changed).records[0]).toMatchObject({ id: original.id, startsAtIso: '2026-10-18T11:15:00.000Z' });
  changed.pages[program.url] = changed.pages[program.url].replace('<b>2026 - Adult Pick-up Basketball</b>', '<b>2026 - Adult Pick-up Basketball</b><b>* CANCELED</b>');
  const cancelled = run(changed).records[0];
  expect(cancelled).toMatchObject({ id: original.id, isCancelled: true });
  expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(cancelled)))).toBeNull();
  expect(parseSchedule(fixture.pages[activity.url], activity, feed, now).items.every((event) => event.eventFacts?.includesFood === undefined)).toBe(true);
});

it('excludes private, member-only and online-only variants without losing public registration programs', () => {
  const source = adapterFor('hartford-recreation');
  const snapshot = source.parseFixture(fs.readFileSync(source.fixturePath, 'utf8'), { now });
  const item = snapshot.items.find((item) => item.title === 'Public Skating');
  expect(processSourceItems(source, { items: [item] }, { now }).records).toHaveLength(1);
  for (const description of ['This event is private.', 'This event is members-only.', 'This event is online-only.']) {
    expect(processSourceItems(source, { items: [{ ...item, description }] }, { now }).records).toEqual([]);
  }
  expect(processSourceItems(source, { items: [{ ...item, location: 'Unregistered school, Stowe, VT' }] }, { now }).records).toEqual([]);
});

it('isolates a failing MyRec source before writes and leaves the healthy publisher deliverable in dry run', async () => {
  const broken = adapterFor('brandon-recreation');
  const healthy = adapterFor('hartford-recreation');
  const fixture = fixtureFor('hartford-recreation');
  const healthyRun = await fetchSourceRecords(healthy, { now, politeFetch: async (url) => ({ ok: true, text: async () => fixture.pages[url] }) });
  const clientFactory = jest.fn(() => { throw new Error('dry run must not construct a database client'); });
  const report = await syncSources({ sources: [{ ...broken, fetch: (context) => broken.fetch({ ...context, fetchImpl: async () => ({ ok: false, status: 503 }) }) }, { ...healthy, fetch: async () => healthy.parseFixture(JSON.stringify(fixture), { now }) }], now, dryRun: true, clientFactory, log: () => {}, logError: () => {} });
  expect(report.totals.failedSources).toBe(1);
  expect(report.summaries.find((summary) => summary.sourceName === healthy.sourceName)?.recordCount).toBe(healthyRun.validCount);
  expect(clientFactory).not.toHaveBeenCalled();
});

it('keeps the real conflicting Middlebury program out of candidates and fails its ambiguous public schedule', () => {
  expect(feeds.some((feed) => feed.id === 'middlebury-recreation')).toBe(false);
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/myrec/middlebury-public-programs.json'), 'utf8'));
  const feed = { id: 'middlebury-recreation', name: 'Middlebury Parks and Recreation', kind: 'myrec', sourceKind: 'community', timezone: 'America/New_York', serviceRegion: 'vermont-corridor', url: 'https://middleburyvt.myrec.com/info/activities/default.aspx?type=activities', programCategories: { 'Classes & Activities': 'sports' }, fixturePath: 'scripts/pipeline/fixtures/myrec/middlebury-public-programs.json' };
  const [program] = parseDirectory(fixture.pages[feed.url], feed);
  const [activity] = parseProgram(fixture.pages[program.url], program);
  expect(() => parseSchedule(fixture.pages[activity.url], activity, feed, now)).toThrow('Ambiguous MyRec session slot');
});

it('measures fixed-window candidate supply without counting disputed weekdays or duplicated enrollment options', () => {
  const hartford = read('hartford-recreation');
  const brandon = read('brandon-recreation');
  expect(hartford.records).toHaveLength(53);
  expect(brandon.records).toHaveLength(17);
  const count = (records, days) => records.filter((record) => !record.isCancelled && Date.parse(record.startsAtIso) >= now && Date.parse(record.startsAtIso) < now + days * 86400000).length;
  expect([count(hartford.records, 7), count(hartford.records, 30)]).toEqual([4, 24]);
  expect([count(brandon.records, 7), count(brandon.records, 30)]).toEqual([2, 8]);
  expect(new Set([...hartford.records, ...brandon.records].map((record) => record.id)).size).toBe(70);
});

it('honors explicit adult age ranges over generic all-ages sport descriptions', () => {
  const hartford = read('hartford-recreation').records;
  const pickleball = hartford.filter((record) => record.title === 'Tuesday Sessions #1');
  expect(pickleball).toHaveLength(6);
  expect(pickleball.every((record) => record.rating === 'mature' && record.description.includes('18y - 199y') && record.description.includes('Indoor Pickleball'))).toBe(true);
  expect(hartford.filter((record) => record.title === 'Indoor Ultimate Frisbee').every((record) => record.rating === 'mature')).toBe(true);
  expect(read('brandon-recreation').records.every((record) => record.rating === 'mature' && record.description.includes('18y - 99y')
    && catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record))).rating === 'mature')).toBe(true);
});
