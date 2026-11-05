const { calendarAdapters } = require('../sources');
const { processSourceItems } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { parseTribePages, fetchTribePages, pageUrl, MAX_PAGES } = require('../adapters/tribe');

// Synthetic contract examples, never added to the live supply registries.
const feed = {
  id: 'tribe-contract', name: 'Events Calendar contract', kind: 'tribe', sourceKind: 'community',
  serviceRegion: 'asheville', timezone: 'America/New_York',
  url: 'https://fixture.example/wp-json/tribe/events/v1/events', defaultCategory: 'music', defaultRating: 'general',
  venueHint: null, termsUrl: 'https://fixture.example/', termsCheckedOn: '2026-10-08',
  notes: 'Synthetic test only', fixturePath: 'scripts/pipeline/fixtures/tribe/contract.json',
};
const venue = {
  name: 'Contract Hall', aliases: ['Contract Hall & Garden'], address: 'Public venue', locality: 'Asheville',
  region: 'NC', lat: 35.5951, lng: -82.5515, kind: 'hall', allAges: 'unknown',
  sourceUrl: 'https://fixture.example/venue', verifiedOn: '2026-10-08',
};
const now = Date.parse('2026-10-08T16:00:00Z');
const event = (id, fields = {}) => ({
  id, global_id: `fixture.example?id=${id}`, title: `Show ${id}`, description: '<p>An evening show.</p>',
  url: `https://fixture.example/event/${id}/`, all_day: false, hide_from_listings: false,
  utc_start_date: '2026-10-10 23:00:00', utc_end_date: '2026-10-11 02:00:00',
  venue: { id: 9, venue: 'Contract Hall &#038; Garden', geo_lat: 41.43, geo_lng: -81.39 },
  ...fields,
});
const page = (events, totalPages = 1) => ({ total: events.length, total_pages: totalPages, events });

it('asks for everything still running or starting within sixty days, in the site’s local dates', () => {
  const url = new URL(pageUrl(feed, now, 3));
  expect(Object.fromEntries(url.searchParams)).toEqual({
    per_page: '50', ends_after: '2026-10-07 00:00:00', starts_before: '2026-12-07 23:59:59', page: '3',
  });
  // A feed URL may narrow the listing to the site's own categories.
  expect(new URL(pageUrl({ ...feed, url: `${feed.url}?categories=live-music,public-events` }, now, 1)).searchParams.get('categories'))
    .toBe('live-music,public-events');
});

it('keeps a run already under way and one that ends after the window', () => {
  const snapshot = parseTribePages([page([
    event(1, { all_day: true, title: 'Mini Golf Pop Up', utc_start_date: '2026-10-01 04:00:00', utc_end_date: '2026-11-01 03:59:59' }),
    event(2, { all_day: true, title: 'Holiday Ice Rink', utc_start_date: '2026-11-20 05:00:00', utc_end_date: '2027-01-19 04:59:59' }),
    event(3, { title: 'Ended yesterday', utc_start_date: '2026-10-07 22:00:00', utc_end_date: '2026-10-08 01:00:00' }),
  ])], { now, timezone: feed.timezone });
  expect(snapshot.items.map((item) => [item.title, item.start, item.end])).toEqual([
    ['Mini Golf Pop Up', '2026-10-01T04:00:00.000Z', '2026-11-01T04:00:00.000Z'],
    ['Holiday Ice Rink', '2026-11-20T05:00:00.000Z', '2027-01-19T05:00:00.000Z'],
  ]);
});

it('maps listings by decoded venue name and keeps registry coordinates over the plugin’s map point', () => {
  const snapshot = parseTribePages([page([event(1, { title: 'Love &#8230; and Music' })])], { now, timezone: feed.timezone });
  expect(snapshot.items).toEqual([expect.objectContaining({
    uid: 'fixture.example?id=1', title: 'Love … and Music', location: 'Contract Hall & Garden',
    description: 'An evening show.', start: '2026-10-10T23:00:00.000Z', end: '2026-10-11T02:00:00.000Z',
  })]);
  expect(snapshot.items[0]).not.toHaveProperty('geo');
  const [adapter] = calendarAdapters([feed], [venue]);
  const result = processSourceItems(adapter, snapshot, { now, overrides: {} });
  expect(result.records).toEqual([expect.objectContaining({
    id: expect.stringMatching(/^tribe-tribe-contract-/), venue: 'Contract Hall', lat: 35.5951, lng: -82.5515,
    sourceEventId: '["single","fixture.example?id=1"]', sourceUrl: 'https://fixture.example/event/1/',
  })]);
});

it('drops hidden, repeated, finished and past-horizon listings', () => {
  const snapshot = parseTribePages([
    page([event(1), event(2, { hide_from_listings: true }), event(3, { utc_start_date: '2026-10-08 10:00:00', utc_end_date: '2026-10-08 12:00:00' })], 2),
    page([event(1), event(4, { utc_start_date: '2026-12-08 00:00:00', utc_end_date: '2026-12-08 02:00:00' }), event(5, { utc_start_date: 'soon' })], 2),
  ], { now, timezone: feed.timezone });
  expect(snapshot.items.map((item) => item.uid)).toEqual(['fixture.example?id=1']);
  expect(snapshot.diagnostics).toEqual({ 'hidden from listings': 1, 'duplicate event': 1, 'missing event date': 1 });
  expect(snapshot.horizon).toBe('2026-12-07T16:00:00.000Z');
});

it('reads an all-day listing shifted by the site’s day cutoff as one local day', () => {
  const snapshot = parseTribePages([page([event(1, {
    all_day: true, utc_start_date: '2026-10-09 07:00:00', utc_end_date: '2026-10-10 06:59:59',
  })])], { now, timezone: feed.timezone });
  expect(snapshot.items[0]).toMatchObject({ start: '2026-10-09T04:00:00.000Z', end: '2026-10-10T04:00:00.000Z' });
});

it('skips all-day featured-listing teasers but keeps the real listing they advertise', () => {
  const snapshot = parseTribePages([page([
    event(1, { all_day: true, title: 'COMING SATURDAY OCTOBER 17th | The Band', utc_start_date: '2026-10-09 07:00:00', utc_end_date: '2026-10-10 06:59:59' }),
    event(2, { all_day: true, title: 'TONIGHT | Quartet', utc_start_date: '2026-10-09 07:00:00', utc_end_date: '2026-10-10 06:59:59' }),
    event(3, { title: 'Coming Home | Album Release' }),
    event(4, { title: 'The Band' }),
  ])], { now, timezone: feed.timezone });
  expect(snapshot.items.map((item) => item.title)).toEqual(['Coming Home | Album Release', 'The Band']);
  expect(snapshot.diagnostics).toEqual({ 'featured-listing teaser': 2 });
});

it('shortens the retirement horizon to the last fetched start when the page cap is reached', () => {
  const pages = Array.from({ length: 2 }, (_, index) => page([event(index + 1, {
    utc_start_date: `2026-10-1${index + 1} 23:00:00`, utc_end_date: `2026-10-1${index + 2} 01:00:00`,
  })], 5));
  const snapshot = parseTribePages(pages, { now, timezone: feed.timezone });
  expect(snapshot.diagnostics).toEqual({ 'page cap': 3 });
  expect(snapshot.horizon).toBe('2026-10-12T23:00:00.000Z');
});

describe('fetching', () => {
  const respond = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

  it('follows the listing pages the site reports, then stops', async () => {
    const requested = [];
    const fetchImpl = async (url) => {
      const pageNumber = +new URL(url).searchParams.get('page');
      requested.push(pageNumber);
      return respond(page([event(pageNumber)], 3));
    };
    const pages = await fetchTribePages({ feed, fetchImpl, now });
    expect(requested).toEqual([1, 2, 3]);
    expect(pages).toHaveLength(3);
  });

  it('never asks for more than the page cap', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return respond(page([], 500)); };
    await fetchTribePages({ feed, fetchImpl, now });
    expect(calls).toBe(MAX_PAGES);
  });

  it('falls back to the old window when a site ignores the new one, and fails if it ignores both', async () => {
    const far = event(2, { utc_start_date: '2027-03-01 23:00:00', utc_end_date: '2027-03-02 01:00:00' });
    const ignoresNew = async (url) => respond(page(new URL(url).searchParams.has('ends_after') ? [event(1), far] : [event(1)]));
    await expect(fetchTribePages({ feed, fetchImpl: ignoresNew, now })).rejects.toThrow('ignored the date window');
    const [adapter] = calendarAdapters([feed], [venue]);
    const requested = [];
    const snapshot = await adapter.fetch({ fetchImpl: async (url) => { requested.push(Object.fromEntries(new URL(url).searchParams)); return ignoresNew(url); }, now });
    expect(snapshot.items.map((item) => item.uid)).toEqual(['fixture.example?id=1']);
    expect(snapshot.diagnostics).toEqual({ 'legacy date window': 1 });
    expect(requested.at(-1)).toMatchObject({ start_date: '2026-10-08 00:00:00', end_date: '2026-12-07 23:59:59' });
    await expect(adapter.fetch({ fetchImpl: async () => respond(page([event(1), far])), now })).rejects.toThrow('ignored the date window');
  });

  it('fails the whole run on an error page or a body that is not a listing', async () => {
    await expect(fetchTribePages({ feed, fetchImpl: async () => respond({}, 403), now })).rejects.toThrow('(403)');
    await expect(fetchTribePages({ feed, fetchImpl: async () => respond({ events: 'none' }), now })).rejects.toThrow('Invalid Events Calendar page');
  });
});

it('registers the tribe feed kind through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'tribe-v2' }], [venue])).not.toEqual([]);
  // Off-site trips are judged against the feed's own venue, so the option needs a hint.
  expect(validateRegistries([{ ...feed, venueHint: 'Contract Hall', offSiteTitles: true }], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, offSiteTitles: true }], [venue])).toEqual(['Invalid feed: tribe-contract']);
  expect(validateRegistries([{ ...feed, venueHint: 'Contract Hall', offSiteTitles: 'yes' }], [venue])).toEqual(['Invalid feed: tribe-contract']);
  // Campus rooms are pinned at the campus, so the option needs a hint too.
  expect(validateRegistries([{ ...feed, venueHint: 'Contract Hall', campusRooms: true }], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, campusRooms: true }], [venue])).toEqual(['Invalid feed: tribe-contract']);
  expect(validateRegistries([{ ...feed, venueHint: 'Contract Hall', campusRooms: 1 }], [venue])).toEqual(['Invalid feed: tribe-contract']);
});

it('drops the plugin’s schedule line and calendar menu from block-editor descriptions', () => {
  const chrome = parseTribePages([{ total: 1, total_pages: 1, events: [{
    id: 9, global_id: 'contract?id=9', title: 'Brunch', all_day: false, hide_from_listings: false,
    description: '<div class="tribe-events-schedule"><span> @ </span></div><p>Light brunch.</p><div>Add to calendar <a>Google Calendar</a> <a>iCalendar</a> <a>Outlook 365</a> <a>Outlook Live</a></div>',
    start_date: '2026-10-09 10:30:00', end_date: '2026-10-09 11:45:00',
    utc_start_date: '2026-10-09 14:30:00', utc_end_date: '2026-10-09 15:45:00', timezone: 'America/New_York',
  }] }], { now: Date.parse('2026-10-08T12:00:00Z'), timezone: 'America/New_York' });
  expect(chrome.items.map((item) => item.description)).toEqual(['Light brunch.']);
});

it('requires an explicit occurrence time only for feeds whose listings are date-only advertisements', () => {
  const pages = [page([
    event(1, { all_day: true }), event(2), event(3, { all_day: undefined }),
  ])];
  const strict = parseTribePages(pages, { now, timezone: feed.timezone, requireTimedEvents: true });
  expect(strict.items.map((item) => item.uid)).toEqual(['fixture.example?id=2']);
  expect(strict.diagnostics).toEqual({ 'missing occurrence time': 2 });
  expect(parseTribePages(pages, { now, timezone: feed.timezone }).items).toHaveLength(3);
  expect(validateRegistries([{ ...feed, requireTimedEvents: 'yes' }], [venue])).toContain('Invalid feed: tribe-contract');
  expect(validateRegistries([{ ...feed, kind: 'ics', requireTimedEvents: true }], [venue])).toContain('Invalid feed: tribe-contract');
});

it('files listings under the onto category of their first mapped site category', () => {
  const categoryMap = { 'live-music': 'music', recreation: 'sports' };
  const cats = (...slugs) => ({ categories: slugs.map((slug) => ({ slug, name: slug })) });
  const snapshot = parseTribePages([page([
    event(1, cats('recreation')), event(2, cats('public-events', 'live-music')), event(3, cats('food-truck')), event(4),
  ])], { now, timezone: feed.timezone, categoryMap });
  expect(snapshot.items.map((item) => item.category)).toEqual(['sports', 'music', undefined, undefined]);
  const [adapter] = calendarAdapters([{ ...feed, categoryMap }], [venue]);
  expect(processSourceItems(adapter, snapshot, { now, overrides: {} }).records.map((record) => record.category))
    .toEqual(['sports', 'music', 'music', 'music']);
  expect(validateRegistries([{ ...feed, categoryMap }], [venue])).toEqual([]);
  for (const bad of [{}, { recreation: 'volleyball' }, { 'Rec Reation': 'sports' }, ['sports']]) {
    expect(validateRegistries([{ ...feed, categoryMap: bad }], [venue])).toContain('Invalid feed: tribe-contract');
  }
  expect(validateRegistries([{ ...feed, kind: 'ics', categoryMap }], [venue])).toContain('Invalid feed: tribe-contract');
});
