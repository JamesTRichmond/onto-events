const venues = require('../../../data/venues.json');
const { calendarAdapters } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { createSquarespaceAdapter, parseSquarespaceRss } = require('../adapters/squarespace');
const fixture = require('../fixtures/squarespace/glendale-neighborhood-council.json');

const feed = {
  id: 'glendale-neighborhood-council',
  name: 'Glendale Neighborhood Council',
  kind: 'squarespace',
  sourceKind: 'community',
  timezone: 'America/Denver',
  url: 'https://www.glendalecouncil.org/events?format=rss',
  defaultCategory: 'community',
  defaultRating: 'general',
  venueHint: null,
  termsUrl: 'https://www.glendalecouncil.org/',
  termsCheckedOn: '2026-09-05',
  notes: 'Squarespace events collection read through each event page.',
  fixturePath: 'scripts/pipeline/fixtures/squarespace/glendale-neighborhood-council.json',
};

const now = Date.parse('2026-09-01T00:00:00Z');

it('merges Squarespace RSS listings with each event page and ignores pubDate as the event start', () => {
  const [adapter] = calendarAdapters([feed], venues);
  const result = readSourceFixture(adapter, undefined, { now });
  expect(result.records).toHaveLength(3);
  expect(result.records.every((record) => record.id.startsWith('squarespace-glendale-neighborhood-council-'))).toBe(true);
  expect(result.records.map((record) => record.sourceEventId)).toEqual([
    '["single","6a0000000000000000000001@squarespace.com"]',
    '["single","6a0000000000000000000002@squarespace.com"]',
    '["single","6a0000000000000000000003@squarespace.com"]',
  ]);
  expect(result.records.map((record) => record.startsAtIso)).toEqual([
    '2026-09-21T01:00:00.000Z',
    '2026-09-23T00:00:00.000Z',
    '2026-09-26T03:00:00.000Z',
  ]);
  expect(result.records.map((record) => record.rating)).toEqual(['general', 'general', 'mature']);
  expect(result.records.map((record) => record.sourceUrl)).toEqual([
    'https://www.glendalecouncil.org/events/bike-club-ride',
    'https://www.glendalecouncil.org/events/stained-glass-social',
    'https://www.glendalecouncil.org/events/karaoke-after-dark',
  ]);
  expect(result.records[0].description).toContain('Published on the front page.');
  expect(result.records[0].description).toContain('All ages bike club ride and social.');
  expect(result.records[2].description).toContain('21+ karaoke after dark.');
  expect(result.skipped).toEqual({});
  expect(result.diagnostics).toEqual({});
  expect(result.retireMissing).toBe(false);
});

it('only follows event pages on the approved Squarespace origin', () => {
  const rss = '<rss><channel>'
    + '<item><title>Same origin</title><link>/events/same-origin</link></item>'
    + '<item><title>Other origin</title><link>https://other.example/events/cross-origin</link></item>'
    + '<item><title>Credentials</title><link>https://user:pass@www.glendalecouncil.org/events/credentials</link></item>'
    + '</channel></rss>';
  const snapshot = parseSquarespaceRss(rss, feed);
  expect(snapshot.items.map((item) => item.url)).toEqual([
    'https://www.glendalecouncil.org/events/same-origin',
  ]);
  expect(snapshot.diagnostics).toEqual({ 'missing event page': 2 });
});

it('deduplicates event pages and caps secondary page requests', () => {
  const links = [0, 0, ...Array.from({ length: 101 }, (_, index) => index + 1)];
  const rss = `<rss><channel>${links.map((id) => (
    `<item><title>Event ${id}</title><link>/events/${id}</link></item>`
  )).join('')}</channel></rss>`;
  const snapshot = parseSquarespaceRss(rss, feed);
  expect(snapshot.items).toHaveLength(100);
  expect(snapshot.items.at(-1).url).toBe('https://www.glendalecouncil.org/events/99');
  expect(snapshot.diagnostics).toEqual({
    'duplicate event page': 1,
    'event page limit reached': 2,
  });
});

it('uses a GUID as a fallback only when it is an explicit same-origin permalink', () => {
  const rss = '<rss><channel>'
    + '<item><title>Opaque GUID</title><guid>opaque-event-id</guid></item>'
    + '<item><title>Permalink GUID</title><guid>https://www.glendalecouncil.org/events/permalink</guid></item>'
    + '<item><title>Non-permalink GUID</title><guid isPermaLink="false">https://www.glendalecouncil.org/events/not-a-link</guid></item>'
    + '</channel></rss>';
  const snapshot = parseSquarespaceRss(rss, feed);
  expect(snapshot.items.map((item) => item.url)).toEqual([
    'https://www.glendalecouncil.org/events/permalink',
  ]);
  expect(snapshot.diagnostics).toEqual({ 'missing event page': 2 });
});

it('deduplicates fragment variants of the same event page', () => {
  const rss = '<rss><channel>'
    + '<item><title>First</title><link>/events/one#details</link></item>'
    + '<item><title>Second</title><link>/events/one#tickets</link></item>'
    + '</channel></rss>';
  const snapshot = parseSquarespaceRss(rss, feed);
  expect(snapshot.items.map((item) => item.pageUrl)).toEqual([
    'https://www.glendalecouncil.org/events/one',
  ]);
  expect(snapshot.diagnostics).toEqual({ 'duplicate event page': 1 });
});

it('keeps a partial page fetch additive so one failed event cannot retire listings', async () => {
  const failedUrl = 'https://www.glendalecouncil.org/events/stained-glass-social';
  const fetchImpl = jest.fn(async (url) => {
    if (url === feed.url) return { ok: true, text: async () => fixture.rss };
    if (url === failedUrl) return { ok: false, status: 503 };
    return { ok: true, text: async () => fixture.pages[url] };
  });
  const snapshot = await createSquarespaceAdapter(feed, venues).fetch({ fetchImpl, now });
  expect(snapshot.items.map((item) => item.uid)).toEqual(['6a0000000000000000000001@squarespace.com', '6a0000000000000000000003@squarespace.com']);
  expect(snapshot).toMatchObject({
    retireMissing: false,
    diagnostics: { 'event page fetch failed': 1 },
  });
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

it('forwards the feed pacing and timeout ceiling to the feed and every event page request', async () => {
  const fetchImpl = jest.fn(async (url) => url === feed.url
    ? { ok: true, text: async () => fixture.rss }
    : { ok: true, text: async () => fixture.pages[url] });
  await createSquarespaceAdapter({ ...feed, minIntervalMs: 2000, timeoutMs: 45000 }, venues).fetch({ fetchImpl, now });
  expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  for (const [, options] of fetchImpl.mock.calls) expect(options).toEqual({ minIntervalMs: 2000, timeoutMs: 45000 });
});

// Squarespace's robots.txt disallows every ?format=ical and ?format=json URL.
it('never requests a format URL that Squarespace robots.txt disallows', async () => {
  const rss = fixture.rss.replace(
    'https://www.glendalecouncil.org/events/bike-club-ride',
    'https://www.glendalecouncil.org/events/bike-club-ride?format=ical',
  ).replace(
    'https://www.glendalecouncil.org/events/stained-glass-social',
    'https://www.glendalecouncil.org/events/stained-glass-social?month=09&amp;format=json',
  );
  const fetchImpl = jest.fn(async (url) => url === feed.url
    ? { ok: true, text: async () => rss }
    : { ok: true, text: async () => fixture.pages[url] });
  await createSquarespaceAdapter(feed, venues).fetch({ fetchImpl, now });
  expect(fetchImpl.mock.calls.slice(1).map(([url]) => url)).toEqual([
    'https://www.glendalecouncil.org/events/bike-club-ride',
    'https://www.glendalecouncil.org/events/stained-glass-social?month=09',
    'https://www.glendalecouncil.org/events/karaoke-after-dark',
  ]);
  for (const [url] of fetchImpl.mock.calls.slice(1)) expect(new URL(url).searchParams.has('format')).toBe(false);
});

describe('reading an event page', () => {
  const { expandSquarespaceEvents } = require('../adapters/squarespace');
  const rss = (guid = '') => '<rss><channel><item><title>Lunch</title>'
    + `<link>https://www.glendalecouncil.org/events/lunch</link>${guid}</item></channel></rss>`;
  const page = (event, attrs = '') => `<html><body${attrs}><script type="application/ld+json">${JSON.stringify({ '@type': 'Event', ...event })}</script></body></html>`;
  const expand = (html, guid) => expandSquarespaceEvents({ feed, now, xml: rss(guid), fetchPage: async () => html });

  it('keeps the item id Squarespace\'s own calendar export used as the UID', async () => {
    const guid = '<guid isPermaLink="false">5f0a1b2c3d4e5f6a7b8c9d0e:5f0a1b2c3d4e5f6a7b8c9d0f:6a7e6f3a98587930072daf0d</guid>';
    const { items } = await expand(page({ startDate: '2026-09-10T12:00:00-0600' }), guid);
    expect(items[0].uid).toBe('6a7e6f3a98587930072daf0d@squarespace.com');
    const fromPage = await expand(page({ startDate: '2026-09-10T12:00:00-0600' }, ' data-item-id="6a7e6f3a98587930072daf0e"'));
    expect(fromPage.items[0].uid).toBe('6a7e6f3a98587930072daf0e@squarespace.com');
  });

  it('reads the place name, a cancellation and a date-only start', async () => {
    const { items } = await expand(page({
      startDate: '2026-09-10', eventStatus: 'https://schema.org/EventCancelled',
      location: { '@type': 'Place', name: 'Liberty Park', address: '600 East 900 South\nSalt Lake City, UT' },
    }));
    expect(items[0]).toMatchObject({ location: 'Liberty Park', cancelled: true, start: '2026-09-10T06:00:00.000Z', end: '2026-09-11T06:00:00.000Z' });
  });

  it('ends an all-day listing at the next local midnight across a DST change', async () => {
    const ny = { ...feed, timezone: 'America/New_York' };
    const xml = '<rss><channel><item><title>All day</title><link>https://www.glendalecouncil.org/events/all-day</link></item></channel></rss>';
    const read = (nowIso, event) => expandSquarespaceEvents({
      feed: ny, now: Date.parse(nowIso), xml, fetchPage: async () => page(event),
    });
    const fall = await read('2026-10-20T00:00:00Z', { startDate: '2026-11-01' });
    expect(fall.items[0]).toMatchObject({ start: '2026-11-01T04:00:00.000Z', end: '2026-11-02T05:00:00.000Z' });
    const span = await read('2026-10-20T00:00:00Z', { startDate: '2026-11-01', endDate: '2026-11-03' });
    expect(span.items[0]).toMatchObject({ start: '2026-11-01T04:00:00.000Z', end: '2026-11-04T05:00:00.000Z' });
    const spring = await read('2026-03-01T00:00:00Z', { startDate: '2026-03-08' });
    expect(spring.items[0]).toMatchObject({ start: '2026-03-08T05:00:00.000Z', end: '2026-03-09T04:00:00.000Z' });
  });

  it('reports a page without event data instead of guessing a date', async () => {
    const { items, diagnostics } = await expand('<html><body>No structured data</body></html>');
    expect(items).toEqual([]);
    expect(diagnostics).toEqual({ 'missing event data': 1 });
  });
});
