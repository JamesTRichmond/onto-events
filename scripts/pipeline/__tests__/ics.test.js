const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createIcsAdapter, parseCalendar } = require('../adapters/ics');
const { readSourceFixture, processSourceItems } = require('../run-source');
const { rateCalendarEvent } = require('../calendar-record');
const { validateRegistries } = require('../registry-validation');
const { calendarAdapters } = require('../sources');

const now = Date.parse('2026-10-30T00:00:00Z');
const timezone = 'America/Denver';
const feed = {
  id: 'contract', name: 'Fixture calendar', kind: 'ics', sourceKind: 'community', timezone,
  url: 'https://fixture.example/calendar.ics', defaultCategory: 'music', defaultRating: 'general',
  venueHint: null, termsUrl: 'https://fixture.example/terms', termsCheckedOn: '2026-09-05',
  notes: 'Synthetic test input only; never registered as a live source.',
  fixturePath: 'scripts/pipeline/fixtures/ics/contract.ics',
};
const venues = ['hall', 'bar', 'park', 'library'].map((kind) => ({
  name: `Fixture ${kind[0].toUpperCase()}${kind.slice(1)}`, aliases: [], kind, lat: 40.7608, lng: -111.891,
  locality: 'Salt Lake City', address: 'Fixture location', allAges: 'unknown',
  sourceUrl: 'https://fixture.example/venue', verifiedOn: '2026-09-05',
}));
const content = fs.readFileSync(path.join(__dirname, '../../..', feed.fixturePath), 'utf8');
const calendar = (fields) => `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:example\nSUMMARY:Test concert\nLOCATION:Fixture Hall\n${fields}\nEND:VEVENT\nEND:VCALENDAR`;
const parse = (body = content, clock = now) => parseCalendar(body, { now: clock, timezone });

it('expands daily and weekly recurrences with BYDAY, COUNT, UNTIL and EXDATE across DST', () => {
  const { items } = parse();
  expect(items.filter((e) => e.uid === 'daily').map((e) => e.start)).toEqual([
    '2026-10-31T01:00:00.000Z', '2026-11-02T03:00:00.000Z',
    '2026-11-03T02:00:00.000Z', '2026-11-04T02:00:00.000Z',
  ]);
  expect(items.filter((e) => e.uid === 'weekly').map((e) => e.start)).toEqual([
    '2026-10-30T21:00:00.000Z', '2026-11-01T22:00:00.000Z', '2026-11-06T22:00:00.000Z', '2026-11-08T22:00:00.000Z',
  ]);
});

it('expands monthly ordinal weekdays only within the sixty-day horizon', () => {
  expect(parse().items.filter((e) => e.uid === 'monthly').map((e) => e.start)).toEqual([
    '2026-11-02T23:00:00.000Z', '2026-12-07T23:00:00.000Z',
  ]);
});

it('retains original occurrence identity when moved, inherits metadata, and emits cancelled instances', () => {
  const items = parse().items.filter((e) => e.uid === 'daily');
  expect(items[1]).toMatchObject({ title: 'Moved concert', location: 'Fixture Hall', occurrence: '2026-11-02T02:00:00.000Z', end: '2026-11-02T05:00:00.000Z' });
  expect(items[2]).toMatchObject({ cancelled: true, occurrence: '2026-11-03T02:00:00.000Z', end: '2026-11-03T04:00:00.000Z' });
  const cancelled = parse(calendar('DTSTART:20261101T190000\nSTATUS:CANCELLED')).items[0];
  expect(cancelled.cancelled).toBe(true);
});

it('preserves exclusive all-day DTEND and date exclusions, including a 25-hour day', () => {
  const { items } = parse();
  expect(items.find((e) => e.uid === 'all-day')).toMatchObject({ start: '2026-10-31T06:00:00.000Z', end: '2026-11-02T07:00:00.000Z' });
  expect(items.filter((e) => e.uid === 'all-day-recurring').map((e) => [e.start, e.end])).toEqual([
    ['2026-10-30T06:00:00.000Z', '2026-10-31T06:00:00.000Z'],
    ['2026-11-01T06:00:00.000Z', '2026-11-02T07:00:00.000Z'],
    ['2026-11-02T07:00:00.000Z', '2026-11-03T07:00:00.000Z'],
  ]);
  const underway = parse(content, Date.parse('2026-11-02T06:30:00Z')).items;
  expect(underway.some((e) => e.uid === 'all-day')).toBe(true);
  expect(parse(calendar('DTSTART;VALUE=DATE:20261101')).items[0].end).toBe('2026-11-02T07:00:00.000Z');
});

it('uses source timezone for floating times and returns identical dates in different host timezones', () => {
  expect(parse().items.find((e) => e.uid === 'floating').start).toBe('2026-11-02T01:00:00.000Z');
  const script = `const fs=require('fs'); const {parseCalendar}=require('./scripts/pipeline/adapters/ics'); process.stdout.write(JSON.stringify(parseCalendar(fs.readFileSync('${feed.fixturePath}','utf8'),{now:${now},timezone:'${timezone}'})));`;
  const run = (TZ) => execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '../../..'), env: { ...process.env, TZ }, encoding: 'utf8' });
  expect(run('America/Los_Angeles')).toBe(run('Asia/Tokyo'));
});

it('carries URL, GEO, folded description and no invented attendee counts through normalization', () => {
  const adapter = createIcsAdapter(feed, venues);
  const result = readSourceFixture(adapter, undefined, { now });
  const concert = result.records.find((r) => r.sourceEventId === JSON.stringify(['recurring', 'daily', '2026-10-31T01:00:00.000Z']));
  expect(concert).toMatchObject({ sourceUrl: 'https://fixture.example/events/daily', lat: 40.7608, lng: -111.891, attendees: 0, category: 'music', rating: 'general' });
  expect(result.skipped).toEqual({ 'unmapped venue': 1 });
  expect(result.diagnostics).toEqual({ 'private event': 1 });
  expect(result.records.find((r) => r.sourceEventId === JSON.stringify(['single', 'floating'])).description).toContain('One night only.');
  expect(result.records.filter((r) => r.title === 'Library game meetup')).toHaveLength(4);
});

it('proves the four required ratings at the adapter boundary', () => {
  const records = readSourceFixture(createIcsAdapter(feed, venues), undefined, { now }).records;
  const rating = (id) => records.find((r) => JSON.parse(r.sourceEventId)[1] === id).rating;
  expect([rating('bar'), rating('casino'), rating('monthly'), rating('daily')]).toEqual(['mature', 'mature', 'family', 'general']);
});

it('fetches through the injected transport and carries the parser horizon to the runner', async () => {
  const adapter = createIcsAdapter(feed, venues);
  const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => content }));
  const snapshot = await adapter.fetch({ now, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledWith(feed.url, { minIntervalMs: undefined, timeoutMs: undefined });
  await createIcsAdapter({ ...feed, timeoutMs: 45000 }, venues).fetch({ now, fetchImpl });
  expect(fetchImpl).toHaveBeenLastCalledWith(feed.url, { minIntervalMs: undefined, timeoutMs: 45000 });
  const result = processSourceItems(adapter, snapshot, { now });
  expect(result.horizon).toBe('2026-12-29T00:00:00.000Z');
  expect(result.records).toHaveLength(17);
  await expect(adapter.fetch({ now, fetchImpl: async () => ({ ok: false, status: 503, headers: { get: () => null } }) })).rejects.toThrow('503');
});

it('includes allowlisted response headers in calendar fetch failures', async () => {
  const adapter = createIcsAdapter(feed, venues);
  const headers = {
    get: (name) => ({
      server: 'Cloudflare',
      'cf-ray': '1234abcd-SLC',
      'content-type': 'text/html; charset=UTF-8',
      'x-powered-by': 'ignored',
    })[name.toLowerCase()] ?? null,
  };
  await expect(adapter.fetch({ now, fetchImpl: async () => ({ ok: false, status: 403, headers }) })).rejects
    .toThrow('Calendar request failed (403; server=Cloudflare, cf-ray=1234abcd-SLC, content-type=text/html; charset=UTF-8)');
});

it('only permits explicit all-ages bar listings, and never downgrades a mature signal', () => {
  const bar = venues.find((v) => v.kind === 'bar');
  expect(rateCalendarEvent({ title: 'All ages concert' }, bar, feed)).toBe('general');
  expect(rateCalendarEvent({ title: 'All ages concert', description: '21 only' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'All ages concert', description: 'Casino showroom' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'All ages concert' }, bar, { ...feed, defaultRating: 'mature' })).toBe('mature');
  expect(rateCalendarEvent({ title: 'Family history class' }, { name: 'Family History Library', kind: 'library' }, feed)).toBe('general');
  expect(rateCalendarEvent({ title: 'Night event' }, { name: 'Unknown', kind: 'other' }, { ...feed, defaultCategory: 'nightlife' })).toBe('mature');
});

it('isolates source identities and retains ids across a moved one-off or overridden occurrence', () => {
  const adapter = createIcsAdapter(feed, venues);
  const raw = parse().items.find((e) => e.uid === 'floating');
  const a = processSourceItems(adapter, [raw], { now }).records[0];
  const b = processSourceItems(adapter, [{ ...raw, start: '2026-11-03T01:00:00Z' }], { now }).records[0];
  expect(a.id).toBe(b.id);
  const other = createIcsAdapter({ ...feed, id: 'different', name: 'Different' }, venues);
  expect(processSourceItems(other, [raw], { now }).records[0].id).not.toBe(a.id);
});

it('caps a recurring series at sixty instances and restricts its retirement horizon', () => {
  const snapshot = parse(calendar('DTSTART:20261030T000000\nDTEND:20261031T000000\nRRULE:FREQ=DAILY'), Date.parse('2026-10-30T08:00:00Z'));
  expect(snapshot.items).toHaveLength(60);
  expect(snapshot.diagnostics['recurrence cap']).toBe(1);
  expect(snapshot.horizon).toBe(snapshot.items[59].start);
});

it('ends the retirement horizon at the last start of an export that hit its fixed limit', () => {
  const events = (count) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...Array.from({ length: count }, (_, i) => [
    'BEGIN:VEVENT', `UID:show-${i}`, `SUMMARY:Show ${i}`, 'LOCATION:Fixture Hall',
    `DTSTART:202611${String(i + 1).padStart(2, '0')}T190000`, 'END:VEVENT']).flat(), 'END:VCALENDAR'].join('\n');
  const full = parseCalendar(events(3), { now, timezone, exportLimit: 3 });
  expect(full.diagnostics).toEqual({ 'export limit reached': 3 });
  expect(full.horizon).toBe(full.items[2].start);
  const short = parseCalendar(events(2), { now, timezone, exportLimit: 3 });
  expect(short.diagnostics).toEqual({});
  expect(short.horizon).toBe(new Date(now + 60 * 86400000).toISOString());
  expect(validateRegistries([{ ...feed, exportLimit: 50 }], venues)).toEqual([]);
  expect(validateRegistries([{ ...feed, exportLimit: 0 }], venues)).toEqual(['Invalid feed: contract']);
  expect(validateRegistries([{ ...feed, kind: 'rss', exportLimit: 50 }], venues)).toEqual(['Invalid feed: contract']);
});

it('fails malformed or unsupported calendars without emitting a partial success', () => {
  for (const body of ['not a feed', calendar('DTSTART;TZID=Missing/Zone:20261030T170000'), calendar('DTSTART:20261030T170000\nRRULE:FREQ=SECONDLY')]) {
    expect(() => parse(body)).toThrow();
  }
  expect(() => parse(content.replace('END:VEVENT', ''))).toThrow('Incomplete');
});

it('validates production registries and requires unambiguous aliases and terms metadata', () => {
  expect(validateRegistries(require('../../../data/feeds.json'), require('../../../data/venues.json'))).toEqual([]);
  expect(validateRegistries([feed], venues)).toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'rss', eventDateField: 'pubDate' }], venues)).toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'rss', eventDateField: 'published' }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, minIntervalMs: 20000 }], venues)).toEqual([]);
  expect(validateRegistries([{ ...feed, minIntervalMs: 499 }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, timeoutMs: 45000 }], venues)).toEqual([]);
  expect(validateRegistries([{ ...feed, timeoutMs: 999 }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, timeoutMs: 60001 }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, timeoutMs: '45000' }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, eventDateField: 'pubDate' }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, termsUrl: '', termsCheckedOn: '2026-99-99' }], venues)).not.toEqual([]);
  expect(validateRegistries([feed, feed], venues)).toContain('Duplicate feed: contract');
  expect(validateRegistries([feed], [...venues, venues[0]]).join(' ')).toContain('Duplicate or empty venue alias');
  expect(validateRegistries([feed], [{ ...venues[0], lat: 0 }])).not.toEqual([]);
});

it('accepts listing URLs only for ICS feeds and requires a public HTTPS URL', () => {
  expect(validateRegistries([{ ...feed, listingUrl: 'https://fixture.example/events' }], venues)).toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'rss', listingUrl: 'https://fixture.example/events' }], venues)).toContain('Invalid feed: contract');
  for (const listingUrl of ['http://fixture.example/events', '******fixture.example/events', 'not a URL']) {
    expect(validateRegistries([{ ...feed, listingUrl }], venues)).toContain('Invalid feed: contract');
  }
});

it('honors multi-day and week DURATION across DST, and refuses unsupported all-day durations', () => {
  const twoDays = calendar('DTSTART;VALUE=DATE:20261031\nDURATION:P2D');
  expect(parse(twoDays).items[0]).toMatchObject({ start: '2026-10-31T06:00:00.000Z', end: '2026-11-02T07:00:00.000Z' });
  expect(parse(twoDays, Date.parse('2026-11-02T06:30:00Z')).items).toHaveLength(1);
  expect(parse(calendar('DTSTART;VALUE=DATE:20261031\nDURATION:P1W')).items[0].end).toBe('2026-11-07T07:00:00.000Z');
  expect(() => parse(calendar('DTSTART;VALUE=DATE:20261031\nDURATION:PT12H'))).toThrow('Unsupported all-day duration');
});

describe('the November 1, 2026 fall-back fold (RFC 5545 §3.3.5: a repeated local time is its first occurrence)', () => {
  const beforeFold = Date.parse('2026-10-20T00:00:00Z');
  const ny = 'America/New_York';
  const span = (fields) => parse(calendar(fields), beforeFold).items.map((e) => [e.start, e.end]);

  it('resolves Denver and New York 01:30 to daylight time and leaves unrepeated times and the spring gap alone', () => {
    const start = (zone, stamp) => parse(calendar(`DTSTART;TZID=${zone}:${stamp}`), beforeFold).items[0];
    expect(start(timezone, '20261101T013000')).toMatchObject({ start: '2026-11-01T07:30:00.000Z', timezone });
    expect(start(ny, '20261101T013000')).toMatchObject({ start: '2026-11-01T05:30:00.000Z', timezone: ny });
    expect(parse(calendar('DTSTART:20261101T013000'), beforeFold).items[0].start).toBe('2026-11-01T07:30:00.000Z');
    expect(start(timezone, '20261101T005900').start).toBe('2026-11-01T06:59:00.000Z');
    expect(start(timezone, '20261101T020000').start).toBe('2026-11-01T09:00:00.000Z');
    expect(parse(calendar(`DTSTART;TZID=${timezone}:20270314T023000`), Date.parse('2027-03-01T00:00:00Z')).items[0].start).toBe('2027-03-14T09:30:00.000Z');
  });

  it('ends fold-night events from the first occurrence with DTEND or an exact DURATION', () => {
    // 00:30 MDT to the first 01:30 is one hour; the first 01:30 to 02:30 EST is two.
    expect(span(`DTSTART;TZID=${timezone}:20261101T003000\nDTEND;TZID=${timezone}:20261101T013000`)).toEqual([['2026-11-01T06:30:00.000Z', '2026-11-01T07:30:00.000Z']]);
    expect(span(`DTSTART;TZID=${ny}:20261101T013000\nDTEND;TZID=${ny}:20261101T023000`)).toEqual([['2026-11-01T05:30:00.000Z', '2026-11-01T07:30:00.000Z']]);
    expect(span(`DTSTART;TZID=${ny}:20261101T013000\nDURATION:PT1H`)).toEqual([['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']]);
    expect(span(`DTSTART;TZID=${timezone}:20261101T003000\nDURATION:PT2H`)).toEqual([['2026-11-01T06:30:00.000Z', '2026-11-01T08:30:00.000Z']]);
  });

  it('matches fold-night exclusions and overrides to the occurrences a series expands', () => {
    const series = (zone, extra = '') => `DTSTART;TZID=${zone}:20261025T013000\nDTEND;TZID=${zone}:20261025T023000\nRRULE:FREQ=WEEKLY;COUNT=3${extra}`;
    expect(span(series(timezone))).toEqual([
      ['2026-10-25T07:30:00.000Z', '2026-10-25T08:30:00.000Z'],
      ['2026-11-01T07:30:00.000Z', '2026-11-01T08:30:00.000Z'],
      ['2026-11-08T08:30:00.000Z', '2026-11-08T09:30:00.000Z'],
    ]);
    // One EXDATE line can mix a repeated time with an ordinary one.
    expect(span(series(ny, `\nEXDATE;TZID=${ny}:20261101T013000,20261108T013000`))).toEqual([['2026-10-25T05:30:00.000Z', '2026-10-25T06:30:00.000Z']]);
    const overridden = (fields) => parse(calendar(series(ny)).replace('END:VCALENDAR', `BEGIN:VEVENT\nUID:example\nRECURRENCE-ID;TZID=${ny}:20261101T013000\n${fields}\nEND:VEVENT\nEND:VCALENDAR`), beforeFold).items;
    expect(overridden('STATUS:CANCELLED').map((e) => [e.start, e.cancelled])).toEqual([
      ['2026-10-25T05:30:00.000Z', false], ['2026-11-01T05:30:00.000Z', true], ['2026-11-08T06:30:00.000Z', false],
    ]);
    expect(overridden(`DTSTART;TZID=${ny}:20261101T003000\nDTEND;TZID=${ny}:20261101T013000`).map((e) => [e.start, e.end, e.occurrence])).toEqual([
      ['2026-10-25T05:30:00.000Z', '2026-10-25T06:30:00.000Z', '2026-10-25T05:30:00.000Z'],
      ['2026-11-01T04:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-01T05:30:00.000Z'],
      ['2026-11-08T06:30:00.000Z', '2026-11-08T07:30:00.000Z', '2026-11-08T06:30:00.000Z'],
    ]);
  });

  it('sends a series that starts at a repeated local time for review instead of mis-seeding it', () => {
    expect(() => parse(calendar(`DTSTART;TZID=${ny}:20261101T013000\nRRULE:FREQ=WEEKLY;COUNT=2`))).toThrow('repeated local time; source requires review');
    expect(() => parse(calendar('DTSTART:20261101T013000\nRRULE:FREQ=DAILY;COUNT=2'))).toThrow('repeated local time; source requires review');
  });
});

it('excludes private and confidential classifications case-insensitively, including overrides', () => {
  for (const value of ['private', 'Private', 'CONFIDENTIAL', 'confidential']) {
    expect(parse(calendar(`DTSTART:20261101T190000\nCLASS:${value}`)).items).toEqual([]);
  }
  const override = content.replace('SUMMARY:Moved concert', 'SUMMARY:Moved concert\nCLASS:pRiVaTe');
  expect(parse(override).items.some((r) => r.title === 'Moved concert')).toBe(false);
});

it('bounds stored descriptions and recurrence identities without losing late mature signals or stable ids', () => {
  const adapter = createIcsAdapter(feed, venues);
  const raw = parse().items.find((r) => r.uid === 'floating');
  const uid = 'x'.repeat(201);
  const a = adapter.normalize({ ...raw, uid, description: '♪'.repeat(8100) + ' Casino show' }, {});
  const b = adapter.normalize({ ...raw, uid, start: '2026-11-03T01:00:00Z' }, {});
  expect(Array.from(a.description)).toHaveLength(8000);
  expect(a.rating).toBe('mature');
  expect(a.sourceEventId).toMatch(/^sha256:[a-f0-9]{32}$/);
  expect(a.sourceEventId).toBe(b.sourceEventId);
  expect(a.id).toBe(b.id);
});

it('keeps identically titled showings on adjacent venue-local dates despite a shared UTC day', () => {
  const adapter = createIcsAdapter(feed, venues);
  const raw = parse().items.find((r) => r.uid === 'floating');
  const result = processSourceItems(adapter, [
    { ...raw, uid: 'late', start: '2026-11-02T05:30:00Z', end: undefined },
    { ...raw, uid: 'early', start: '2026-11-02T07:30:00Z', end: undefined },
  ], { now });
  expect(result.records).toHaveLength(2);
});

it('rejects source names and ids beyond database limits and refuses unimplemented feed kinds', () => {
  expect(validateRegistries([{ ...feed, name: 'x'.repeat(81) }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, id: 'x'.repeat(164) }], venues)).not.toEqual([]);
  expect(validateRegistries([{ ...feed, id: 'x'.repeat(163), name: 'x'.repeat(80) }], venues)).toEqual([]);
  expect(() => calendarAdapters([{ ...feed, kind: 'missing' }], venues)).toThrow('No adapter');
});

it('keeps explicitly typed DATE-TIME values timed, with or without an end', () => {
  const fields = 'DTSTART;VALUE=DATE-TIME:20261101T120000Z';
  expect(parse(calendar(fields + '\nDTEND;VALUE=DATE-TIME:20261101T140000Z')).items[0]).toMatchObject({
    start: '2026-11-01T12:00:00.000Z', end: '2026-11-01T14:00:00.000Z',
  });
  expect(parse(calendar(fields)).items[0].end).toBeUndefined();
});

it('recognizes case-insensitive cancellation overrides without DTSTART', () => {
  const body = content.replace('STATUS:CANCELLED', 'STATUS:cancelled');
  expect(parse(body).items.find((e) => e.uid === 'daily' && e.cancelled)).toBeDefined();
});

it('does not inherit an all-day duration when an occurrence becomes a timed event', () => {
  const master = calendar('DTSTART;VALUE=DATE:20261031\nDTEND;VALUE=DATE:20261102\nRRULE:FREQ=DAILY;COUNT=3');
  const override = 'BEGIN:VEVENT\nUID:example\nRECURRENCE-ID;VALUE=DATE:20261101\nDTSTART;TZID=America/Denver:20261101T150000\nDTEND;TZID=America/Denver:20261101T160000\nEND:VEVENT\n';
  const changed = parse(master.replace('END:VCALENDAR', override + 'END:VCALENDAR')).items.find((e) => e.start === '2026-11-01T22:00:00.000Z');
  expect(changed.end).toBe('2026-11-01T23:00:00.000Z');
});

it('resolves Windows and calendar-declared IANA aliases without using the host timezone', () => {
  const windows = calendar('DTSTART;TZID="Mountain Standard Time":20261101T100000\nDTEND;TZID="Mountain Standard Time":20261101T110000');
  expect(parse(windows).items[0]).toMatchObject({ start: '2026-11-01T17:00:00.000Z', end: '2026-11-01T18:00:00.000Z' });
  const custom = windows.replaceAll('Mountain Standard Time', 'Venue Custom Zone').replace('BEGIN:VEVENT',
    'BEGIN:VTIMEZONE\nTZID:Venue Custom Zone\nX-LIC-LOCATION:America/Denver\nEND:VTIMEZONE\nBEGIN:VEVENT');
  expect(parse(custom).items).toEqual(parse(windows).items);
  expect(parse(custom.replaceAll('Venue Custom Zone', 'tzone://venue/custom')).items).toEqual(parse(windows).items);
  expect(() => parse(calendar('DTSTART;TZID="Customized Time Zone":20261101T100000'))).toThrow('Unsupported custom timezone');
});

it('refuses duplicate calendar URLs with equivalent host, port and fragment spellings', () => {
  const other = { ...feed, id: 'other', name: 'Other calendar', url: 'https://FIXTURE.example:443/calendar.ics#calendar' };
  expect(validateRegistries([feed, other], venues)).toContain('Duplicate feed: other');
});

it('honors case-insensitive TZID parameters on starts, ends, exclusions and override identities', () => {
  const master = calendar('DTSTART;tzid=America/New_York:20261101T120000\nDTEND;TzId=America/New_York:20261101T130000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;tzid=America/New_York:20261102T120000');
  const override = 'BEGIN:VEVENT\nUID:example\nRECURRENCE-ID;tzid=America/New_York:20261103T120000\nDTSTART;tzid=America/New_York:20261103T140000\nDTEND;tzid=America/New_York:20261103T150000\nEND:VEVENT\n';
  const items = parse(master.replace('END:VCALENDAR', override + 'END:VCALENDAR')).items;
  expect(items.map((e) => [e.start, e.end])).toEqual([
    ['2026-11-01T17:00:00.000Z', '2026-11-01T18:00:00.000Z'],
    ['2026-11-03T19:00:00.000Z', '2026-11-03T20:00:00.000Z'],
  ]);
  expect(items[1].occurrence).toBe('2026-11-03T17:00:00.000Z');
});

it('separates one-off and recurring identities even when a UID contains the occurrence delimiter', () => {
  const adapter = createIcsAdapter(feed, venues);
  const raw = parse().items.find((r) => r.uid === 'floating');
  const slot = '2026-11-01T00:00:00.000Z';
  const one = adapter.normalize({ ...raw, uid: `series/${slot}`, occurrence: undefined }, {});
  const recurring = adapter.normalize({ ...raw, uid: 'series', occurrence: slot }, {});
  expect(one.id).not.toBe(recurring.id);
  expect(one.sourceEventId).not.toBe(recurring.sourceEventId);
  expect(JSON.parse(one.sourceEventId)).toEqual(['single', `series/${slot}`]);
});

it('emits canonical HTTPS provenance for mixed-case schemes and refuses URL credentials', () => {
  const adapter = createIcsAdapter({ ...feed, url: 'HTTPS://FIXTURE.EXAMPLE:443/calendar.ics' }, venues);
  const raw = parse().items.find((r) => r.uid === 'floating');
  expect(adapter.normalize({ ...raw, url: '' }, {}).sourceUrl).toBe('https://fixture.example/calendar.ics');
  expect(adapter.normalize({ ...raw, url: 'HTTPS://FIXTURE.EXAMPLE/show' }, {}).sourceUrl).toBe('https://fixture.example/show');
  expect(adapter.normalize({ ...raw, url: 'https://name:password@fixture.example/show' }, {}).sourceUrl).toBe('https://fixture.example/calendar.ics');
});

it('uses an ICS publisher listing page when the occurrence has no safe URL', () => {
  const listingUrl = 'https://fixture.example/events';
  const adapter = createIcsAdapter({ ...feed, listingUrl }, venues);
  const raw = parse().items.find((r) => r.uid === 'floating');
  expect(adapter.normalize({ ...raw, url: '' }, {}).sourceUrl).toBe(listingUrl);
  expect(adapter.normalize({ ...raw, url: 'https://fixture.example/show' }, {}).sourceUrl).toBe('https://fixture.example/show');
});

it('accepts the WKST, BYMONTHDAY, BYSETPOS, BYMONTH and YEARLY forms real public calendars use, and still refuses others', () => {
  const weekly = parse(calendar('DTSTART;TZID=America/Denver:20261031T090000\nRRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20261121T065959Z;BYDAY=SA'));
  expect(weekly.items.map((e) => e.start)).toEqual(['2026-10-31T15:00:00.000Z', '2026-11-07T16:00:00.000Z', '2026-11-14T16:00:00.000Z']);
  const monthly = parse(calendar('DTSTART;TZID=America/Denver:20261112T190000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=12;COUNT=3'));
  expect(monthly.items.map((e) => e.start)).toEqual(['2026-11-13T02:00:00.000Z', '2026-12-13T02:00:00.000Z']);
  const lastSunday = parse(calendar('DTSTART;TZID=America/Denver:20261025T100000\nRRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=-1;COUNT=3'));
  expect(lastSunday.items.map((e) => e.start)).toEqual(['2026-11-29T17:00:00.000Z', '2026-12-27T17:00:00.000Z']);
  const yearly = parse(calendar('DTSTART;VALUE=DATE:20251102\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU'));
  expect(yearly.items.map((e) => e.start)).toEqual(['2026-11-01T06:00:00.000Z']);
  expect(() => parse(calendar('DTSTART:20261030T170000\nRRULE:FREQ=WEEKLY;BYHOUR=9'))).toThrow('Unsupported recurrence rule');
  expect(() => parse(calendar('DTSTART:20261030T170000\nRRULE:FREQ=HOURLY'))).toThrow('Unsupported recurrence rule');
});

it('reads a same-day all-day DTEND as one day but still refuses an end before the start', () => {
  expect(parse(calendar('DTSTART;VALUE=DATE:20261101\nDTEND;VALUE=DATE:20261101')).items[0]).toMatchObject({
    start: '2026-11-01T06:00:00.000Z', end: '2026-11-02T07:00:00.000Z',
  });
  expect(() => parse(calendar('DTSTART;VALUE=DATE:20261102\nDTEND;VALUE=DATE:20261101'))).toThrow('Invalid all-day duration');
});

const credentialUrl = (pathname) => {
  const url = new URL(`https://fixture.example${pathname}`);
  url.username = 'name';
  url.password = 'password';
  return url.href;
};

it('accepts bounded exact publisher notices and a credential-free listing URL', () => {
  expect(validateRegistries([{
    ...feed,
    nonEventTitles: ['Staff Meeting', 'Board Work Session'],
    listingUrl: 'https://fixture.example/events',
  }], venues)).toEqual([]);
});

it.each([
  { nonEventTitles: 'Staff Meeting' },
  { nonEventTitles: [] },
  { nonEventTitles: [' Staff Meeting'] },
  { nonEventTitles: ['Staff Meeting '] },
  { nonEventTitles: [''] },
  { nonEventTitles: [null] },
  { nonEventTitles: ['Staff Meeting', 'Staff Meeting'] },
  { nonEventTitles: ['x'.repeat(201)] },
  { nonEventTitles: Array.from({ length: 21 }, (_, index) => `Notice ${index}`) },
  { listingUrl: 'http://fixture.example/events' },
  { listingUrl: credentialUrl('/events') },
  { listingUrl: '' },
])('rejects a malformed publisher notice list or listing URL: %j', (patch) => {
  expect(validateRegistries([{ ...feed, ...patch }], venues)).toContain('Invalid feed: contract');
});

it('drops only exact, case-sensitive publisher notices after title trimming', () => {
  const adapter = createIcsAdapter({ ...feed, nonEventTitles: ['Staff Meeting'] }, venues);
  const raw = parse().items.find((item) => item.uid === 'floating');
  const reasons = (title) => {
    const skipped = [];
    const record = adapter.normalize({ ...raw, title }, { skip: (reason) => skipped.push(reason) });
    return { record, skipped };
  };
  expect(reasons('Staff Meeting')).toEqual({ record: null, skipped: ['publisher non-event notice'] });
  expect(reasons(' Staff Meeting ')).toEqual({ record: null, skipped: ['publisher non-event notice'] });
  expect(reasons('staff meeting').record.title).toBe('staff meeting');
  expect(reasons('Staff Meeting today').record.title).toBe('Staff Meeting today');
});

it('prefers a safe occurrence URL, then a safe listing URL, then the feed URL', () => {
  const listingUrl = 'https://fixture.example/events';
  const raw = { ...parse().items.find((item) => item.uid === 'floating'), url: '' };
  const sourceUrl = (listing, url = '') => createIcsAdapter({ ...feed, listingUrl: listing }, venues)
    .normalize({ ...raw, url }, {}).sourceUrl;
  expect(sourceUrl(listingUrl, 'https://fixture.example/show')).toBe('https://fixture.example/show');
  expect(sourceUrl(listingUrl)).toBe(listingUrl);
  expect(sourceUrl('http://fixture.example/events')).toBe(feed.url);
  expect(sourceUrl(credentialUrl('/events'))).toBe(feed.url);
});

it('decodes HTML markup in LOCATION before venue matching and fails unknown entities for review', () => {
  const adapter = createIcsAdapter(feed, venues);
  const wrapped = parse(calendar('DTSTART:20261101T190000').replace('LOCATION:Fixture Hall', 'LOCATION:<p>Fixture Hall</p>&nbsp\;')).items[0];
  expect(wrapped.location).toBe('Fixture Hall');
  expect(adapter.normalize(wrapped, {}).venue).toBe('Fixture Hall');
  expect(parse(calendar('DTSTART:20261101T190000').replace('LOCATION:Fixture Hall', 'LOCATION:Arts &amp\; Media<br>Room 2')).items[0].location).toBe('Arts & Media Room 2');
  expect(() => parse(calendar('DTSTART:20261101T190000').replace('LOCATION:Fixture Hall', 'LOCATION:Hall &bogus\; wing'))).toThrow('Unsupported HTML entity');
});
