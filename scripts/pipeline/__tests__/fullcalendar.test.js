const { calendarEntries, calendarItems, createFullCalendarAdapter, wallTime } = require('../adapters/fullcalendar');
const { validateRegistries } = require('../registry-validation');

const venue = {
  name: 'Contract Room', aliases: [], lat: 35.6179, lng: -82.3213, address: '1 Main St', locality: 'Black Mountain', region: 'NC',
  sourceUrl: 'https://example.org/', kind: 'hall', allAges: true, verifiedOn: '2026-10-09',
};
const feed = {
  id: 'contract-calendar', name: 'Contract Calendar', kind: 'fullcalendar', sourceKind: 'community', serviceRegion: 'asheville',
  timezone: 'America/New_York', url: 'https://room.example/eventscalendar/', productsUrl: 'https://room.example/wp-json/wc/store/v1/products',
  defaultCategory: 'music', defaultRating: 'general', venueHint: 'Contract Room', termsUrl: 'https://room.example/', termsCheckedOn: '2026-10-09',
  notes: 'Contract feed.', fixturePath: 'scripts/pipeline/fixtures/fullcalendar/white-horse-black-mountain.json',
};
const now = Date.parse('2026-10-09T12:00:00Z');
const page = `<script>
  var calendar = new FullCalendar.Calendar(el, {
    events: [{
      title: 'Ryan Holgerson\\'s Electric Voodoo Choir', start: '2026-11-24 19:30', end: '2026-11-24 21:30',
      url: 'https://room.example/product/voodoo-choir/', classNames: ['tcec-event-1', '}'], extendedProps: { seats: { left: 3 } },
    },{
      title: 'Coded', start: '2026-10-20 19:00', eventContent: function () { return '}'; },
    },{
      title: 'Nanseera', start: '2026-11-19 18:30', end: '2026-11-19 20:30', url: 'https://room.example/product/members-only-nanseera/',
    },{
      title: 'Open Mic', "start": "2026-10-14 19:00", end: '2026-10-14 21:00', url: '/product/open-mic-10-14/',
    },{
      title: 'Market &amp; Music', start: '2026-11-01', url: 'https://elsewhere.example/product/market/',
    }]
  });
  var again = { events: [{ title: 'Open Mic', "start": "2026-10-14 19:00", end: '2026-10-14 21:00', url: '/product/open-mic-10-14/' }] };
</script>`;
const products = [
  { slug: 'voodoo-choir', permalink: 'https://room.example/product/voodoo-choir/', short_description: '<p>Pay what you can.</p>', description: '<p>A <b>soul</b> revue.</p>' },
  { slug: 'rsvp-members-only-nanseera', permalink: 'https://room.example/product/rsvp-members-only-nanseera/', short_description: '<div>Members Only Show:</div>', description: '<p>A songwriter.</p>' },
  { slug: 'open-mic-main-x', permalink: 'https://room.example/product/open-mic-main-x/', short_description: '', description: '<p>Not this one.</p>' },
];

it('reads the calendar literal as data, passing over entries with code and repeated widgets', () => {
  expect(calendarEntries(page)).toEqual([
    { title: 'Ryan Holgerson\'s Electric Voodoo Choir', start: '2026-11-24 19:30', end: '2026-11-24 21:30', url: 'https://room.example/product/voodoo-choir/' },
    { title: 'Nanseera', start: '2026-11-19 18:30', end: '2026-11-19 20:30', url: 'https://room.example/product/members-only-nanseera/' },
    { title: 'Open Mic', start: '2026-10-14 19:00', end: '2026-10-14 21:00', url: '/product/open-mic-10-14/' },
    { title: 'Market &amp; Music', start: '2026-11-01', url: 'https://elsewhere.example/product/market/' },
  ]);
});

it('keeps wall times in the venue zone and gives each show its own ticket page and description', () => {
  const { items, truncated } = calendarItems(page, products, feed, now);
  expect(truncated).toBe(true);
  expect(items.map((item) => [item.title, item.start, item.end, item.url])).toEqual([
    ['Open Mic', '2026-10-14T23:00:00.000Z', '2026-10-15T01:00:00.000Z', 'https://room.example/product/open-mic-10-14/'],
    // An all-day entry ends at the next local midnight, across the DST change.
    ['Market & Music', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', feed.url],
    ['Nanseera', '2026-11-19T23:30:00.000Z', '2026-11-20T01:30:00.000Z', 'https://room.example/product/members-only-nanseera/'],
    ['Ryan Holgerson\'s Electric Voodoo Choir', '2026-11-25T00:30:00.000Z', '2026-11-25T02:30:00.000Z', 'https://room.example/product/voodoo-choir/'],
  ]);
  expect(items[3]).toMatchObject({ uid: 'https://room.example/product/voodoo-choir/', description: 'Pay what you can. A soul revue.' });
  // The RSVP product sold for a show's page carries its access line; an
  // unrelated product never lends a show its words.
  expect(items[2].description).toBe('Members Only Show: A songwriter.');
  expect(items[0].description).toBe('');
  expect(items[1].uid).toBe('contract-calendar-market-music');
});

it('treats an out-of-range date or clock as no date, never a crash', () => {
  expect(wallTime('2026-11-24 19:30', 'America/New_York')).toEqual({ instant: Date.parse('2026-11-25T00:30:00Z'), date: '20261124', allDay: false });
  for (const value of ['2026-00-10', '2026-13-01', '2026-02-30', '2026-11-00', '2026-11-24 25:00', '2026-11-24 19:60', '2026-11-24T19:30:61']) {
    expect(wallTime(value, 'America/New_York')).toBeNull();
  }
  const html = `<script>events: [{ title: 'Bad', start: '2026-02-30 19:00' }, { title: 'Good', start: '2026-10-20 19:00' }]</script>`;
  const { items, diagnostics } = calendarItems(html, [], feed, now);
  expect(items.map((item) => item.title)).toEqual(['Good']);
  expect(diagnostics).toEqual({ 'missing event date': 1 });
});

it('skips a members-only show by the words of its own product', () => {
  const adapter = createFullCalendarAdapter(feed, [venue]);
  const skipped = [];
  const records = calendarItems(page, products, feed, now).items
    .map((item) => adapter.normalize(item, { now, skip: (reason) => skipped.push(reason) })).filter(Boolean);
  expect(records.map((record) => record.title)).toEqual(['Open Mic', 'Market & Music', 'Ryan Holgerson\'s Electric Voodoo Choir']);
  expect(skipped).toEqual(['restricted or room-booking listing']);
});

it('skips a title the feed names as a members’ show', () => {
  const adapter = createFullCalendarAdapter({ ...feed, restrictedPattern: "\\bmembers['’]? (?:only|show)\\b" }, [venue]);
  const skipped = [];
  const normalize = (title) => adapter.normalize({ ...calendarItems(page, [], feed, now).items[0], title }, { now, skip: (reason) => skipped.push(reason) });
  expect(normalize('Macon Music Revue - Members Show')).toBeNull();
  expect(normalize('Members’ Show')).toBeNull();
  expect(normalize('Membership drive concert')).not.toBeNull();
  expect(skipped).toEqual(['restricted or room-booking listing', 'restricted or room-booking listing']);
});

it('pages through the product list and fails the run when it cannot be read', async () => {
  const adapter = createFullCalendarAdapter(feed, [venue]);
  const requested = [];
  const full = Array.from({ length: 100 }, (_, index) => ({ slug: `p-${index}`, permalink: `https://room.example/product/p-${index}/` }));
  const fetchImpl = (pages) => async (url, options) => {
    requested.push(url);
    expect(options).toEqual({ minIntervalMs: undefined, timeoutMs: undefined });
    if (url === feed.url) return { ok: true, text: async () => page };
    const next = pages.shift();
    return next === undefined ? { ok: false, status: 503, text: async () => '' } : { ok: true, text: async () => JSON.stringify(next) };
  };
  const snapshot = await adapter.fetch({ now, fetchImpl: fetchImpl([full, products]) });
  expect(requested).toEqual([
    feed.url, `${feed.productsUrl}?per_page=100&page=1`, `${feed.productsUrl}?per_page=100&page=2`,
  ]);
  expect(snapshot.items.find((item) => item.title === 'Nanseera').description).toBe('Members Only Show: A songwriter.');
  await expect(adapter.fetch({ now, fetchImpl: fetchImpl([]) })).rejects.toThrow('Product request failed (503)');
});

it('validates the product source through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  const bad = (change) => validateRegistries([{ ...feed, ...change }], [venue]);
  expect(bad({ productsUrl: 'https://other.example/wp-json/wc/store/v1/products' })).not.toEqual([]);
  expect(bad({ productsUrl: 'https://room.example/wp-json/wc/v3/products' })).not.toEqual([]);
  expect(bad({ productsUrl: 'https://room.example/wp-json/wc/store/v1/products?per_page=100' })).not.toEqual([]);
  expect(bad({ venueHint: undefined })).not.toEqual([]);
  expect(bad({ restrictedPattern: '(' })).not.toEqual([]);
  expect(bad({ restrictedPattern: 'x'.repeat(201) })).not.toEqual([]);
  expect(bad({ restrictedPattern: 'members show' })).toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'ics' }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, productsUrl: undefined }], [venue])).toEqual([]);
});
