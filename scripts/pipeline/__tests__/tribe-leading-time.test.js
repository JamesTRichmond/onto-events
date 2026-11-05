const { parseTribePages, createTribeAdapter } = require('../adapters/tribe');
const { processSourceItems } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Synthetic contract rows, kept outside the production fixture and registry.
const feed = feeds.find((item) => item.id === 'paramount-theatre-vt');
const now = Date.parse('2026-10-09T12:00:00Z');
const row = (fields = {}) => ({
  id: 1, global_id: 'fixture.example?id=1', title: 'Contract show',
  url: 'https://fixture.example/event/contract/', all_day: true, hide_from_listings: false,
  start_date: '2026-10-12 00:00:00', end_date: '2026-10-12 23:59:59',
  utc_start_date: '2026-10-12 04:00:00', utc_end_date: '2026-10-13 03:59:59',
  timezone: 'America/New_York', description: '<p><strong>6PM</strong></p>', venue: [], ...fields,
});
const parse = (events, options = {}) => parseTribePages([{ events, total_pages: 1 }], {
  now, timezone: feed.timezone, requireTimedEvents: true, leadingDescriptionTime: true, ...options,
});

it('recovers only an opted-in leading show time, preserving identity and omitting the date-only end', () => {
  const snapshot = parse([row({ description: '<p><strong>6PM<br />\n</strong><strong>Lobby doors open: 5PM</strong><br />\n<strong>Seating begins: 5:30PM</strong></p>' })]);
  expect(snapshot.items).toEqual([expect.objectContaining({ uid: 'fixture.example?id=1', start: '2026-10-12T22:00:00.000Z' })]);
  expect(snapshot.items[0]).not.toHaveProperty('end');
  expect(snapshot.diagnostics).toEqual({ 'description occurrence time': 1 });
  expect(parse([row()], { leadingDescriptionTime: false }).items).toEqual([]);
  const ordinary = parse([row()], { requireTimedEvents: false });
  expect(ordinary.items[0]).toMatchObject({ start: '2026-10-12T04:00:00.000Z', end: '2026-10-13T04:00:00.000Z' });
});

it('converts documented Eastern show times on both sides of DST without carrying a false midnight duration', () => {
  const snapshot = parse([
    row({ id: 2, global_id: 'fixture.example?id=2', start_date: '2026-10-17 00:00:00', utc_start_date: '2026-10-17 04:00:00', description: '<p><strong>7PM</strong></p>' }),
    row({ id: 3, global_id: 'fixture.example?id=3', start_date: '2026-11-06 00:00:00', utc_start_date: '2026-11-06 05:00:00', description: '<p><strong>7:30PM</strong></p>' }),
    row({ id: 4, global_id: 'fixture.example?id=4', description: '<p>12AM</p>' }),
    row({ id: 5, global_id: 'fixture.example?id=5', description: '<p>12PM</p>' }),
  ]);
  expect(snapshot.items.map((item) => item.start)).toEqual([
    '2026-10-17T23:00:00.000Z', '2026-11-07T00:30:00.000Z', '2026-10-12T04:00:00.000Z', '2026-10-12T16:00:00.000Z',
  ]);
  expect(snapshot.items.every((item) => !item.end)).toBe(true);
});

it.each([
  '<p><strong>Lobby doors open: 5PM</strong></p><p>6PM</p>',
  '<p><strong>Seating begins: 5:30PM</strong></p>',
  '<p>Show starts at 6PM</p>', '<p>6PM or 8PM</p>', '<p>6PM<br />8PM</p>',
  '<p>6PM</p><p>8PM</p>', '<p>6PM</p><p>Show starts: 7PM</p>',
  '<p>6PM<br />Show starts: 7PM</p>', '<p>6PM<br />Lobby doors open: 5PM<br />7PM</p>',
  '<p>0PM</p>', '<p>13PM</p>', '<p>6:60PM</p>', '<p>6</p>',
  '<script>6PM</script><p>6PM</p>', '<div><p>6PM</p></div>',
  `<p>${' '.repeat(1025)}6PM</p>`, '<p><span style="display:none">6PM</span></p>',
])('leaves unknown, ambiguous and out-of-contract descriptions excluded: %s', (description) => {
  const snapshot = parse([row({ description })]);
  expect(snapshot.items).toEqual([]);
  expect(snapshot.diagnostics).toEqual({ 'missing occurrence time': 1 });
});

it('stops conflict checks at the show biography rather than choosing a clock from it', () => {
  const snapshot = parse([row({ description: '<p>6PM</p><p>Lobby doors open at 5PM</p><hr /><p>An earlier concert in 1972 started at 8PM.</p>' })]);
  expect(snapshot.items[0]).toMatchObject({ start: '2026-10-12T22:00:00.000Z' });
});

it.each([
  { timezone: 'America/Chicago' }, { timezone: undefined },
  { start_date: '2026-10-13 00:00:00' }, { start_date: '2026-10-12 02:00:00' },
  { start_date: '2026-02-30 00:00:00', utc_start_date: '2026-03-02 05:00:00' },
  { utc_start_date: '2026-10-12 05:00:00' }, { utc_start_date: '2026-10-11 04:00:00' },
  { all_day: undefined },
  { start_date: '2026-11-01 00:00:00', utc_start_date: '2026-11-01 04:00:00', description: '<p>1:30AM</p>' },
])('rejects inconsistent metadata or an ambiguous local clock: %j', (fields) => {
  const snapshot = parse([row(fields)]);
  expect(snapshot.items).toEqual([]);
  expect(snapshot.diagnostics).toEqual({ 'missing occurrence time': 1 });
});

it('rejects a nonexistent spring-forward clock rather than moving the show by an hour', () => {
  const snapshot = parse([row({ start_date: '2027-03-14 00:00:00', utc_start_date: '2027-03-14 05:00:00', description: '<p>2:30AM</p>' })], { now: Date.parse('2027-03-01T12:00:00Z') });
  expect(snapshot.items).toEqual([]);
  expect(snapshot.diagnostics).toEqual({ 'missing occurrence time': 1 });
});

it('keeps timed provider rows, listing exclusions, duplicates, cancellation and source-scoped identity intact', () => {
  const snapshot = parse([
    row(), row(), row({ global_id: 'hidden', hide_from_listings: true }),
    row({ global_id: 'teaser', title: 'TONIGHT | Concert' }),
    row({ global_id: 'cancelled', title: 'Cancelled: Contract show' }),
    row({ global_id: 'timed', all_day: false, utc_start_date: '2026-10-12 23:00:00', utc_end_date: '2026-10-13 01:00:00', description: '<p>Wrong prose: 5PM</p>' }),
  ]);
  expect(snapshot.items.map((item) => item.uid)).toEqual(['fixture.example?id=1', 'cancelled', 'timed']);
  expect(snapshot.items.at(-1)).toMatchObject({ start: '2026-10-12T23:00:00.000Z', end: '2026-10-13T01:00:00.000Z' });
  const result = processSourceItems(createTribeAdapter(feed, venues), snapshot, { now, overrides: {} });
  expect(result.records.every((record) => record.id.startsWith('tribe-paramount-theatre-vt-') && record.sourceName === feed.name)).toBe(true);
  expect(result.records.find((record) => record.title.startsWith('Cancelled'))).toMatchObject({ isCancelled: true });
});

it.each([
  ['<p><strong>Rating:</strong> R</p>', 'mature'],
  ['<p><strong>Rating:</strong> NC-17</p>', 'mature'],
  ['<p><strong>Rating:</strong> PG</p>', 'general'],
  ['<p><strong>Rating:</strong> PG-13</p>', 'general'],
  ['<p>Rating: Not rated</p>', 'general'],
  ['<p>Artist R is rating this venue.</p>', 'general'],
  ['<p><strong>Rating:</strong> R-rated artist showcase</p>', 'general'],
  ['<p>Age restriction: 18+ No exceptions.</p>', 'mature'],
])('retains explicit mature restrictions without promoting movie ratings to Family: %s', (ratingText, rating) => {
  const snapshot = parse([row({ description: `<p>6PM</p>${ratingText}` })]);
  const result = processSourceItems(createTribeAdapter(feed, venues), snapshot, { now, overrides: {} });
  expect(result.records[0]).toMatchObject({ rating, ratingBasis: rating === 'mature' ? 'signal' : 'listing' });
});

it('keeps an explicit R-film restriction if the opted-in publisher later supplies correct timed metadata', () => {
  const snapshot = parse([row({ all_day: false, utc_start_date: '2026-10-12 22:00:00', description: '<p>6PM</p><p>Rating: R</p>' })]);
  const result = processSourceItems(createTribeAdapter(feed, venues), snapshot, { now, overrides: {} });
  expect(result.records[0]).toMatchObject({ rating: 'mature', ratingBasis: 'signal' });
});

it('validates recovery as an explicit timed Tribe contract rather than a global fallback', () => {
  expect(validateRegistries([{ ...feed, leadingDescriptionTime: true }], venues)).toEqual([]);
  for (const change of [{ leadingDescriptionTime: 'yes' }, { leadingDescriptionTime: false }, { requireTimedEvents: false }, { kind: 'ics' }]) {
    expect(validateRegistries([{ ...feed, leadingDescriptionTime: true, ...change }], venues)).toContain('Invalid feed: paramount-theatre-vt');
  }
});
