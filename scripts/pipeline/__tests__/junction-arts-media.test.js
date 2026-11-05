const { createTribeAdapter, parseTribePages } = require('../adapters/tribe');
const { readSourceFixture, processSourceItems } = require('../run-source');
const { safeDisplayHtmlText } = require('../feed-text');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const now = Date.parse('2026-10-08T14:33:07.040Z');
const feed = feeds.find((f) => f.id === 'junction-arts-media');
const adapter = createTribeAdapter(feed, venues);

it('keeps only timed public programs at the verified White River Junction media hub', () => {
  expect(validateRegistries([feed], venues)).toEqual([]);
  const result = readSourceFixture(adapter, adapter.fixturePath, { now });
  expect(result.rejectedCount).toBe(0);
  expect(result.records).toHaveLength(7);
  expect(result.skipped).toEqual({ 'restricted or room-booking listing': 2 });
  expect(result.diagnostics).toEqual({ 'missing occurrence time': 1 });
  for (const record of result.records) {
    expect(record).toMatchObject({ venue: 'JAM – Junction Arts & Media', locality: 'White River Junction', region: 'VT', countryCode: 'US', timezone: 'America/New_York', lat: 43.648502650436, lng: -72.318747657406, rating: 'general' });
    expect(serviceRegionForLocation(record).id).toBe('vermont-corridor');
  }
  expect(result.records.some((r) => r.title === 'Media Maker Monday' || r.title === 'Soul Santa 2026')).toBe(false);
  expect(result.records.find((r) => r.title.startsWith('Story JAM'))).toBeDefined();
});

it('preserves recurring course identities, the published age/cost and the Eastern DST change', () => {
  const result = readSourceFixture(adapter, adapter.fixturePath, { now });
  const course = result.records.filter((r) => r.title === 'Intro to Documentary Filmmaking');
  expect(course).toHaveLength(4);
  expect(new Set(course.map((r) => r.id)).size).toBe(4);
  expect(course.every((r) => /16\+/.test(r.description) && /\$140/.test(r.description) && r.rating !== 'family')).toBe(true);
  expect(course[0].startsAtIso).toBe('2026-10-27T21:45:00.000Z');
  expect(course[1].startsAtIso).toBe('2026-11-03T22:45:00.000Z');
  for (const record of course) expect(new Intl.DateTimeFormat('en', { timeZone: record.timezone, hour: 'numeric', minute: 'numeric', hour12: false }).format(new Date(record.startsAtIso))).toBe('17:45');
});

it('displays prose without embedded code or registration UI while retaining full rating evidence', () => {
  // Synthetic contract, never supplied to the registry as a real occurrence.
  const snapshot = parseTribePages([{ total_pages: 1, events: [{
    id: 'display-contract', title: 'Contract program', all_day: false,
    utc_start_date: '2026-10-12 22:00:00', utc_end_date: '2026-10-12 23:30:00',
    venue: { venue: 'JAM – Junction Arts & Media' },
    description: '<p>Public program description.</p><script>var widget = "<form>";</script>'
      + '<form><label>Registration: 21 and over</label><script>var register = true;</script></form><p>Bring a notebook.</p>',
  }] }], { now, timezone: feed.timezone, requireTimedEvents: true });
  const result = processSourceItems(adapter, snapshot, { now, overrides: {} });
  expect(result.records[0]).toMatchObject({ description: 'Public program description. Bring a notebook.', rating: 'mature' });
  expect(snapshot.items[0].description).toContain('21 and over');
  expect(snapshot.items[0].displayDescription).not.toMatch(/widget|register|Registration/);
});

it('bounds malformed embedded UI without deleting adjacent prose or raw-text code boundaries', () => {
  expect(safeDisplayHtmlText('Before </form> after')).toBe('Before after');
  expect(safeDisplayHtmlText('Before <form>registration without a close')).toBe('Before');
  expect(safeDisplayHtmlText('Before <script>"</form>"; code</script> after')).toBe('Before after');
  expect(safeDisplayHtmlText('Before <style>.a { color:red }</style> after')).toBe('Before after');
});
