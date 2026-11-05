jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const fs = require('node:fs');
const { SOURCES, selectSources, calendarAdapters } = require('../sources');
const { readSourceFixture, processSourceItems } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { eventLinks } = require('../adapters/jsonld');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const feeds = require('../../../docs/sources/vermont-round-two/feeds.proposed.json');
const venues = require('../../../docs/sources/vermont-round-two/venues.proposed.json');
const liveFeeds = require('../../../data/feeds.json');
const liveVenues = require('../../../data/venues.json');
const resolvedVenues = [...liveVenues, ...venues.filter((venue) => !liveVenues.some((live) => live.name === venue.name))];

const now = Date.parse('2026-10-14T23:21:00.062Z');
const lane = () => {
  const feed = feeds.find((value) => value.id === 'uvm-lane-series');
  expect(feed).toBeDefined();
  return calendarAdapters([feed], resolvedVenues)[0];
};

it('registers the reviewed public Lane Series inside the existing corridor', () => {
  expect(feeds.some((feed) => feed.id === 'uvm-lane-series')).toBe(true);
  expect(liveFeeds.some((feed) => feed.id === 'uvm-lane-series')).toBe(true);
  expect(validateRegistries(feeds, resolvedVenues)).toEqual([]);
  const result = readSourceFixture(lane(), undefined, { now });
  expect(result.rejectedCount).toBe(0);
  expect(result.records).toHaveLength(5);
  expect(result.retireMissing).toBe(false);
  expect(result.records.map((record) => record.startsAtIso)).toEqual([
    '2026-10-16T23:30:00.000Z', '2026-10-23T23:30:00.000Z',
    '2026-11-07T00:30:00.000Z', '2026-12-05T00:30:00.000Z', '2026-12-12T00:30:00.000Z',
  ]);
  for (const record of result.records) {
    expect(record).toMatchObject({ sourceName: 'UVM Lane Series', category: 'music', region: 'VT', locality: 'Burlington', timezone: 'America/New_York' });
    expect(record.endsAtIso).toBeUndefined();
    expect(record.id).toMatch(/^jsonld-uvm-lane-series-/);
    expect(record.title).not.toMatch(/Tesla|Fraser/);
  }
});

it('delivers real Lane Series occurrences through the catalog and app mapping', () => {
  const records = readSourceFixture(lane(), undefined, { now }).records;
  const activities = records.map((record) => catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record))));
  expect(activities).toHaveLength(5);
  expect(activities.every(Boolean)).toBe(true);
  expect(activities[0]).toMatchObject({ title: 'Trio Bohémo', venue: 'UVM Recital Hall', startsAtIso: '2026-10-16T23:30:00.000Z' });
  const cancelled = toSupabaseRow({ ...records[0], isCancelled: true });
  expect(catalogEventToActivity(mapCatalogEvent(cancelled))).toBeNull();
});

it('retains identity on cancellation and rejects private or off-corridor variants', () => {
  const adapter = lane();
  const snapshot = adapter.parseFixture(fs.readFileSync(adapter.fixturePath, 'utf8'), { now });
  const event = snapshot.items[0];
  const original = adapter.normalize(event, { now });
  expect(adapter.normalize({ ...event, cancelled: true }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  for (const change of [{ location: 'Online' }, { location: 'Unregistered Hall, Stowe, VT' }, { title: 'Students only rehearsal' }, { description: 'Private event for members only.' }]) {
    expect(processSourceItems(adapter, { items: [{ ...event, ...change }] }, { now }).records).toEqual([]);
  }
});

it('never follows UVM administrative or attendee links', () => {
  const feed = feeds.find((value) => value.id === 'uvm-lane-series');
  const paths = ['create', 'confirm', 'unconfirm', 'get_attendees', 'watch_event', 'trio-bohemo/confirm', 'trio-bohemo'];
  const index = paths.map((path) => `<a href="https://events.uvm.edu/event/${path}">Link</a>`).join('');
  expect(eventLinks(index, feed)).toEqual(['https://events.uvm.edu/event/trio-bohemo']);
});

it('delivers explicitly public MCMC salons and reports the benefit concert with conflicting venue evidence', () => {
  const feed = feeds.find((value) => value.id === 'middlebury-community-music-center');
  expect(feed).toBeDefined();
  const adapter = calendarAdapters([feed], resolvedVenues)[0];
  const result = readSourceFixture(adapter, undefined, { now });
  expect(result.rawCount).toBe(5);
  expect(result.records).toHaveLength(4);
  expect(result.rejectedCount).toBe(0);
  expect(result.unmapped).toEqual({ MCMC: 1 });
  expect(result.retireMissing).toBe(false);
  expect(result.records.map((record) => record.startsAtIso)).toEqual([
    '2026-10-24T15:00:00.000Z', '2026-11-13T21:00:00.000Z',
    '2026-12-09T23:00:00.000Z', '2026-12-10T23:00:00.000Z',
  ]);
  for (const record of result.records) {
    expect(record.description).toMatch(/Free and open to all/);
    expect(record).toMatchObject({ category: 'music', locality: 'Middlebury', region: 'VT' });
    expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).not.toBeNull();
  }
});

it.each(['uvm-lane-series', 'middlebury-community-music-center'])('excludes student-only and online-only variants for %s while keeping physical audiences', (id) => {
  const feed = feeds.find((value) => value.id === id);
  const adapter = calendarAdapters([feed], resolvedVenues)[0];
  const snapshot = adapter.parseFixture(fs.readFileSync(adapter.fixturePath, 'utf8'), { now });
  const event = snapshot.items.find((item) => adapter.normalize(item, { now }));
  expect(event).toBeDefined();
  const read = (change) => processSourceItems(adapter, { items: [{ ...event, ...change }] }, { now });
  expect(read({ title: 'Students only rehearsal' }).records).toEqual([]);
  for (const description of [
    'This event is online-only.',
    'This event is a virtual program.',
    'This event is online-only and will be livestreamed.',
  ]) {
    const result = read({ description });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'online event': 1 });
  }
  for (const description of [
    'This is a hybrid event with an in-person audience and an online stream.',
    'Attend in person; tickets can be purchased online only.',
    'The in-person concert is also livestreamed.',
  ]) expect(read({ description }).records).toHaveLength(1);
});

 it.each(feeds)('enrolls $name with its reviewed contract, public venues and targeted refresh', (proposal) => {
  const active = liveFeeds.find((feed) => feed.id === proposal.id);
  expect(active).toBeDefined();
  const { notes: proposedNotes, ...reviewed } = proposal;
  const { notes: activeNotes, ...registered } = active;
  expect(registered).toEqual(reviewed);
  expect(proposedNotes).toMatch(/Proposal only/);
  expect(activeNotes).toMatch(/Reviewed activation candidate/);
  expect(selectSources(proposal.name)).toHaveLength(1);
  expect(SOURCES.filter((source) => source.sourceName === proposal.name)).toHaveLength(1);
  const workflow = fs.readFileSync('.github/workflows/sync-events.yml', 'utf8');
  expect(workflow).toContain(`- '${proposal.name}'`);
  for (const venue of venues) expect(liveVenues.find((live) => live.name === venue.name)).toEqual(venue);
  const result = readSourceFixture(selectSources(proposal.name)[0], undefined, { now });
  expect(result.rejectedCount).toBe(0);
  expect(result.records.length).toBeGreaterThan(0);
  expect(result.retireMissing).toBe(false);
 });
