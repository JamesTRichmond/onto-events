const { biltmoreHours, biltmoreItems, createBiltmoreAdapter } = require('../adapters/biltmore');
const { validateRegistries } = require('../registry-validation');

const venue = {
  name: 'Contract Estate', aliases: [], lat: 35.5607, lng: -82.5535, address: '1 Lodge Street', locality: 'Asheville', region: 'NC',
  sourceUrl: 'https://estate.example/', kind: 'other', allAges: 'unknown', verifiedOn: '2026-10-09',
};
const feed = {
  id: 'contract-estate', name: 'Contract Estate', kind: 'biltmore', sourceKind: 'community', serviceRegion: 'asheville',
  timezone: 'America/New_York', url: 'https://estate.example/wp-json/wp/v2/event?per_page=100', defaultCategory: 'arts',
  titleCategories: { 'live music': 'music' }, restrictedPattern: '\\bpassholders? exclusive\\b', defaultRating: 'general',
  venueHint: 'Contract Estate', campusRooms: true, termsUrl: 'https://estate.example/', termsCheckedOn: '2026-10-09',
  notes: 'Contract feed.', fixturePath: 'scripts/pipeline/fixtures/biltmore/biltmore-estate.json',
};
const now = Date.parse('2026-10-09T12:00:00Z');
const event = (title, acf, slug = title.toLowerCase().replace(/[^a-z]+/g, '-')) => ({
  id: slug.length, link: `https://estate.example/event/${slug}/`, title: { rendered: title }, acf: { location_select_event: ['Antler Hill Village'], ...acf },
});

it('reads the hours Biltmore writes in words, and nothing vaguer', () => {
  expect(biltmoreHours('11 a.m.–5 p.m.')).toEqual({ start: 660, end: 1020 });
  expect(biltmoreHours('4:30–8:15 p.m.')).toEqual({ start: 990, end: 1215 });
  expect(biltmoreHours('11–1 p.m.')).toEqual({ start: 660, end: 780 });
  expect(biltmoreHours('5 p.m.–12 a.m.')).toEqual({ start: 1020, end: 1440 });
  expect(biltmoreHours('6 p.m.')).toEqual({ start: 1080 });
  for (const vague of ['Select evenings', 'Open daily; hours may vary.', '', 'November 13-14', '6']) expect(biltmoreHours(vague)).toBeNull();
});

it('lists each stated weekday between the first and last dates, at the place on the estate', () => {
  const { items, diagnostics } = biltmoreItems([
    event('Live Music at the Bandstand', { e_event_start: '20260403', e_event_end: '20261017', days_of_the_week: ['friday', 'saturday'], hours: '4:30–8:15 p.m.' }),
    event('Village Illumination', { e_event_start: '20261103', e_event_end: '20270110', days_of_the_week: ['tuesday'], hours: '5 p.m.–12 a.m.' }),
    event('Christmas at the Estate', { e_event_start: '20261103', e_event_end: '20270110', days_of_the_week: ['monday'], hours: '' }),
    event('Day visit', { e_event_start: null, e_event_end: null, days_of_the_week: ['monday'], hours: 'Open daily' }),
    event('Spring', { e_event_start: '20270325', e_event_end: '20270520', days_of_the_week: ['monday'], hours: '' }),
  ], feed, now);
  expect(items.map((item) => [item.title, item.start, item.end, item.location])).toEqual([
    ['Live Music at the Bandstand', '2026-10-09T20:30:00.000Z', '2026-10-10T00:15:00.000Z', 'Antler Hill Village'],
    ['Live Music at the Bandstand', '2026-10-10T20:30:00.000Z', '2026-10-11T00:15:00.000Z', 'Antler Hill Village'],
    ['Live Music at the Bandstand', '2026-10-16T20:30:00.000Z', '2026-10-17T00:15:00.000Z', 'Antler Hill Village'],
    ['Live Music at the Bandstand', '2026-10-17T20:30:00.000Z', '2026-10-18T00:15:00.000Z', 'Antler Hill Village'],
    // Standard time after November 1; midnight is the next day's start.
    ['Village Illumination', '2026-11-03T22:00:00.000Z', '2026-11-04T05:00:00.000Z', 'Antler Hill Village'],
    ['Village Illumination', '2026-11-10T22:00:00.000Z', '2026-11-11T05:00:00.000Z', 'Antler Hill Village'],
    ['Village Illumination', '2026-11-17T22:00:00.000Z', '2026-11-18T05:00:00.000Z', 'Antler Hill Village'],
    ['Village Illumination', '2026-11-24T22:00:00.000Z', '2026-11-25T05:00:00.000Z', 'Antler Hill Village'],
    ['Village Illumination', '2026-12-01T22:00:00.000Z', '2026-12-02T05:00:00.000Z', 'Antler Hill Village'],
  ]);
  expect(new Set(items.map((item) => `${item.uid} ${item.occurrence}`)).size).toBe(items.length);
  // A season with no hours is reported; one outside the horizon says nothing.
  expect(diagnostics).toEqual({ 'missing event time': 1, 'missing event date': 1 });
});

it('names the place on the estate, files title words, and skips passholder exclusives', () => {
  const adapter = createBiltmoreAdapter(feed, [venue]);
  const skipped = [];
  const normalize = (raw) => biltmoreItems([raw], feed, now).items.map((item) => adapter.normalize(item, { now, skip: (reason) => skipped.push(reason) }));
  const [music] = normalize(event('Live Music at the Bandstand', { e_event_start: '20261009', e_event_end: '20261009', days_of_the_week: ['friday'], hours: '4:30–8:15 p.m.', cost: 'Included with admission' }));
  expect(music).toMatchObject({ venue: 'Contract Estate', category: 'music', sourceUrl: 'https://estate.example/event/live-music-at-the-bandstand/' });
  expect(music.description).toBe('Where: Antler Hill Village. Cost: Included with admission');
  expect(normalize(event('Autumn Dinner', { e_event_start: '20261016', e_event_end: '20261016', days_of_the_week: ['friday'], hours: '5-9 p.m.', sub_headline: 'Wine Club & Passholder Exclusive' }))).toEqual([null]);
  expect(skipped).toEqual(['restricted or room-booking listing']);
});

it('fails the run on a full page instead of missing events', async () => {
  const adapter = createBiltmoreAdapter(feed, [venue]);
  const list = (count) => async (url, options) => {
    expect([url, options]).toEqual([feed.url, { minIntervalMs: undefined, timeoutMs: undefined }]);
    return { ok: true, text: async () => JSON.stringify(Array.from({ length: count }, () => event('X', {}))) };
  };
  await expect(adapter.fetch({ now, fetchImpl: list(100) })).rejects.toThrow('full page');
  await expect(adapter.fetch({ now, fetchImpl: list(3) })).resolves.toMatchObject({ items: [] });
});

it('requires the estate venue and its places through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, campusRooms: undefined }], [venue])).not.toEqual([]);
  expect(validateRegistries([{ ...feed, venueHint: undefined, campusRooms: undefined }], [venue])).not.toEqual([]);
});

// Review findings, 2026-10-09.
describe('long seasons, shared meridiems and last nights', () => {
  it('lists a series that began over a year ago from today, not from its first date', () => {
    const { items, diagnostics } = biltmoreItems([event('Live Music at the Bandstand', {
      e_event_start: '20250801', e_event_end: '20261231', days_of_the_week: ['friday', 'saturday'], hours: '4:30–8:15 p.m.',
    })], feed, Date.parse('2026-10-09T16:00:00Z'));
    expect(items).toHaveLength(18);
    expect(items[0].start).toBe('2026-10-09T20:30:00.000Z');
    expect(diagnostics).toEqual({});
  });

  it('gives a start the other meridiem when sharing the end\'s would put it after the end', () => {
    expect(biltmoreHours('9–1 a.m.')).toEqual({ start: 1260, end: 1500 });
    expect(biltmoreHours('10–2 a.m.')).toEqual({ start: 1320, end: 1560 });
    expect(biltmoreHours('11–1 p.m.')).toEqual({ start: 660, end: 780 });
  });

  it('keeps a last night that runs past midnight while it is under way', () => {
    const { items } = biltmoreItems([event('New Year at the Village', {
      e_event_start: '20261231', e_event_end: '20261231', days_of_the_week: ['thursday'], hours: '9 p.m.–1 a.m.',
    })], feed, Date.parse('2027-01-01T05:30:00Z'));
    expect(items.map((item) => [item.start, item.end])).toEqual([['2027-01-01T02:00:00.000Z', '2027-01-01T06:00:00.000Z']]);
  });
});
