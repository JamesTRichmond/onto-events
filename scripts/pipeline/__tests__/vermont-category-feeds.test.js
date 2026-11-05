const fs = require('node:fs');
const feeds = require('../../../data/feeds.json');
const liveVenues = require('../../../data/venues.json');
const proposedFeeds = require('../../../docs/sources/proposals/feeds.proposed.json');
const proposedVenues = require('../../../docs/sources/proposals/venues.proposed.json');
const { calendarAdapters } = require('../sources');
const { validateRegistries } = require('../registry-validation');
const { readSourceFixture, fetchSourceRecords } = require('../run-source');
const { pageUrl } = require('../adapters/tribe');
const { calendarRecord } = require('../calendar-record');

const now = Date.parse('2026-10-10T00:30:00Z');
const venues = [...liveVenues, ...proposedVenues.filter((value) => !liveVenues.some((live) => live.name === value.name))];
const carFeed = proposedFeeds.find((value) => value.id === 'vermont-auto-public-car-meets');
const saleFeed = proposedFeeds.find((value) => value.id === 'south-burlington-library-book-sale');
const [carAdapter] = calendarAdapters([carFeed], venues);
const [saleAdapter] = calendarAdapters([saleFeed], venues);

it('registers the reviewed car and sale contracts and public venues unchanged', () => {
  for (const feed of [carFeed, saleFeed]) {
    const { notes: proposedNotes, ...reviewed } = feed;
    const { notes: activeNotes, ...registered } = feeds.find((value) => value.id === feed.id);
    expect(registered).toEqual(reviewed);
    expect(proposedNotes).toMatch(/Proposal only/);
    expect(activeNotes).toMatch(/Reviewed activation candidate/);
  }
  for (const name of ['Island Ice Cream Williston', 'South Burlington Public Library']) {
    expect(liveVenues.find((value) => value.name === name)).toEqual(proposedVenues.find((value) => value.name === name));
  }
});

it('keeps the real public car meetup and excludes all five internal meetings in the source capture', () => {
  const result = readSourceFixture(carAdapter, undefined, { now });
  expect(result.records).toHaveLength(1);
  expect(result.rejectedCount).toBe(0);
  expect(result.diagnostics).toEqual({ 'unreviewed public category': 5 });
  expect(result.records[0]).toMatchObject({
    title: 'Car Meet', category: 'community', rating: 'general',
    venue: 'Island Ice Cream Williston', locality: 'Williston', region: 'VT',
    timezone: 'America/New_York', startsAtIso: '2026-10-13T22:00:00.000Z',
    endsAtIso: '2026-10-14T00:00:00.000Z', attendees: 0,
  });
});

it('enforces the same public subset in a real fetch if the server ignores its category query', async () => {
  const fixture = JSON.parse(fs.readFileSync(carAdapter.fixturePath, 'utf8'));
  const requests = [];
  const result = await fetchSourceRecords(carAdapter, {
    now, overrides: {}, politeFetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => fixture.pages[0] };
    },
  });
  expect(result.records.map((value) => value.title)).toEqual(['Car Meet']);
  expect(result.diagnostics['unreviewed public category']).toBe(5);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get('categories')).toBe('27');
  expect(new URL(pageUrl(carFeed, now, 2)).searchParams.get('categories')).toBe('27');
});

it('retains car occurrence ownership when the publisher cancels it', () => {
  const original = readSourceFixture(carAdapter, undefined, { now }).records[0];
  const fixture = JSON.parse(fs.readFileSync(carAdapter.fixturePath, 'utf8'));
  fixture.pages[0].events[0].title = 'Cancelled: Car Meet';
  const snapshot = carAdapter.parseFixture(JSON.stringify(fixture), { now });
  const cancelled = carAdapter.normalize(snapshot.items[0], { now });
  expect(cancelled).toMatchObject({ id: original.id, sourceEventId: original.sourceEventId, isCancelled: true });
});

it('keeps the car venue label scoped to its publisher', () => {
  const fixture = JSON.parse(fs.readFileSync(carAdapter.fixturePath, 'utf8'));
  const event = carAdapter.parseFixture(JSON.stringify(fixture), { now }).items[0];
  const otherFeed = { ...carFeed, venueAliases: undefined };
  expect(calendarRecord(event, { feed: otherFeed, venues })).toBeNull();
  expect(carAdapter.normalize(event, { now }).venue).toBe('Island Ice Cream Williston');
});

it('keeps both separately published sale days and disables retirement by this narrow export', () => {
  const result = readSourceFixture(saleAdapter, undefined, { now });
  expect(result.records).toHaveLength(2);
  expect(result.rejectedCount).toBe(0);
  expect(result.retireMissing).toBe(false);
  expect(result.records.map((value) => [value.startsAtIso, value.endsAtIso])).toEqual([
    ['2026-10-10T14:00:00.000Z', '2026-10-10T18:00:00.000Z'],
    ['2026-10-11T14:00:00.000Z', '2026-10-11T18:00:00.000Z'],
  ]);
  expect(new Set(result.records.map((value) => value.id)).size).toBe(2);
  expect(result.records.every((value) => value.category === 'sales' && value.locality === 'South Burlington'
    && value.timezone === 'America/New_York' && value.attendees === 0)).toBe(true);
});

it('does not turn an unknown sale location into the reviewed library', () => {
  const content = fs.readFileSync(saleAdapter.fixturePath, 'utf8').replace(/^LOCATION:[^\r\n]*/gm, 'LOCATION:Private Residence');
  const snapshot = saleAdapter.parseFixture(content, { now });
  expect(snapshot.items).toHaveLength(2);
  const skipped = [];
  expect(snapshot.items.map((event) => saleAdapter.normalize(event, { now, skip: (...values) => skipped.push(values) }))).toEqual([null, null]);
  expect(skipped.every(([reason]) => reason === 'unmapped venue')).toBe(true);
});

it.each([
  ['bixby-library', { 'Beginner Mah Jongg Meetup': 'games', 'Book Sale': 'sales' }],
  ['kellogg-hubbard-library', { 'After School Strategy Games': 'games' }],
])('classifies the existing real %s occurrences by reviewed title', (id, classifications) => {
  const feed = feeds.find((value) => value.id === id);
  const [adapter] = calendarAdapters([feed], liveVenues);
  const result = readSourceFixture(adapter, undefined, { now: Date.parse('2026-10-07T00:00:00Z') });
  for (const [title, category] of Object.entries(classifications)) {
    expect(result.records.filter((value) => value.title === title).map((value) => value.category)).toEqual([category]);
  }
  expect(result.rejectedCount).toBe(0);
});
