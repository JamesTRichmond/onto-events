jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const fs = require('node:fs');
const { createHigherGroundAdapter, eventLinks, parseEventPage, MAX_EVENT_PAGES } = require('../adapters/higherground');
const { processSourceItems, readSourceFixture } = require('../run-source');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');

const feed = {
  id: 'higher-ground', name: 'Higher Ground', kind: 'higherground', sourceKind: 'community',
  serviceRegion: 'vermont-corridor', timezone: 'America/New_York', url: 'https://highergroundmusic.com/calendar/',
  defaultCategory: 'music', defaultRating: 'general', excludeOnlineOnly: true,
  minIntervalMs: 1100, fixturePath: 'scripts/pipeline/fixtures/higherground/higher-ground.json',
};
const venue = {
  name: 'Higher Ground', aliases: [], lat: 44.4674, lng: -73.1709,
  address: '1214 Williston Road, South Burlington, VT 05403', locality: 'South Burlington', region: 'VT',
  kind: 'club', allAges: 'unknown', sourceUrl: feed.url, verifiedOn: '2026-10-15',
};
const now = Date.parse('2026-10-15T04:48:04.065Z');
const fixture = JSON.parse(fs.readFileSync(feed.fixturePath, 'utf8'));
const url = 'https://highergroundmusic.com/events/buena-vista-orchestra/';
const html = fixture.pages[url];
const adapter = () => createHigherGroundAdapter(feed, [venue]);

it('follows only publisher event paths, including its actual unquoted links', () => {
  const index = fixture.index + [
    '<a href="https://highergroundmusic.com/events/buena-vista-orchestra/?ref=calendar#top">Duplicate</a>',
    '<a href="https://other.example/events/show/">Other host</a>',
    '<a href="https://user@highergroundmusic.com/events/show/">Credentials</a>',
    '<a href="http://highergroundmusic.com/events/show/">Plain HTTP</a>',
    '<a href="/wp-admin/">Admin</a>',
  ].join('');
  expect(eventLinks(index, feed.url)).toEqual(Object.keys(fixture.pages));
});

it('uses the published show clock rather than doors or midnight metadata and preserves Eastern DST', () => {
  const result = readSourceFixture(adapter(), undefined, { now });
  expect(result.rejectedCount).toBe(0);
  expect(result.records).toHaveLength(5);
  expect(result.records.map((record) => record.startsAtIso)).toEqual([
    '2026-10-16T00:00:00.000Z', '2026-10-25T23:30:00.000Z',
    '2026-11-07T01:00:00.000Z', '2026-11-12T00:30:00.000Z', '2026-12-10T00:00:00.000Z',
  ]);
  expect(result.diagnostics['missing show time']).toBe(3);
  expect(result.retireMissing).toBe(false);
  for (const record of result.records) {
    expect(record).toMatchObject({ sourceName: 'Higher Ground', locality: 'South Burlington', category: 'music', timezone: 'America/New_York' });
    expect(record.endsAtIso).toBeUndefined();
    expect(record.description).not.toMatch(/@|\b\d{3}[-.]\d{3}[-.]\d{4}\b/);
    expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).not.toBeNull();
  }
});

it('rejects date disagreement, invalid clocks and an absent show clock instead of inventing times', () => {
  const parse = (value) => parseEventPage(value, url, { now, timezone: feed.timezone });
  expect(parse(html.replace('event-date">Thu Oct 15', 'event-date">Fri Oct 16')).reason).toBe('conflicting event date');
  expect(parse(html.replace('8:00PM', '25:00PM')).reason).toBe('missing show time');
  expect(parse(html.replace(/<span id="see-list-showtime-986"[^>]*>8:00PM<\/span>/, '')).reason).toBe('missing show time');
  expect(parse(html.replace('2026-10-15T00:00:00+00:00', '2026-02-30T00:00:00+00:00')).reason).toBe('invalid structured date');
});

it('keeps cancellation identity and full rating/access evidence while displaying only short public facts', () => {
  const event = parseEventPage(html, url, { now, timezone: feed.timezone }).item;
  const a = adapter();
  const original = a.normalize(event, { now });
  expect(a.normalize({ ...event, cancelled: true }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  expect(a.normalize({ ...event, description: 'Ages 21+ only.' }, { now }).rating).toBe('mature');
  for (const change of [{ title: 'Private party' }, { description: 'This event is online-only.' }, { location: 'Spruce Peak Arts' }]) {
    expect(processSourceItems(a, { items: [{ ...event, ...change }] }, { now }).records).toEqual([]);
  }
});

it('uses the same parsed snapshot for captured pages and fetches, pacing every request', async () => {
  const requested = [];
  const a = adapter();
  const actual = await a.fetch({ now, fetchImpl: async (link, options) => {
    expect(options.minIntervalMs).toBe(1100);
    requested.push(link);
    return { ok: true, text: async () => link === feed.url ? fixture.index : fixture.pages[link] };
  } });
  expect(processSourceItems(a, actual, { now })).toEqual(readSourceFixture(a, undefined, { now }));
  expect(requested).toEqual([feed.url, ...Object.keys(fixture.pages)]);
});

it('reports a failed page without retiring its records and rejects a broken index', async () => {
  const a = adapter();
  const actual = await a.fetch({ now, fetchImpl: async (link) => ({
    ok: link !== url, status: 503, text: async () => link === feed.url ? fixture.index : fixture.pages[link],
  }) });
  expect(actual.retireMissing).toBe(false);
  expect(actual.diagnostics['event page fetch failed']).toBe(1);
  expect(actual.items).toHaveLength(4);
  await expect(a.fetch({ now, fetchImpl: async () => ({ ok: true, text: async () => '<p>Calendar unavailable</p>' }) })).rejects.toThrow(/no event links/);
  expect(MAX_EVENT_PAGES).toBeLessThanOrEqual(100);
});

it('bounds malformed page scans without accepting fake events', () => {
  expect(eventLinks('<a href='.repeat(20000), feed.url)).toEqual([]);
  expect(parseEventPage('<div class="event-info-block">'.repeat(10000), url, { now, timezone: feed.timezone }).item).toBeUndefined();
});


it('registers the reviewed publisher and venue for scheduled and targeted delivery', () => {
  const { SOURCES } = require('../sources');
  const feeds = require('../../../data/feeds.json');
  const venues = require('../../../data/venues.json');
  const registered = feeds.find((value) => value.id === feed.id);
  expect(registered).toMatchObject(feed);
  expect(venues.find((value) => value.name === venue.name)).toMatchObject(venue);
  const source = SOURCES.find((value) => value.sourceName === feed.name);
  expect(source).toBeDefined();
  const result = readSourceFixture(source, undefined, { now });
  expect(result.records).toHaveLength(5);
  expect(result.retireMissing).toBe(false);
  expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain("- 'Higher Ground'");
});


it('uses the publisher dedicated age paragraph without mistaking biography prose for admission evidence', () => {
  const parse = (body) => parseEventPage(body, url, { now, timezone: feed.timezone }).item;
  expect(parse(html).ageNote).toBe('All Ages');
  expect(adapter().normalize(parse(html), { now }).rating).toBe('general');
  expect(adapter().normalize(parse(html.replace('>All Ages</p>', '>18+</p>')), { now }).rating).toBe('mature');
  const proseOnly = html.replace('>All Ages</p>', '>Music has inspired audiences of all ages.</p>');
  expect(parse(proseOnly).ageNote).toBeUndefined();
  expect(adapter().normalize(parse(proseOnly), { now }).rating).toBe('mature');
});
