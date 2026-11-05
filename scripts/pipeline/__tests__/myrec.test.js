const fs = require('node:fs');
const { createMyrecAdapter, parseDirectory, parseProgram, parseSchedule, publicUrl } = require('../adapters/myrec');
const { readSourceFixture, fetchSourceRecords } = require('../run-source');
const { syncSources } = require('../sync-sources');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const now = Date.parse('2026-10-08T18:00:00Z');
const feed = feeds.find((f) => f.id === 'bristol-recreation');
const adapter = createMyrecAdapter(feed, venues);
const fixture = JSON.parse(fs.readFileSync(adapter.fixturePath, 'utf8'));
const directory = parseDirectory(fixture.pages[feed.url], feed);
const parade = directory.find((p) => p.id === '30157');
const activity = parseProgram(fixture.pages[parade.url], parade)[0];
const run = (body = fixture, source = adapter) => readSourceFixture({ ...source,
  parseFixture: (_, context) => source.parseFixture(JSON.stringify(body), context) }, undefined, { now });
const copy = () => structuredClone(fixture);

it('imports real timed public sessions, preserves Eastern DST, evidence-backed admission and private source ownership', () => {
  const result = run();
  expect(result).toMatchObject({ validCount: 23, rejectedCount: 0, truncated: true,
    horizon: '2026-12-07T18:00:00.000Z', diagnostics: { 'cancelled activity without dates': 1 } });
  expect(new Set(result.records.map((r) => r.id)).size).toBe(23);
  expect(result.records.every((r) => r.locality === 'Bristol' && r.region === 'VT' && r.rating === 'general'
    && r.timezone === 'America/New_York' && !/[<>@]/.test(r.description))).toBe(true);
  expect(result.records.filter((r) => r.title === 'Community Pickleball at BES Saturdays')).toHaveLength(9);
  expect(result.records.find((r) => r.title === 'Community Pickleball at BES Saturdays')).toMatchObject({
    startsAtIso: '2026-10-10T21:00:00.000Z', endsAtIso: '2026-10-10T23:00:00.000Z',
    venue: 'Bristol Elementary School, Door 19', category: 'sports' });
  expect(result.records.find((r) => r.startsAtIso.startsWith('2026-11-07'))).toMatchObject({ startsAtIso: '2026-11-07T22:00:00.000Z' });
  expect(result.records.find((r) => r.title === activity.title).eventFacts.admission).toMatchObject({
    value: 'free', excerpt: '$0.00 Res, $0.00 Non-Res', checkedOn: '2026-10-08' });
  expect(result.records.find((r) => r.title.startsWith('ZUMBA')).eventFacts.admission.value).toBe('paid');
  expect(result.records.find((r) => r.title === 'Memory Tree Lighting 2026').eventFacts).toBeUndefined();
  expect(result.records.some((r) => r.title.includes('Full Session') || r.title.includes('Mrs. Claus'))).toBe(false);
  expect(result.records.every((r) => !r.eventFacts?.food)).toBe(true);
});

it('uses public program categories rather than bookings, donor forms, memberships or guessed recurrence', () => {
  expect(directory).toHaveLength(7);
  expect(directory.some((p) => /membership|fund|donation|project/i.test(p.title))).toBe(false);
  const body = copy();
  // The publisher explicitly deletes one session; weekly prose must not restore it.
  const pickleUrl = Object.keys(body.pages).find((u) => u.includes('activity_dates') && u.endsWith('146225'));
  body.pages[pickleUrl] = body.pages[pickleUrl].replace(/<tr\b[^>]*>\s*<td data-title="Date">\s*Saturday October 10, 2026[\s\S]*?<\/tr>/, '');
  expect(run(body).records.filter((r) => r.title === 'Community Pickleball at BES Saturdays')).toHaveLength(8);
  expect(run(body).records.some((r) => r.title === 'Community Pickleball at BES Saturdays' && r.startsAtIso.startsWith('2026-10-10'))).toBe(false);
  body.pages[parade.url] = body.pages[parade.url].replace('THIS IS A FAIR WEATHER EVENT!', 'This activity is open to members and their guests only.');
  expect(run(body).records.some((r) => r.title === activity.title)).toBe(false);
});

it('keeps same-day identity through clock edits and explicit cancellations; complete absence protects other sources', () => {
  const original = run().records.find((r) => r.title === activity.title);
  const body = copy();
  body.pages[activity.url] = body.pages[activity.url].replace('4:30 PM', '4:45 PM');
  expect(run(body).records.find((r) => r.title === activity.title)).toMatchObject({
    id: original.id, startsAtIso: '2026-10-30T20:45:00.000Z' });
  body.pages[parade.url] = body.pages[parade.url].replace(`<b>${activity.title}</b>`, `<b>${activity.title}</b><b>* CANCELED</b>`);
  expect(run(body).records.find((r) => r.title === activity.title)).toMatchObject({ id: original.id, isCancelled: true });
  const cancelled = copy();
  cancelled.pages[activity.url] = `<span id="Content_lblEventName">${activity.title} (9999)</span><span id="Content_lblActivityCanceled">This activity is canceled.</span>`;
  expect(run(cancelled)).toMatchObject({ records: expect.not.arrayContaining([expect.objectContaining({ id: original.id })]),
    truncated: true, horizon: '2026-12-07T18:00:00.000Z' });
  expect(run(cancelled).records.every((r) => r.sourceName === feed.name && r.id.startsWith(adapter.idPrefix))).toBe(true);
});

it('keeps full access/rating evidence while public cards use short facts and publisher venue names', () => {
  const body = copy();
  body.pages[parade.url] = body.pages[parade.url].replace('THIS IS A FAIR WEATHER EVENT!', '21 and over only. Contact private-person@example.test for details.');
  const record = run(body).records.find((r) => r.title === activity.title);
  expect(record.rating).toBe('mature');
  expect(record.description).not.toContain('private-person');
  expect(record.description).toContain('Map point is approximate');
  body.pages[parade.url] = body.pages[parade.url].replace('21 and over only.', '<div>Public program.</div>21 and over only.');
  expect(run(body).records.find((r) => r.title === activity.title).rating).toBe('mature');
  const notes = copy();
  notes.pages[parade.url] = notes.pages[parade.url].replace('</tbody>', '<tr class="notes def"><td colspan="5">21 and over only.</td></tr></tbody>');
  expect(run(notes).records.find((r) => r.title === activity.title).rating).toBe('mature');
  const unknown = copy();
  unknown.pages[parade.url] = unknown.pages[parade.url].replace(/Town Green/g, 'Some other public park');
  unknown.pages[activity.url] = unknown.pages[activity.url].replace(/Town Green/g, 'Some other public park');
  expect(run(unknown)).toMatchObject({ validCount: 22, skipped: { 'unmapped venue': 1 } });
});

it('fails before writes on unsafe links, changed templates, missing sessions, duplicate dates or ambiguous wall times', () => {
  for (const change of [
    (b) => { delete b.pages[activity.url]; },
    (b) => { b.pages[feed.url] = b.pages[feed.url].replace('program_details.aspx?ProgramID=30157', 'https://evil.example/collect?ProgramID=30157'); },
    (b) => { b.pages[feed.url] = '<p>Programs</p>'; },
    (b) => { b.pages[parade.url] = b.pages[parade.url].replace('EventDates(30157,0,146294)', 'EventDates(30175,0,146294)'); },
    (b) => { b.pages[activity.url] = b.pages[activity.url].replace('Town Green', 'Private house'); },
    (b) => { b.pages[activity.url] = b.pages[activity.url].replace('Friday October 30', 'Friday February 30'); },
    (b) => { b.pages[activity.url] = b.pages[activity.url].replace('4:30 PM', 'TBD'); },
    (b) => { b.pages[parade.url] = b.pages[parade.url].replace('data-title="Activity"', 'data-title="Unknown"'); },
    (b) => { b.pages[activity.url] = b.pages[activity.url].replace('</tbody>', '<tr><td data-title="Date">partial</tbody>'); },
    (b) => { b.pages[activity.url] = b.pages[activity.url].replace('</tbody>', b.pages[activity.url].match(/<tr class="row[^>]*>[\s\S]*?<\/tr>/)[0] + '</tbody>'); },
    (b) => { b.pages[activity.url] = b.pages[activity.url].replace('Friday October 30, 2026', 'Sunday November 1, 2026').replace('4:30 PM', '1:30 AM'); },
  ]) { const body = copy(); change(body); expect(() => run(body)).toThrow(); }
  for (const value of [feed.url + '&redirect=/login', feed.url.replace('type=activities', 'type=1'),
    'https://user:pass@bristolvt.myrec.com/info/activities/default.aspx?type=activities']) {
    expect(() => publicUrl(value, feed.url, 'activities/default', ['type'])).toThrow();
  }
  const noTitle = fixture.pages[activity.url].replace(activity.title, 'A different activity');
  expect(() => parseSchedule(noTitle, activity, feed, now)).toThrow();
});

it('fetches only the identifying public GET contract and leaves database/retirement untouched on a failed schedule', async () => {
  const fetchImpl = jest.fn(async (url) => ({ ok: true, text: async () => fixture.pages[url] }));
  const result = await fetchSourceRecords(adapter, { now, overrides: {}, politeFetch: fetchImpl });
  expect(result.records).toEqual(run().records);
  expect(fetchImpl).toHaveBeenCalledTimes(18);
  for (const [url, options] of fetchImpl.mock.calls) {
    expect(new URL(url).pathname).toMatch(/^\/info\/(?:activities|popups)\//);
    expect(options).toMatchObject({ minIntervalMs: 1000, timeoutMs: 15000 });
    expect(options.method).toBeUndefined();
  }
  const from = jest.fn(), rpc = jest.fn();
  const failed = await syncSources({ sources: [{ ...adapter, fetch: async (context) => adapter.fetch({ ...context,
    fetchImpl: async (url) => ({ ok: url !== activity.url, status: 503, text: async () => fixture.pages[url] }) }) }],
  now, clientFactory: () => ({ from, rpc }), log: jest.fn(), logError: jest.fn() });
  expect(failed.totals.failedSources).toBe(1);
  expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});

const CATEGORIES = ['Fitness', 'Special Events', 'Community'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORIGIN = 'https://bristolvt.myrec.com';

function dayLabel(date) {
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function datedRows(count, start) {
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86400000));
}

function cappedPrograms({ programs, activities = [1, 1, 1], sessions = 1, extraSessions = 0, datesFor }) {
  const built = [];
  let programId = 1;
  let activityId = 1;
  const totalActivities = programs.reduce((sum, count, index) => sum + count * activities[index], 0);
  CATEGORIES.forEach((category, index) => {
    for (let programIndex = 0; programIndex < programs[index]; programIndex += 1) {
      const id = String(programId++);
      const list = [];
      for (let activityIndex = 0; activityIndex < activities[index]; activityIndex += 1) {
        const activity = String(activityId++);
        const extra = Number(activity) === totalActivities ? extraSessions : 0;
        list.push({
          id: activity,
          title: `Public class ${activity}`,
          dates: datesFor ? datesFor(activity) : datedRows(sessions + extra, Date.UTC(2026, 9, 9)),
        });
      }
      built.push({ id, category, title: `Public program ${id}`, activities: list });
    }
  });
  return built;
}

function pagesFor(programs) {
  const pages = {
    [feed.url]: programs.reduce((html, program, index) => {
      const previous = programs[index - 1];
      const open = !previous || previous.category !== program.category
        ? `<div class="category"><div class="category-name"><a href="default.aspx?CategoryID=${index + 1}&type=activities">${program.category}</a></div><ul>`
        : '';
      const close = !programs[index + 1] || programs[index + 1].category !== program.category ? '</ul></div>' : '';
      return `${html}${open}<li><a href="program_details.aspx?ProgramID=${program.id}">${program.title}</a></li>${close}`;
    }, ''),
  };
  for (const program of programs) {
    pages[`${ORIGIN}/info/activities/program_details.aspx?ProgramID=${program.id}`] = `<span id="Content_lblProgramName">${program.title}</span><div class="program-description">Public program.</div><table id="no-more-tables"><tbody>${program.activities.map((activity) => `<tr><td data-title="Activity"><b>${activity.title}</b></td><td data-title="Ages">N/A</td><td data-title="Fees">$0.00 Res, $0.00 Non-Res</td><td data-title="Date/Time"><a href="javascript: EventDates(${program.id},0,${activity.id})">date</a><a href="/info/facilities/details.aspx?ActivityID=${activity.id}">Holley Hall</a></td></tr>`).join('')}</tbody></table>`;
    for (const activity of program.activities) {
      pages[`${ORIGIN}/info/popups/activity_dates.aspx?ProgramID=${program.id}&EventID=0&ActivityID=${activity.id}`] = `<span id="Content_lblEventName">${activity.title} (1)</span><table id="no-more-tables"><tbody>${activity.dates.map((date) => `<tr><td data-title="Date">${dayLabel(date)}</td><td data-title="Times">4:30 PM - 5:30 PM</td><td data-title="Location">Holley Hall</td></tr>`).join('')}</tbody></table>`;
    }
  }
  return { pages };
}

async function expectOverflowFailsBeforeWrites(programs, message) {
  const { pages } = pagesFor(programs);
  const from = jest.fn();
  const rpc = jest.fn();
  const failed = await syncSources({
    sources: [{ ...adapter, fetch: async (context) => adapter.fetch({ ...context, fetchImpl: async (url) => {
      if (typeof pages[url] !== 'string') throw new Error(`Missing synthetic page ${url}`);
      return { ok: true, text: async () => pages[url] };
    } }) }],
    now,
    clientFactory: () => ({ from, rpc }),
    log: jest.fn(),
    logError: jest.fn(),
  });
  expect(failed.totals.failedSources).toBe(1);
  expect(failed.summaries[0].error).toContain(message);
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
}

it('accepts the 40-program, 160-activity and 1,000-session caps exactly', () => {
  expect(run(pagesFor(cappedPrograms({ programs: [38, 1, 1] }))).records).toHaveLength(40);
  expect(run(pagesFor(cappedPrograms({ programs: [1, 1, 1], activities: [158, 1, 1] }))).records).toHaveLength(160);
  expect(run(pagesFor(cappedPrograms({ programs: [1, 1, 1], activities: [18, 1, 1], sessions: 50 }))).records).toHaveLength(1000);
  const boundary = { id: '9', title: 'Public class 9', location: 'Holley Hall', age: 'N/A', fees: '$0.00 Res, $0.00 Non-Res', description: 'Public program.', cancelled: false };
  expect(parseSchedule(`<span id="Content_lblEventName">${boundary.title} (1)</span><table id="no-more-tables"><tbody>${datedRows(1000, Date.UTC(2030, 0, 1)).map((date) => `<tr><td data-title="Date">${dayLabel(date)}</td><td data-title="Times">4:30 PM - 5:30 PM</td><td data-title="Location">Holley Hall</td></tr>`).join('')}</tbody></table>`, boundary, feed, now)).toMatchObject({ items: [], cancelledWithoutDates: false });
}, 20000);

it('fails one over each cap before any database call', async () => {
  await expectOverflowFailsBeforeWrites(cappedPrograms({ programs: [39, 1, 1] }), 'reviewed directory scope is missing or exceeds its limit');
  await expectOverflowFailsBeforeWrites(cappedPrograms({ programs: [1, 1, 1], activities: [159, 1, 1] }), 'activity identity or request limit changed');
  await expectOverflowFailsBeforeWrites(cappedPrograms({ programs: [1, 1, 1], activities: [18, 1, 1], sessions: 50, extraSessions: 1 }), 'source session limit reached');
  await expectOverflowFailsBeforeWrites(cappedPrograms({
    programs: [1, 1, 1],
    datesFor: (id) => datedRows(id === '1' ? 1001 : 1, Date.UTC(2030, 0, 1)),
  }), 'schedule is empty or exceeds its limit');
}, 20000);

it.each(['middleburyvt', 'hartfordvt', 'brandonvt'])('keeps %s public program and date requests on their registered tenant', (tenant) => {
  const origin = `https://${tenant}.myrec.com`;
  const localFeed = { ...feed, id: `${tenant}-candidate`, name: `${tenant} Recreation`, url: `${origin}/info/activities/default.aspx?type=activities` };
  const pages = Object.fromEntries(Object.entries(fixture.pages).map(([url, html]) => [url.replace('https://bristolvt.myrec.com', origin), html.replaceAll('https://bristolvt.myrec.com', origin)]));
  const source = createMyrecAdapter(localFeed, venues);
  const result = run({ pages }, source);
  expect(result.records).toHaveLength(23);
  expect(result.records.every((record) => record.sourceUrl.startsWith(`${origin}/info/activities/program_details.aspx?ProgramID=`))).toBe(true);
  const programs = parseDirectory(pages[localFeed.url], localFeed);
  const activity = parseProgram(pages[programs[0].url], programs[0])[0];
  expect(activity.url.startsWith(`${origin}/info/popups/activity_dates.aspx?`)).toBe(true);
  expect(() => publicUrl('https://bristolvt.myrec.com/info/activities/program_details.aspx?ProgramID=1', localFeed.url, 'activities/program_details', ['ProgramID'])).toThrow('Unsafe MyRec');
});

it.each([
  'http://hartfordvt.myrec.com/info/activities/default.aspx?type=activities',
  'https://name:secret@hartfordvt.myrec.com/info/activities/default.aspx?type=activities',
  'https://hartfordvt.myrec.com:8443/info/activities/default.aspx?type=activities',
  'https://myrec.com/info/activities/default.aspx?type=activities',
  'https://hartfordvt.myrec.com.attacker.example/info/activities/default.aspx?type=activities',
  'https://other.hartfordvt.myrec.com/info/activities/default.aspx?type=activities',
])('rejects an untrusted registered MyRec origin: %s', (url) => {
  expect(() => publicUrl(url, url, 'activities/default', ['type'])).toThrow('Unsafe MyRec');
});

it('fetches only the reviewed public program IDs and fails when an expected program disappears', () => {
  const selected = { ...feed, programIds: [parade.id] };
  expect(parseDirectory(fixture.pages[feed.url], selected).map((program) => program.id)).toEqual(['30157']);
  expect(() => parseDirectory(fixture.pages[feed.url], { ...feed, programIds: ['9999999999'] })).toThrow('reviewed program');
  const { validateRegistries } = require('../registry-validation');
  expect(validateRegistries([selected], venues)).toEqual([]);
  for (const programIds of [[], ['1', '1'], [1], ['01x'], Array.from({ length: 41 }, (_, i) => String(i + 1))]) {
    expect(validateRegistries([{ ...feed, programIds }], venues)).toContain(`Invalid feed: ${feed.id}`);
  }
});

it('does not turn a zero-dollar registration row into free admission when public prose states a per-visit fee', () => {
  const event = { ...activity, description: 'Public Skate is $5 per person per visit or you can purchase a season pass.' };
  const schedule = parseSchedule(fixture.pages[activity.url], event, feed, now);
  expect(schedule.items).toHaveLength(1);
  expect(schedule.items[0].eventFacts).toBeUndefined();
});

it('keeps activity titles with meaningful parentheses when the schedule has no numeric identifier suffix', () => {
  const title = '01. Preschool Ages 3-4 (Wednesday)';
  const body = fixture.pages[activity.url].replace(/(<span id="Content_lblEventName">)[\s\S]*?(<\/span>)/, `$1${title}$2`);
  expect(parseSchedule(body, { ...activity, title }, feed, now).items).toHaveLength(1);
});

it('accepts only activity-owned multi-location markers and requires explicit session venues', () => {
  const body = fixture.pages[parade.url].replace(/<a\b[^>]*href="\/info\/facilities\/details\.aspx\?ActivityID=(\d+)"[^>]*>[\s\S]*?<\/a>/,
    `<a href="javascript: EventLocations(${parade.id},0,${activity.id});">View Locations</a>`);
  const moving = parseProgram(body, parade)[0];
  expect(parseSchedule(fixture.pages[activity.url], moving, feed, now).items).toHaveLength(1);
  for (const marker of [`EventLocations(1,0,${activity.id})`, `EventLocations(${parade.id},1,${activity.id})`, `EventLocations(${parade.id},0,1)`]) {
    expect(() => parseProgram(body.replace(`EventLocations(${parade.id},0,${activity.id})`, marker), parade)).toThrow('public venue');
  }
  expect(() => parseSchedule(fixture.pages[activity.url].replace(/(<td data-title="Location">)[\s\S]*?(<\/td>)/, '$1$2'), moving, feed, now)).toThrow();
});

it('omits only the publisher exact Exclusion Date marker and reports the omitted schedule date', () => {
  const body = fixture.pages[activity.url].replace(/(<td data-title="Location">)[\s\S]*?(<\/td>)/, '$1Exclusion Date$2');
  const result = parseSchedule(body, activity, feed, now);
  expect(result).toMatchObject({ items: [], excludedDates: 1 });
  expect(() => parseSchedule(body.replace('Exclusion Date', 'Unknown'), activity, feed, now)).toThrow('venue');
});

it('limits a reviewed program to explicitly selected weekdays without changing source dates', () => {
  const selected = { ...feed, programIds: [parade.id], allowedWeekdaysByProgram: { [parade.id]: [0, 2] } };
  const result = run(fixture, createMyrecAdapter(selected, venues));
  expect(result.records).toEqual([]);
  expect(result.diagnostics).toMatchObject({ 'outside reviewed program weekdays': 1 });
  const { validateRegistries } = require('../registry-validation');
  expect(validateRegistries([selected], venues)).toEqual([]);
  for (const scope of [{ [parade.id]: [] }, { [parade.id]: [0, 0] }, { [parade.id]: ['2'] }, { [parade.id]: [7] }, { x: [2] }, { '1': [2] }, []]) {
    expect(validateRegistries([{ ...selected, allowedWeekdaysByProgram: scope }], venues)).toContain(`Invalid feed: ${feed.id}`);
  }
});

it('rejects redirects and suspicious public routes before processing a different tenant', async () => {
  const localFeed = { ...feed, url: 'https://hartfordvt.myrec.com/info/activities/default.aspx?type=activities' };
  const source = createMyrecAdapter(localFeed, venues);
  await expect(fetchSourceRecords(source, { now, politeFetch: async () => ({ ok: false, status: 302 }) })).rejects.toThrow('request failed (302)');
  for (const href of ['/info/household/login.aspx?ProgramID=1', '/info/activities/program_details.aspx?ProgramID=1&redirect=https://other.myrec.com', '/info/activities/program_details.aspx?ProgramID=1#private', 'https://bristolvt.myrec.com/info/activities/program_details.aspx?ProgramID=1']) {
    expect(() => publicUrl(href, localFeed.url, 'activities/program_details', ['ProgramID'])).toThrow('Unsafe MyRec');
  }
});

it('does not prepend stale parent-program years to a complete activity title', () => {
  expect(run().records.find((record) => record.title === 'Memory Tree Lighting 2026').description).not.toContain('2025');
});
