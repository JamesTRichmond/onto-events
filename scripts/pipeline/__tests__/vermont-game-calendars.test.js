const fs = require('node:fs');
const { createIcsAdapter } = require('../adapters/ics');
const { processSourceItems, readSourceFixture } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const liveFeeds = require('../../../data/feeds.json');
const proposedFeeds = require('../../../docs/sources/proposals/feeds.proposed.json');
const liveVenues = require('../../../data/venues.json');
const proposedVenues = require('../../../docs/sources/proposals/venues.proposed.json');

const now = Date.parse('2026-10-10T01:46:32.350Z');
const ids = ['quarterstaff-burlington-games', 'vermont-gaming-academy-expansion', 'vermont-gaming-academy-vault'];
const feeds = ids.map((id) => proposedFeeds.find((feed) => feed.id === id));
const venues = [...liveVenues, ...proposedVenues.filter((value) => !liveVenues.some((live) => live.name === value.name))];
const adapters = feeds.map((feed) => createIcsAdapter(feed, venues));
const content = (adapter) => fs.readFileSync(adapter.fixturePath, 'utf8');
const sample = (index) => adapters[index].parseFixture(content(adapters[index]), { now }).items[0];

it('registers the three reviewed game calendars and two public stores without changing their contracts', () => {
  expect(feeds.every(Boolean)).toBe(true);
  expect(validateRegistries(feeds, venues)).toEqual([]);
  for (const feed of feeds) {
    const { notes: proposedNotes, ...reviewed } = feed;
    const { notes: activeNotes, ...registered } = liveFeeds.find((value) => value.id === feed.id);
    expect(registered).toEqual(reviewed);
    expect(proposedNotes).toMatch(/Proposal only/);
    expect(activeNotes).toMatch(/Reviewed activation candidate/);
    expect(feed.url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/]+\/public\/basic\.ics$/);
    expect(feed).toMatchObject({ kind: 'ics', sourceKind: 'community', serviceRegion: 'vermont-corridor', timezone: 'America/New_York', defaultCategory: 'games', defaultRating: 'general', offSiteTitles: true });
  }
  for (const name of ['Quarterstaff Games Burlington', 'Vermont Gaming Academy South Burlington']) {
    expect(liveVenues.find((value) => value.name === name)).toEqual(proposedVenues.find((value) => value.name === name));
  }
});

it.each([[0, 62], [1, 144], [2, 154]])('retains the actual public game occurrences for source %i', (index, count) => {
  const result = readSourceFixture(adapters[index], undefined, { now });
  expect(result.rejectedCount).toBe(0);
  expect(result.records).toHaveLength(count);
  expect(result.records.every((record) => record.category === 'games' && record.region === 'VT' && record.timezone === 'America/New_York')).toBe(true);
  expect(result.records.every((record) => record.sourceUrl === feeds[index].listingUrl && record.id.startsWith(`ics-${feeds[index].id}-`))).toBe(true);
  expect(result.records.some((record) => record.startsAtIso.startsWith('2026-11'))).toBe(true);
});

it('excludes the source-owned non-event notices while preserving new public game titles', () => {
  const result = readSourceFixture(adapters[1], undefined, { now });
  expect(result.rawCount).toBe(146);
  expect(result.skipped).toEqual({ 'publisher non-event notice': 2 });
  expect(result.records.some((record) => /^NO (OTHER|FRIDAY)/.test(record.title))).toBe(false);
  for (const title of ['New Public Board Game Demo', 'No Thanks! Board Game Demo']) {
    expect(adapters[1].normalize({ ...sample(1), title }, { now })).toMatchObject({ title, category: 'games' });
  }
  const { nonEventTitles, ...otherFeed } = feeds[1];
  expect(createIcsAdapter(otherFeed, venues).normalize({ ...sample(1), title: 'NO OTHER EVENTS' }, { now })).not.toBeNull();
});

it.each([0, 1, 2])('uses the same fixture and fetch policies for source %i', async (index) => {
  const adapter = adapters[index];
  const fixture = adapter.parseFixture(content(adapter), { now });
  const fetched = await adapter.fetch({ now, fetchImpl: async (url) => {
    expect(url).toBe(feeds[index].url);
    return { ok: true, text: async () => content(adapter) };
  } });
  expect(processSourceItems(adapter, fetched, { now })).toEqual(processSourceItems(adapter, fixture, { now }));
});

it.each([0, 1, 2])('keeps explicit cancellations under the same occurrence IDs for source %i', (index) => {
  const event = sample(index);
  const original = adapters[index].normalize(event, { now });
  const cancelled = adapters[index].normalize({ ...event, cancelled: true, title: `Cancelled: ${event.title}` }, { now });
  expect(cancelled).toMatchObject({ id: original.id, sourceEventId: original.sourceEventId, isCancelled: true });
});

it('keeps source recurrence times across Eastern daylight saving and EXDATEs', () => {
  const result = readSourceFixture(adapters[0], undefined, { now });
  const series = result.records.filter((record) => record.title === 'FNM - Commander');
  expect(series.map((record) => record.startsAtIso)).toEqual(expect.arrayContaining(['2026-10-30T22:00:00.000Z', '2026-11-06T23:00:00.000Z']));
  const cancelledOccurrence = 'EXDATE;TZID=America/New_York:20261106T180000\n';
  const withException = content(adapters[0]).replace(/SUMMARY:FNM - Commander\n/, `SUMMARY:FNM - Commander\n${cancelledOccurrence}`);
  const parsed = processSourceItems(adapters[0], adapters[0].parseFixture(withException, { now }), { now });
  expect(parsed.records.some((record) => record.title === 'FNM - Commander' && record.startsAtIso === '2026-11-06T23:00:00.000Z')).toBe(false);
  expect(parsed.records.some((record) => record.title === 'FNM - Commander' && record.startsAtIso === '2026-10-30T22:00:00.000Z')).toBe(true);
  expect(parsed.horizon).toBe(result.horizon);
});

it('respects explicit unknown, online and off-site places instead of applying the store hint', () => {
  for (const adapter of adapters) {
    const event = adapter.parseFixture(content(adapter), { now }).items[0];
    for (const location of ['Unknown private address', 'Zoom', 'TBD', 'Liberty Park']) {
      expect(adapter.normalize({ ...event, location }, { now })).toBeNull();
    }
    expect(adapter.normalize({ ...event, title: 'Board Games at Unmapped Park', location: '', description: '' }, { now })).toBeNull();
    expect(adapter.normalize({ ...event, location: '', description: 'Meet at Unmapped Park.' }, { now })).toBeNull();
    expect(adapter.normalize({ ...event, title: 'Private party', location: '' }, { now })).toBeNull();
  }
});

it('scopes the Vault room alias to its publisher and does not disclose attendee/organizer metadata', () => {
  const event = { ...sample(2), location: 'The Vault at VGA' };
  const record = adapters[2].normalize(event, { now });
  expect(record.venue).toBe('Vermont Gaming Academy South Burlington');
  expect(adapters[0].normalize(event, { now })).toBeNull();
  for (const adapter of adapters) {
    expect(content(adapter)).not.toMatch(/^(ATTENDEE|ORGANIZER|CONTACT)[:;]/m);
    const result = readSourceFixture(adapter, undefined, { now });
    expect(result.records.every((record) => record.attendees === 0 && record.organizer === undefined && record.author === undefined)).toBe(true);
  }
});

it('retains complete mature evidence and does not infer Family from a game store', () => {
  for (const adapter of adapters) {
    const event = adapter.parseFixture(content(adapter), { now }).items[0];
    expect(adapter.normalize({ ...event, description: '' }, { now }).rating).toBe('general');
    const mature = adapter.normalize({ ...event, description: `${'Public game description. '.repeat(500)}21+ only.` }, { now });
    expect(mature.rating).toBe('mature');
    expect(mature.description).not.toContain('21+ only');
  }
});

it.each([null, [], {}, [''], [' NO OTHER EVENTS'], ['NO OTHER EVENTS', 'NO OTHER EVENTS'], [7], Array.from({ length: 21 }, (_, i) => `notice${i}`), ['x'.repeat(201)]])('rejects malformed or unbounded non-event notice policy %p', (nonEventTitles) => {
  expect(validateRegistries([{ ...feeds[1], nonEventTitles }], venues)).toContain(`Invalid feed: ${feeds[1].id}`);
});

it.each(['http://example.com', 'https://user:password@example.com', '', 'not a URL'])('rejects unsafe publisher listing URL %p', (listingUrl) => {
  expect(validateRegistries([{ ...feeds[0], listingUrl }], venues)).toContain(`Invalid feed: ${feeds[0].id}`);
});

it('keeps the optional source policies on ICS and does not overwrite an occurrence-specific public URL', () => {
  expect(validateRegistries([{ ...feeds[1], kind: 'rss' }], venues)).toContain(`Invalid feed: ${feeds[1].id}`);
  const url = 'https://www.quarterstaffgames.com/eventschedule.php?event=public-example';
  expect(adapters[0].normalize({ ...sample(0), url }, { now }).sourceUrl).toBe(url);
});
