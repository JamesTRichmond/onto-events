jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const fs = require('node:fs');
const { calendarAdapters } = require('../sources');
const { readSourceFixture, processSourceItems, fetchSourceRecords } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const proposed = require('../../../docs/sources/vermont-round-two/batch-04-new-publishers/feeds.json');
const proposedVenues = require('../../../docs/sources/vermont-round-two/batch-04-new-publishers/venues.json');
const liveFeeds = require('../../../data/feeds.json');
const liveVenues = require('../../../data/venues.json');
const venues = [...liveVenues, ...proposedVenues.filter((v) => !liveVenues.some((live) => live.name === v.name))];
const proposedAdapter = (id) => calendarAdapters([proposed.find((f) => f.id === id)], venues)[0];
const captureFor = (a) => JSON.parse(fs.readFileSync(a.fixturePath, 'utf8'));
const clockFor = (a) => Date.parse(captureFor(a).capture.evaluationClock);
const body = JSON.parse(fs.readFileSync('scripts/pipeline/fixtures/tribe/pierson-library.json', 'utf8'));
const now = Date.parse(body.capture.evaluationClock);
const venue = { name: 'Pierson Library', aliases: [], address: '5376 Shelburne Road, Shelburne, VT 05482', lat: 44.38, lng: -73.227, locality: 'Shelburne', region: 'VT', countryCode: 'US', kind: 'library', allAges: 'unknown' };
const feed = { id: 'pierson-library', name: 'Pierson Library', kind: 'tribe', sourceKind: 'community', serviceRegion: 'vermont-corridor', timezone: 'America/New_York', url: 'https://piersonlibrary.org/wp-json/tribe/events/v1/events', venueHint: 'Pierson Library', defaultCategory: 'community', defaultRating: 'general', fixturePath: 'scripts/pipeline/fixtures/tribe/pierson-library.json', requireTimedEvents: true, retireMissing: false, omitContactDetails: true, excludeOnlineOnly: true };
const adapter = (overrides = {}) => calendarAdapters([{ ...feed, ...overrides }], [venue])[0];

it('retains real rolling public programmes without retiring missing rows and removes contact details from card copy', () => {
  const result = readSourceFixture(adapter(), undefined, { now });
  expect(result.records.length).toBeGreaterThan(25);
  expect(result.retireMissing).toBe(false);
  expect(result.records.every((r) => !/@|\b\d{3}[.-]\d{3}[.-]\d{4}\b|\[contact omitted\]/i.test(r.description))).toBe(true);
  expect(result.records.every((r) => r.description.includes('See the publisher'))).toBe(true);
});

it('keeps full source restrictions ahead of factual card summaries, and preserves legacy description behavior', () => {
  const a = adapter();
  const raw = a.parseFixture(JSON.stringify(body), { now }).items.find((x) => x.title === 'Creative Writing Support Group');
  expect(raw).toBeDefined();
  expect(a.normalize({ ...raw, description: raw.description + ' Ages 18+ only.' }, { now }).rating).toBe('mature');
  for (const description of ['This event is private.', 'This event is online-only.']) {
    expect(processSourceItems(a, { items: [{ ...raw, description }] }, { now }).records).toEqual([]);
  }
  const original = adapter({ omitContactDetails: undefined, retireMissing: undefined });
  const originalRaw = original.parseFixture(JSON.stringify(body), { now }).items.find((x) => x.uid === raw.uid);
  expect(original.normalize(originalRaw, { now }).description).toContain('generative writing exercise');
  expect(a.normalize(raw, { now }).id).toBe(original.normalize(originalRaw, { now }).id);
});

it('keeps the real in-person storytime when its prose links an online event calendar, while excluding online-only attendance', () => {
  const a = adapter();
  const raw = a.parseFixture(JSON.stringify(body), { now }).items.find((x) => x.title === 'Not-So-Scary Storytime');
  expect(raw.description).toMatch(/online event calendar/i);
  expect(a.normalize(raw, { now })).toMatchObject({ title: raw.title, venue: venue.name, rating: 'family' });
  expect(a.normalize({ ...raw, description: raw.description + ' This event is online-only.' }, { now })).toBeNull();
});

it('enrolls seven reviewed publisher contracts, public venues and targeted refresh choices in the candidate branch', () => {
  expect(validateRegistries(liveFeeds, require('../../../data/venues.json'))).toEqual([]);
  expect(new Set(proposed.map((f) => new URL(f.url).hostname)).size).toBe(7);
  for (const f of proposed) {
    const { notes: proposedNotes, ...contract } = f;
    const { notes: activeNotes, ...registered } = liveFeeds.find((live) => live.id === f.id) ?? {};
    expect(registered).toEqual(contract);
    expect(activeNotes).toMatch(/Reviewed activation candidate/);
    expect(proposedNotes).toMatch(/Proposal only/);
    expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain(`- '${f.name}'`);
  }
  for (const venue of proposedVenues) expect(require('../../../data/venues.json').find((v) => v.name === venue.name)).toEqual(venue);
});

it.each([
  ['pierson-library', 29], ['vins-nature-center', 82], ['shelburne-museum', 18],
  ['vermont-humanities', 9], ['saint-michaels-public-arts', 1], ['norman-williams-library', 95],
  ['the-tropic-waterbury', 4],
])('carries real %s occurrences through the public catalog and PWA boundary', (id, count) => {
  const a = proposedAdapter(id);
  const result = readSourceFixture(a, undefined, { now: clockFor(a) });
  expect(result.records).toHaveLength(count);
  expect(result.rejectedCount).toBe(0);
  expect(result.retireMissing).toBe(false);
  expect(new Set(result.records.map((r) => r.id)).size).toBe(count);
  for (const r of result.records) {
    expect(r).toMatchObject({ region: 'VT', countryCode: 'US', sourceName: a.sourceName, timezone: 'America/New_York' });
    expect(r.description).toContain('See the publisher');
    expect(r.description).not.toMatch(/@|\[contact omitted\]/);
    expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(r)))).not.toBeNull();
  }
});

it('keeps the exact reviewed public categories even when a server ignores category filtering', () => {
  const read = (id) => { const a = proposedAdapter(id); return readSourceFixture(a, undefined, { now: clockFor(a) }); };
  const pierson = read('pierson-library');
  expect(pierson.records.some((r) => /committee|Haunted Town Hall|Tech Help/i.test(r.title))).toBe(false);
  const vins = read('vins-nature-center');
  expect(vins.records.some((r) => /auction|coffee|Hoots|Halloween/i.test(r.title))).toBe(false);
  expect(vins.unmapped).toEqual({});
  const college = read('saint-michaels-public-arts');
  expect(college.records[0].title).toMatch(/Gallery Reception/);
  expect(college.skipped).toEqual({ 'missing location': 1 });
  expect(college.diagnostics).toEqual({ 'unreviewed public category': 14 });
  const library = read('norman-williams-library');
  expect(library.records.some((r) => /Board of Trustees|Closed/i.test(r.title))).toBe(false);
  const humanities = read('vermont-humanities');
  expect(humanities.records.every((r) => ['Burlington', 'Montpelier', 'Barre City', 'Royalton', 'Charlotte'].includes(r.locality))).toBe(true);
  expect(humanities.unmapped['Vermont State University Castleton, Jeffords Auditorium']).toBe(1);
});

it('uses the same three real library pages during a fetch, preserves DST clocks, and fails on a missing page', async () => {
  const a = proposedAdapter('norman-williams-library');
  const x = captureFor(a), now = clockFor(a), requests = [];
  const politeFetch = async (url) => {
    requests.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return { ok: true, json: async () => x.pages[page - 1] };
  };
  const result = await fetchSourceRecords(a, { now, overrides: {}, politeFetch });
  expect(result.records).toEqual(readSourceFixture(a, undefined, { now }).records);
  expect(requests).toHaveLength(3);
  expect(result.retireMissing).toBe(false);
  const mahjong = result.records.filter((r) => r.title === 'Play Mahjong');
  expect(mahjong.find((r) => r.startsAtIso.startsWith('2026-10-30')).startsAtIso).toBe('2026-10-30T17:00:00.000Z');
  expect(mahjong.find((r) => r.startsAtIso.startsWith('2026-11-06')).startsAtIso).toBe('2026-11-06T18:00:00.000Z');
  await expect(fetchSourceRecords(a, { now, overrides: {}, politeFetch: async (url) =>
    new URL(url).searchParams.get('page') === '2' ? { ok: false, status: 503 } : politeFetch(url),
  })).rejects.toThrow('503');
  const partial = a.parseFixture(JSON.stringify({ pages: [x.pages[0]] }), { now });
  expect(partial.retireMissing).toBe(false);
  expect(partial.diagnostics['page cap']).toBe(2);
});

it('preserves cancellation ownership and rejects unknown venues without leaking feed aliases', () => {
  const a = proposedAdapter('shelburne-museum');
  const now = clockFor(a), event = a.parseFixture(JSON.stringify(captureFor(a)), { now }).items[0];
  const original = a.normalize(event, { now });
  expect(a.normalize({ ...event, title: `Cancelled: ${event.title}` }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  expect(a.normalize({ ...event, location: 'Private Residence' }, { now })).toBeNull();
  const unscoped = calendarAdapters([{ ...proposed.find((f) => f.id === 'shelburne-museum'), venueAliases: undefined }], venues)[0];
  expect(unscoped.normalize(event, { now })).toBeNull();
});

it('defers the real adult after-hours programme instead of treating a reference to children’s daytime programming as Family access', () => {
  const a = proposedAdapter('norman-williams-library'), now = clockFor(a);
  const event = a.parseFixture(JSON.stringify(captureFor(a)), { now }).items.find((r) => r.title === 'Word Games | Library After Hours');
  expect(event.description).toContain('social evenings for adults');
  expect(event.description).toContain('children’s programming');
  expect(event.description).toContain('BYOB');
  expect(a.normalize(event, { now })).toBeNull();
});

it('keeps the Tropic’s real clocks, paid adult workshop and conservative brewery age policy', () => {
  const a = proposedAdapter('the-tropic-waterbury'), now = clockFor(a);
  const result = readSourceFixture(a, undefined, { now });
  expect(result.records).toHaveLength(4);
  expect(result.records.every((r) => r.rating === 'mature')).toBe(true);
  expect(result.records.find((r) => r.title.includes('Watercolor'))).toMatchObject({ startsAtIso: '2026-10-25T17:00:00.000Z', endsAtIso: '2026-10-25T18:00:00.000Z' });
  expect(result.records.find((r) => r.title.includes('Trick or Treat')).rating).toBe('mature');
  const x = captureFor(a), raw = a.parseFixture(JSON.stringify(x), { now }).items[0];
  expect(a.normalize({ ...raw, location: 'Unreviewed Private Venue' }, { now })).toBeNull();
});

it('keeps private and online-only restrictions found on a Squarespace detail page even when RSS omits them', () => {
  const a = proposedAdapter('the-tropic-waterbury'), now = clockFor(a);
  const x = captureFor(a);
  const url = 'https://www.thetropic.com/calendar/trivia-oct29';
  const ld = require('../jsonld-events').jsonLdEvents(x.pages[url])[0];
  for (const restriction of ['This event is private.', 'This event is online-only.']) {
    const changed = { ...x, pages: { ...x.pages, [url]: `<script type="application/ld+json">${JSON.stringify({ ...ld, description: restriction })}</script>` } };
    const event = a.parseFixture(JSON.stringify(changed), { now }).items.find((r) => r.url === url);
    expect(event).toBeDefined();
    expect(a.normalize(event, { now })).toBeNull();
  }
});

it('does not turn the real offsite tasting and brewers festival into brewery events when replayed at their original dates', () => {
  const a = proposedAdapter('the-tropic-waterbury'), x = captureFor(a);
  for (const [clock, suffix] of [
    ['2026-06-25T12:00:00Z', '/tasting-at-the-local-wine-beer'],
    ['2026-07-15T12:00:00Z', '/vermont-brewers-festival-2026'],
  ]) {
    const now = Date.parse(clock);
    const raw = a.parseFixture(JSON.stringify(x), { now }).items.find((r) => r.url.endsWith(suffix));
    expect(raw).toBeDefined();
    expect(raw.location).toBe('The Tropic');
    expect(a.normalize(raw, { now })).toBeNull();
  }
  const now = clockFor(a), raw = a.parseFixture(JSON.stringify(x), { now }).items.find((r) => r.title === 'Trivia with Kristen');
  expect(a.normalize({ ...raw, title: 'Unreviewed Offsite Festival' }, { now })).toBeNull();
  const original = a.normalize(raw, { now });
  expect(a.normalize({ ...raw, title: 'Cancelled: Trivia with Kristen' }, { now })).toMatchObject({ id: original.id, isCancelled: true });
});
