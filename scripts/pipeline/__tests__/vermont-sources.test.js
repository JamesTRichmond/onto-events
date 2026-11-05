const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { isPlaceholderEvent } = require('../calendar-record');
const feeds = require('../../../data/feeds.json');
const now = Date.parse('2026-10-08T04:58:55.880Z');
const fixture = (name) => {
  const adapter = SOURCES.find((source) => source.sourceName === name);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

it('keeps library operating notices out while preserving actual public programs', () => {
  for (const title of ['Library Closed', 'Library Open 12PM-8PM Today', 'Library is closed for staff training']) {
    expect(isPlaceholderEvent(title)).toBe(true);
  }
  for (const title of ['Open Mic at the Library', 'Closed Circuit Film Screening', 'Library Open House', 'Book Sale']) {
    expect(isPlaceholderEvent(title)).toBe(false);
  }
});

it('declares Vermont geography, venue-local time and the published library crawl delays', () => {
  const owned = new Set(['bixby-library', 'kellogg-hubbard-library', 'paramount-theatre-vt']);
  const vt = feeds.filter((feed) => owned.has(feed.id));
  expect(vt.map((feed) => feed.name)).toEqual(expect.arrayContaining(['Bixby Memorial Free Library', 'Kellogg-Hubbard Library', 'Paramount Theatre Vermont']));
  expect(vt.every((feed) => feed.timezone === 'America/New_York')).toBe(true);
  expect(vt.filter((feed) => feed.id.includes('library')).every((feed) => feed.minIntervalMs === 10000 && feed.venueHint === null)).toBe(true);
});

it('maps real Bixby public rooms to the verified building and leaves a missing location unresolved', () => {
  const result = fixture('Bixby Memorial Free Library');
  expect(result.records).toHaveLength(9);
  expect(result.skipped).toEqual({ 'missing location': 1 });
  for (const record of result.records) {
    expect(validateRecord(record).ok).toBe(true);
    expect(record).toMatchObject({ venue: 'Bixby Memorial Free Library', region: 'VT', locality: 'Vergennes', lat: 44.167131164069, lng: -73.253907929571 });
  }
  expect(result.records.find((r) => r.title === 'Storytime').rating).toBe('family');
  expect(result.records.filter((r) => r.title.includes('Mah Jongg')).map((r) => r.sourceEventId)).toHaveLength(1);
});

it('keeps real Montpelier programs, drops closure notices and does not map the off-site residence', () => {
  const result = fixture('Kellogg-Hubbard Library');
  expect(result.records).toHaveLength(10);
  expect(result.skipped).toEqual({ 'placeholder event': 2, 'unmapped venue': 1 });
  for (const record of result.records) expect(record).toMatchObject({ venue: 'Kellogg-Hubbard Library', region: 'VT', locality: 'Montpelier', lat: 44.261758723719, lng: -72.573387278042 });
  const afterDST = result.records.find((record) => record.startsAtIso.startsWith('2026-11-02'));
  expect(afterDST).toMatchObject({ startsAtIso: '2026-11-02T17:00:00.000Z', timezone: 'America/New_York' });
  expect(new Intl.DateTimeFormat('en', { timeZone: afterDST.timezone, hour: 'numeric', hour12: false }).format(new Date(afterDST.startsAtIso))).toBe('12');
});

it('recovers real theater show clocks, excludes unsupported date-only markup and retains mature restrictions', () => {
  const result = fixture('Paramount Theatre Vermont');
  expect(result.records).toHaveLength(22);
  expect(result.records.find((record) => record.title.startsWith('Fraggle Rock'))).toMatchObject({ startsAtIso: '2026-10-12T22:00:00.000Z', venue: 'Paramount Theatre', locality: 'Rutland City', region: 'VT', timezone: 'America/New_York' });
  expect(result.records.find((record) => record.title === 'Asleep at the Wheel')).toMatchObject({ startsAtIso: '2026-10-17T23:00:00.000Z' });
  expect(result.records.find((record) => record.title === 'Get the Led Out')).toMatchObject({ startsAtIso: '2026-11-07T00:30:00.000Z' });
  expect(result.records.every((record) => !record.endsAtIso)).toBe(true);
  expect(result.records.filter((record) => record.rating === 'mature').map((record) => record.title)).toEqual([
    'AUSTRALIA’S THUNDER FROM DOWN UNDER', 'Movie: Halloween', 'A Drag Queen Christmas',
  ]);
  expect(result.diagnostics).toEqual({ 'description occurrence time': 22, 'missing occurrence time': 1 });
  expect(result.rejectedCount).toBe(0);
});
