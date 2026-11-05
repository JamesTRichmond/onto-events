const { calendarRecord } = require('../calendar-record');
const { parseTribePages } = require('../adapters/tribe');
const { validateRegistries } = require('../registry-validation');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

const feed = feeds.find((value) => value.id === 'bixby-library');
const venue = venues.find((value) => value.name === 'Bixby Memorial Free Library');
const now = Date.parse('2026-10-09T12:00:00Z');
// Synthetic policy cases only; these records never enter supply fixtures.
const event = {
  uid: 'category-contract', title: 'Beginner Mah Jongg Meetup', description: '',
  location: venue.name, start: '2026-10-13T22:00:00.000Z',
  end: '2026-10-14T00:00:00.000Z', timezone: feed.timezone,
};
const normalized = (overrides, policy) => calendarRecord({ ...event, ...overrides }, {
  feed: { ...feed, categoryByTitle: { 'Beginner Mah Jongg Meetup': 'games' }, ...policy }, venues,
});

it('classifies reviewed exact titles without changing occurrence identity, rating or location', () => {
  const original = calendarRecord(event, { feed: { ...feed, categoryByTitle: undefined }, venues });
  const result = normalized();
  expect(result.category).toBe('games');
  expect({ ...result, category: original.category }).toEqual(original);
});

it('keeps unknown titles, spelling changes and other sources on their own default', () => {
  expect(normalized({ title: 'Beginner Mah Jongg Meetup for Members' }).category).toBe('learning');
  expect(normalized({ title: 'beginner mah jongg meetup' }).category).toBe('learning');
  expect(normalized({}, { categoryByTitle: undefined }).category).toBe('learning');
});

it('preserves an explicit publisher category and complete mature-content evidence', () => {
  expect(normalized({ category: 'arts' }).category).toBe('arts');
  expect(normalized({ description: 'Adults only, 21+.' })).toMatchObject({ category: 'games', rating: 'mature' });
});

it('ignores inherited title properties and preserves cancellation identity', () => {
  expect(normalized({ title: 'toString' }).category).toBe('learning');
  expect(normalized({ title: 'Cancelled: Beginner Mah Jongg Meetup' })).toMatchObject({
    id: normalized().id, sourceEventId: normalized().sourceEventId, isCancelled: true,
  });
});

const row = (id, categories) => ({
  id, global_id: `category.fixture.invalid?id=${id}`, title: `Policy case ${id}`,
  all_day: false, hide_from_listings: false, utc_start_date: '2026-10-13 22:00:00',
  utc_end_date: '2026-10-14 00:00:00', categories,
});
const pages = [{ total_pages: 1, events: [
  row(1, [{ slug: 'vermont-car-shows' }]), row(2, [{ slug: 'events' }]),
  row(3, undefined), row(4, 'vermont-car-shows'), row(5, [null]),
] }];

it('requires a reviewed public category even when the upstream ignores its category query', () => {
  const result = parseTribePages(pages, {
    now, timezone: feed.timezone, publicCategorySlugs: ['vermont-car-shows'],
  });
  expect(result.items.map((value) => value.uid)).toEqual(['category.fixture.invalid?id=1']);
  expect(result.diagnostics).toEqual({ 'unreviewed public category': 4 });
});

it('leaves existing unscoped calendars unchanged', () => {
  expect(parseTribePages(pages, { now, timezone: feed.timezone }).items).toHaveLength(5);
});

it('validates bounded title and public-category policies', () => {
  expect(validateRegistries([{ ...feed,
    categoryByTitle: { 'Beginner Mah Jongg Meetup': 'games', 'Book Sale': 'sales' },
    publicCategorySlugs: ['vermont-car-shows'],
  }], venues)).toEqual([]);
});

it.each([
  { categoryByTitle: null }, { categoryByTitle: [] }, { categoryByTitle: {} },
  { categoryByTitle: { ' Book Sale': 'sales' } }, { categoryByTitle: { 'Book Sale': 'private' } },
  { categoryByTitle: { ['x'.repeat(201)]: 'sales' } },
  { categoryByTitle: Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`Title ${index}`, 'games'])) },
  { publicCategorySlugs: null }, { publicCategorySlugs: [] }, { publicCategorySlugs: 'events' },
  { publicCategorySlugs: ['events', 'events'] }, { publicCategorySlugs: ['Events'] },
  { publicCategorySlugs: ['x'.repeat(81)] },
  { publicCategorySlugs: Array.from({ length: 21 }, (_, index) => `slug-${index}`) },
  { kind: 'ics', publicCategorySlugs: ['events'] },
])('rejects an ambiguous or misplaced category policy: %j', (policy) => {
  expect(validateRegistries([{ ...feed, ...policy }], venues)).toContain(`Invalid feed: ${feed.id}`);
});
