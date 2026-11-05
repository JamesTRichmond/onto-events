const fs = require('node:fs');
const { createSimcalAdapter } = require('../adapters/simcal');
const { calendarAdapters, SOURCES } = require('../sources');
const { readSourceFixture, processSourceItems } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { syncSources } = require('../sync-sources');
const liveFeeds = require('../../../data/feeds.json');
const liveVenues = require('../../../data/venues.json');
const proposedFeeds = require('../../../docs/sources/proposals/feeds.proposed.json');
const proposedVenues = require('../../../docs/sources/proposals/venues.proposed.json');

const feed = proposedFeeds.find((item) => item.id === 'first-united-methodist-burlington-vt');
const venue = proposedVenues.find((item) => item.name === feed.venueHint);
const venues = [...liveVenues, ...proposedVenues.filter((item) => !liveVenues.some((live) => live.name === item.name))];
const adapter = createSimcalAdapter(feed, venues);
const now = Date.parse('2026-10-09T17:20:38.000Z');
const html = fs.readFileSync(adapter.fixturePath, 'utf8');
const blocks = [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map((match) => match[0]);
const event = blocks[1];
const page = (body) => html.slice(0, html.indexOf(blocks[0])) + body + html.slice(html.indexOf(blocks.at(-1)) + blocks.at(-1).length);
const run = (body = html, at = now) => processSourceItems(adapter, adapter.parseFixture(body, { now: at }), { now: at, overrides: {} });
const changeTimes = (block, start, end) => block
  .replace(/data-event-start="\d+"/g, `data-event-start="${Date.parse(start) / 1000}"`)
  .replace(/data-event-end="\d+"/g, `data-event-end="${Date.parse(end) / 1000}"`)
  .replace(/content="2026-10-11T09:45:00-04:00"/g, `content="${start}"`)
  .replace(/content="2026-10-11T10:45:00-04:00"/g, `content="${end}"`);

it('normalizes only real upcoming public worship at the publisher address, with distinct source-owned identities', () => {
  const result = readSourceFixture(adapter, undefined, { now });
  expect(result).toMatchObject({ validCount: 3, rejectedCount: 0, truncated: true, retireMissing: false });
  expect(result.records.map((record) => record.startsAtIso)).toEqual([
    '2026-10-11T13:45:00.000Z', '2026-10-18T13:45:00.000Z', '2026-10-25T13:45:00.000Z',
  ]);
  expect(new Set(result.records.map((record) => record.id)).size).toBe(3);
  for (const record of result.records) {
    expect(record).toMatchObject({ category: 'community', rating: 'general', source: 'live',
      sourceName: feed.name, sourceUrl: feed.url, venue: venue.name, area: venue.address,
      locality: 'Burlington', region: 'VT', timezone: 'America/New_York', attendees: 0 });
    expect(record.id.startsWith(`simcal-${feed.id}-`)).toBe(true);
    expect(record.eventFacts).toBeUndefined();
    expect(record.description).toMatch(/approximate/i);
    expect(record.description).not.toMatch(/<|eid=|@/);
  }
});

it('registers the reviewed worship contract and venue without changing its public scope', () => {
  const { notes: proposedNotes, ...reviewed } = feed;
  const { notes: activeNotes, ...registered } = liveFeeds.find((item) => item.id === feed.id);
  expect(registered).toEqual(reviewed);
  expect(proposedNotes).toMatch(/Proposed only/);
  expect(activeNotes).toMatch(/Reviewed activation candidate/);
  expect(liveVenues.find((item) => item.name === venue.name)).toEqual(venue);
  expect(SOURCES.find((item) => item.sourceName === feed.name).idPrefix).toBe(adapter.idPrefix);
  expect(validateRegistries([feed], venues)).toEqual([]);
  expect(calendarAdapters([feed], venues)[0].idPrefix).toBe(adapter.idPrefix);
});

it.each([
  { calendarId: undefined }, { calendarId: '0' }, { calendarId: '1726/other' },
  { publicTitles: undefined }, { publicTitles: [] }, { publicTitles: [''] },
  { publicTitles: [feed.publicTitles[0], feed.publicTitles[0]] }, { venueHint: undefined },
  { kind: 'ics' },
])('rejects invalid or misplaced reviewed calendar options %j', (patch) => {
  expect(validateRegistries([{ ...feed, ...patch }], venues)).toContain(`Invalid feed: ${feed.id}`);
});

it('ignores bookings, online-only, unreviewed and personal rows before parsing their dates or links', () => {
  for (const title of ['Private group booking', 'Worship Service - Zoom Only', 'Choir rehearsal', 'Memorial Service for Test Person']) {
    const row = event.replaceAll('Worship Service - In-Person, YouTube &amp; Zoom', title)
      .replaceAll('data-event-start=', 'broken-start=').replaceAll('data-event-end=', 'broken-end=');
    expect(run(page(row)).records).toEqual([]);
  }
});

it('uses full eligible-row evidence for mature and restricted access without exposing its prose', () => {
  const mature = run(page(event.replace('<div></div>', '<div>21+ only. Private test contact is hidden.</div>')));
  expect(mature.records[0].rating).toBe('mature');
  expect(mature.records[0].description).not.toContain('Private test contact');
  const restricted = run(page(event.replace('<div></div>', '<div>Members only. Not open to the public.</div>')));
  expect(restricted.records).toEqual([]);
  expect(restricted.skipped['restricted or room-booking listing']).toBe(1);
});

it('fails closed on unsupported entities in eligible safety prose', () => {
  expect(() => run(page(event.replace('<div></div>', '<div>members&hyphen;only</div>')))).toThrow();
  expect(run(page(event.replace('<div></div>', '<div>21&#43; only</div>'))).records[0].rating).toBe('mature');
});

it.each(['Members&ndash;only', 'Members&mdash;only', 'Members ‑ only', 'Members - only'])('excludes a private occurrence even when the publisher uses a typographic separator: %s', (restriction) => {
  const result = run(page(event.replace('<div></div>', `<div>${restriction}</div>`)));
  expect(result.records).toEqual([]);
  expect(result.skipped['restricted or room-booking listing']).toBe(1);
});

it('does not adopt eligible rows owned by another or a nested calendar', () => {
  const foreign = event.replaceAll('simcal-events-calendar-1726', 'simcal-events-calendar-999');
  expect(() => run(page(foreign))).toThrow();
  const nested = `<div class="simcal-calendar" data-calendar-id="999" data-timezone="America/New_York">${event}</div>`;
  expect(() => run(page(nested))).toThrow();
});

it('ignores fake calendar markup inside raw code even after a misleading closing prefix', () => {
  const misleading = `<script>const example = '</scripture>${html}';</script>`;
  expect(run(misleading + html).records).toHaveLength(3);
});

it('does not turn an explicitly changed off-site or online location into the church', () => {
  for (const location of ['Private home, 100 Test Street', 'Zoom', 'Unknown off-site hall']) {
    const row = event.replace(/(<meta itemprop="(?:name|address)" content=")Worship Service - In-Person, YouTube &amp; Zoom/g, `$1${location}`);
    expect(run(page(row)).records).toEqual([]);
  }
});

it('checks an explicit meeting place in publisher prose before using the church hint', () => {
  const changed = page(event.replace('<div></div>', '<div>Meet at Unknown off-site hall.</div>'));
  expect(run(changed).records).toEqual([]);
  expect(run(changed).skipped['unmapped venue']).toBe(1);
});

it('retains a cancelled occurrence identity and keeps identity stable across a time correction', () => {
  const original = run(page(event)).records[0];
  const cancelled = run(page(event.replaceAll('Worship Service - In-Person, YouTube &amp; Zoom', 'Cancelled: Worship Service - In-Person, YouTube &amp; Zoom'))).records[0];
  expect(cancelled).toMatchObject({ id: original.id, isCancelled: true });
  const shifted = changeTimes(event, '2026-10-11T10:00:00-04:00', '2026-10-11T11:00:00-04:00');
  expect(run(page(shifted)).records[0]).toMatchObject({ id: original.id, startsAtIso: '2026-10-11T14:00:00.000Z' });
});

it.each(['Cancelled ', 'Canceled ', 'Cancelled:', 'Canceled — '])('recognizes an unambiguous cancellation prefix with optional punctuation: %s', (prefix) => {
  const original = run(page(event)).records[0];
  const cancelled = event.replaceAll('Worship Service - In-Person, YouTube &amp; Zoom', `${prefix}Worship Service - In-Person, YouTube &amp; Zoom`);
  expect(run(page(cancelled)).records[0]).toMatchObject({ id: original.id, isCancelled: true });
});

it('never treats a rendered month or a disappeared row as a complete retirement snapshot', () => {
  expect(adapter.parseFixture(page(''), { now })).toMatchObject({ items: [], truncated: true, retireMissing: false });
  expect(run(html, Date.parse('2026-11-01T00:00:00Z')).records).toEqual([]);
  expect(adapter.parseFixture(html, { now: Date.parse('2026-11-01T00:00:00Z') }).retireMissing).toBe(false);
});

it.each([
  ['2026-11-08T09:45:00-05:00', '2026-11-08T10:45:00-05:00'],
  ['2026-11-01T01:15:00-04:00', '2026-11-01T01:45:00-04:00'],
  ['2026-11-01T01:15:00-05:00', '2026-11-01T01:45:00-05:00'],
])('respects the publisher explicit Eastern offset, including distinct repeated-hour instants: %s', (start, end) => {
  expect(run(page(changeTimes(event, start, end))).records[0]).toMatchObject({
    startsAtIso: new Date(start).toISOString(), endsAtIso: new Date(end).toISOString(),
  });
});

it.each([
  (body) => body.replace('America/New_York', 'America/Denver'),
  (body) => body.replace('data-calendar-id="1726"', 'data-calendar-id="99"'),
  (body) => body.replace('data-event-start="1791726300"', 'data-event-start="1"'),
  (body) => body.replace('content="2026-10-11T09:45:00-04:00"', 'content="2026-10-11T09:46:00-04:00"'),
  (body) => body.replace('https://www.google.com/calendar/event?', 'https://evil.invalid/calendar/event?'),
  (body) => body.replace(/eid=[A-Za-z0-9]+/, 'eid='),
  (body) => body.replace('</li>', ''),
])('fails the whole source on malformed eligible fields or incomplete HTML', (change) => {
  expect(() => run(change(page(event)))).toThrow();
});

it.each([
  ['2026-10-11T09:45:00-05:00', '2026-10-11T10:45:00-05:00'],
  ['2026-03-08T02:15:00-05:00', '2026-03-08T03:45:00-04:00'],
  ['2026-02-30T09:45:00-05:00', '2026-02-30T10:45:00-05:00'],
  ['2026-10-11T09:45:00-04:00', '2026-10-11T09:30:00-04:00'],
])('rejects wrong seasonal offsets, nonexistent dates and reversed durations: %s', (start, end) => {
  expect(() => run(page(changeTimes(event, start, end)), Date.parse('2026-02-01T00:00:00Z'))).toThrow();
});

it('bounds the page, rejects conflicting duplicate identities and missing calendars', () => {
  expect(() => adapter.parseFixture('x'.repeat(2 * 1024 * 1024 + 1), { now })).toThrow();
  expect(() => run('<html><body>Calendar unavailable</body></html>')).toThrow();
  expect(() => run(page(event + changeTimes(event, '2026-10-11T10:00:00-04:00', '2026-10-11T11:00:00-04:00')))).toThrow();
});

it('fetches only the publisher page through the polite transport and preserves failure/retirement isolation', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => html }));
  expect(await adapter.fetch({ fetchImpl, now })).toMatchObject({ truncated: true, retireMissing: false });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][0]).toBe(feed.url);
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({ minIntervalMs: 3000, timeoutMs: 45000 });
  await expect(adapter.fetch({ fetchImpl: async () => ({ ok: false, status: 504 }), now })).rejects.toThrow();
});

function mockDatabase(previousCount = 100) {
  const rpc = jest.fn(async () => ({ data: 0, error: null }));
  const upsert = jest.fn(async () => ({ error: null }));
  const read = { eq: () => read, gte: () => read, order: () => read,
    range: async () => ({ data: [], error: null }) };
  const count = { eq: () => count, gte: async () => ({ count: previousCount, error: null }) };
  return { rpc, upsert, client: { rpc, from: () => ({
    select: (_, options) => options?.head ? count : read, upsert,
  }) } };
}

it('the real runner finalizes this partial month with a source-scoped no-retirement horizon', async () => {
  const db = mockDatabase();
  const result = await syncSources({ sources: [{ ...adapter, fetch: async () => adapter.parseFixture(html, { now }) }],
    now, clientFactory: () => db.client, log: () => {}, logError: () => {} });
  expect(result.summaries[0]).toMatchObject({ sourceName: feed.name, status: 'synced', upsertedCount: 3 });
  expect(db.rpc).toHaveBeenCalledWith('finish_catalog_sync', expect.objectContaining({
    p_source_name: feed.name, p_horizon: '-infinity',
  }));
  expect(db.upsert.mock.calls[0][0].every((row) => row.source_name === feed.name)).toBe(true);
});

it('upserts a plain-prefix cancellation over the existing occurrence without inventing a replacement', async () => {
  const db = mockDatabase(1);
  const original = run(page(event)).records[0];
  const cancelled = page(event.replaceAll('Worship Service - In-Person, YouTube &amp; Zoom', 'Cancelled Worship Service - In-Person, YouTube &amp; Zoom'));
  const result = await syncSources({ sources: [{ ...adapter, fetch: async () => adapter.parseFixture(cancelled, { now }) }],
    now, clientFactory: () => db.client, log: () => {}, logError: () => {} });
  expect(result.summaries[0]).toMatchObject({ status: 'synced', upsertedCount: 1 });
  expect(db.upsert.mock.calls[0][0]).toHaveLength(1);
  expect(db.upsert.mock.calls[0][0][0]).toMatchObject({ id: original.id, is_cancelled: true });
});

it('a broken Vermont page cannot prevent Utah writes or retire Utah records', async () => {
  const db = mockDatabase(1);
  const base = run(page(event)).records[0];
  const utah = { sourceName: 'Utah Isolation Fixture', sourceKind: 'community', idPrefix: 'fixture-ut-', requiredSecrets: [],
    fetch: async () => ({ items: [base], truncated: false }), normalize: (raw) => ({ ...raw,
      id: 'fixture-ut-occurrence', sourceName: 'Utah Isolation Fixture', lat: 40.7608, lng: -111.891,
      locality: 'Salt Lake City', region: 'UT', timezone: 'America/Denver' }) };
  // This deliberately invalid eligible row exercises the actual parser, rather than a generic rejection stub.
  const broken = { ...adapter, fetch: async () => adapter.parseFixture(page(event).replace('data-calendar-id="1726"', 'data-calendar-id="999"'), { now }) };
  const result = await syncSources({ sources: [broken, utah], now, clientFactory: () => db.client,
    log: () => {}, logError: () => {} });
  expect(result.summaries.map((summary) => summary.status)).toEqual(['failed', 'synced']);
  expect(db.upsert).toHaveBeenCalledTimes(1);
  expect(db.upsert.mock.calls[0][0][0].source_name).toBe(utah.sourceName);
  expect(db.rpc).toHaveBeenCalledTimes(1);
  expect(db.rpc.mock.calls[0][1].p_source_name).toBe(utah.sourceName);
});
