const { eventLinks, expandPages, createJsonLdAdapter } = require('../adapters/jsonld');
const { validateRegistries } = require('../registry-validation');

const venue = {
  name: 'Contract Hall', aliases: [], lat: 35.5951, lng: -82.5515, address: '1 Main St', locality: 'Asheville', region: 'NC',
  sourceUrl: 'https://example.org/', kind: 'hall', allAges: 'unknown', verifiedOn: '2026-10-08',
};
const feed = {
  id: 'contract-jsonld', name: 'Contract JSON-LD', kind: 'jsonld', sourceKind: 'community', serviceRegion: 'asheville',
  timezone: 'America/New_York', url: 'https://hall.example/events', eventHosts: ['tickets.example'], eventPath: '^/e/\\d+$',
  defaultCategory: 'music', defaultRating: 'general', termsUrl: 'https://hall.example/', termsCheckedOn: '2026-10-08',
  notes: 'Contract feed.', fixturePath: 'scripts/pipeline/fixtures/jsonld/eulogy.json',
};
const now = Date.parse('2026-10-08T12:00:00Z');
const ld = (value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const show = (name, startDate, extra = {}) => ({ '@type': 'MusicEvent', name, startDate, url: `https://tickets.example/e/${name.length}`, location: { '@type': 'Place', name: 'Contract Hall' }, ...extra });

it('follows only https event links on the named hosts and paths, decoding entities and dropping query strings', () => {
  const html = [
    '<a href="https://tickets.example/e/1?ref=list">one</a>',
    '<a href="&#x2F;e&#x2F;2">relative, wrong host</a>',
    '<a href="https:&#x2F;&#x2F;tickets.example&#x2F;e&#x2F;3">three</a>',
    '<a href="http://tickets.example/e/4">plain http</a>',
    '<a href="https://tickets.example/e/5/checkout">wrong path</a>',
    '<a href="https://other.example/e/6">other host</a>',
  ].join('');
  expect(eventLinks(html, feed)).toEqual(['https://tickets.example/e/1', 'https://tickets.example/e/3']);
});

it('reads events nested under a venue on the index page and caps the horizon at a full list', () => {
  const index = ld({ '@type': 'Place', name: 'Contract Hall', event: [show('Early', '2026-10-09T20:00:00-04:00'), show('Late', '2026-10-20T20:00:00-04:00')] });
  const snapshot = expandPages(index, [], { ...feed, exportLimit: 2 }, now);
  expect(snapshot.items.map((item) => [item.title, item.start, item.location])).toEqual([
    ['Early', '2026-10-10T00:00:00.000Z', 'Contract Hall'], ['Late', '2026-10-21T00:00:00.000Z', 'Contract Hall'],
  ]);
  expect(snapshot.horizon).toBe('2026-10-21T00:00:00.000Z');
  expect(snapshot.diagnostics).toEqual({ 'export limit reached': 1 });
});

it('reads linked event pages, keeps each date of one page as an occurrence, and never retires on a failed page', () => {
  const pages = [
    ['https://tickets.example/e/1', ld([show('Tour', '2026-10-23T10:00:00-04:00', { url: 'https://tickets.example/e/1' }), show('Tour', '2026-11-13T10:00:00-05:00', { url: 'https://tickets.example/e/1' })])],
    ['https://tickets.example/e/2', null],
    ['https://tickets.example/e/3', '<p>no data</p>'],
  ];
  const snapshot = expandPages('', pages, feed, now);
  expect(snapshot.items.map((item) => [item.uid, item.occurrence])).toEqual([
    ['https://tickets.example/e/1', '2026-10-23T14:00:00.000Z'], ['https://tickets.example/e/1', '2026-11-13T15:00:00.000Z'],
  ]);
  expect(snapshot.diagnostics).toEqual({ 'event page fetch failed': 1, 'missing event data': 1 });
  expect(snapshot.retireMissing).toBe(false);
});

it('drops past and far-future events and reads a cancelled status', () => {
  const index = ld([
    show('Past', '2026-10-01T20:00:00-04:00'), show('Far', '2027-03-01T20:00:00-05:00'),
    show('Cancelled show', '2026-10-15T20:00:00-04:00', { eventStatus: 'https://schema.org/EventCancelled' }),
  ]);
  expect(expandPages(index, [], feed, now).items.map((item) => [item.title, item.cancelled])).toEqual([['Cancelled show', true]]);
});

it('ends an all-day event at the next local midnight across a DST change', () => {
  const read = (nowIso, extra) => expandPages(ld(show('All day', extra.startDate, extra)), [], feed, Date.parse(nowIso)).items[0];
  expect(read('2026-10-20T00:00:00Z', { startDate: '2026-11-01' })).toMatchObject({ start: '2026-11-01T04:00:00.000Z', end: '2026-11-02T05:00:00.000Z' });
  expect(read('2026-10-20T00:00:00Z', { startDate: '2026-11-01', endDate: '2026-11-03' })).toMatchObject({ start: '2026-11-01T04:00:00.000Z', end: '2026-11-04T05:00:00.000Z' });
  expect(read('2026-03-01T00:00:00Z', { startDate: '2026-03-08' })).toMatchObject({ start: '2026-03-08T05:00:00.000Z', end: '2026-03-09T04:00:00.000Z' });
});

it('fetches the index and its event pages with the feed pacing', async () => {
  const fetched = [];
  const adapter = createJsonLdAdapter({ ...feed, minIntervalMs: 2000 }, [venue]);
  const snapshot = await adapter.fetch({ now, fetchImpl: async (url, options) => {
    fetched.push([url, options]);
    return { ok: true, text: async () => (url === feed.url ? '<a href="https://tickets.example/e/7">x</a>' : ld(show('Linked', '2026-10-12T19:00:00-04:00'))) };
  } });
  expect(fetched).toEqual([[feed.url, { minIntervalMs: 2000, timeoutMs: undefined }], ['https://tickets.example/e/7', { minIntervalMs: 2000, timeoutMs: undefined }]]);
  expect(adapter.normalize(snapshot.items[0], { now, skip: () => {} })).toMatchObject({ venue: 'Contract Hall', title: 'Linked' });
});

it('validates link settings through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, eventHosts: [] }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, eventPath: '(' }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'ics' }], [venue])).not.toEqual([]);
});

it('can omit an unclocked end for a timed concert without changing real all-day events', () => {
  const options = { ...feed, ignoreDateOnlyEnd: true };
  const timed = show('Concert', '2026-10-16T19:30:00-04:00', { endDate: '2026-10-16' });
  expect(expandPages(ld(timed), [], options, now).items[0].end).toBeUndefined();
  expect(expandPages(ld(timed), [], feed, now).items[0].end).toBe('2026-10-17T04:00:00.000Z');
  expect(expandPages(ld({ ...timed, endDate: '2026-10-16T21:00:00-04:00' }), [], options, now).items[0].end).toBe('2026-10-17T01:00:00.000Z');
  expect(expandPages(ld({ ...timed, startDate: '2026-10-16' }), [], options, now).items[0].end).toBe('2026-10-17T04:00:00.000Z');
  expect(validateRegistries([options], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, ignoreDateOnlyEnd: 'yes' }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'ics', eventPath: undefined, eventHosts: undefined, ignoreDateOnlyEnd: true }], [venue])).not.toEqual([]);
});

it('keeps absent events when the publisher explicitly supplies only a rolling JSON-LD index', () => {
  const options = { ...feed, retireMissing: false };
  expect(expandPages(ld(show('Concert', '2026-10-16T19:30:00-04:00')), [], options, now).retireMissing).toBe(false);
  expect(expandPages('', [], options, now).retireMissing).toBe(false);
  expect(expandPages('', [], feed, now).retireMissing).toBeUndefined();
  expect(validateRegistries([options], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, retireMissing: true }], [venue])).not.toEqual([]);
});
