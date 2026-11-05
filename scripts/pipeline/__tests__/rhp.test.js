const { calendarAdapters } = require('../sources');
const { processSourceItems } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { rateCalendarEvent } = require('../calendar-record');
const { listingLinks, parseEventPage, collectRhpEvents, datedDay, showTime, innerHtml, MAX_EVENT_PAGES } = require('../adapters/rhp');

// Synthetic markup in the RHP plugin's shape, never added to the live registries.
const feed = {
  id: 'rhp-contract', name: 'RHP contract', kind: 'rhp', sourceKind: 'community',
  serviceRegion: 'asheville', timezone: 'America/New_York',
  url: 'https://venue.example/events/', defaultCategory: 'music', defaultRating: 'general',
  venueHint: null, termsUrl: 'https://venue.example/', termsCheckedOn: '2026-10-08',
  notes: 'Synthetic test only', fixturePath: 'scripts/pipeline/fixtures/rhp/contract.json',
};
const venue = {
  name: 'Contract Club', aliases: ['Contract Club Patio'], address: 'Public venue', locality: 'Asheville',
  region: 'NC', lat: 35.5951, lng: -82.5515, kind: 'club', allAges: 'unknown',
  sourceUrl: 'https://venue.example/venue', verifiedOn: '2026-10-08',
};
const now = Date.parse('2026-10-08T16:00:00Z');
const tz = 'America/New_York';
const card = (slug) => `<a id = "eventTitle" class="url" href="https://venue.example/event/${slug}/contract-club/asheville-north-carolina/" title="x">`;
const page = ({ ld, day = 'Thursday, October 15', time = 'Show: 7 pm | Doors: 6 pm', age = 'All Ages', notes = '', room = 'Contract Club', description = '<p>An evening show.</p>' } = {}) => [
  ld ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'http://schema.org', '@type': 'Event', ...ld })}</script>` : '',
  '<style>.rhp-event-notes-box{color:#fff}</style>',
  '<div id="RhpEventsSingle"><div class="col-12 rhp-event-header p-0"><span id="eventTitle"><h1>Header Title</h1></span></div>',
  age ? `<div class="col-12 eventAgeRestriction px-0 "> ${age} </div>` : '',
  `<div class = "d-block EventsDateBox"><span class = "eventStDate text-uppercase">${day}</span></div>`,
  `<div class = "eventsColor eventDoorStartDate d-flex"><span class = "font0Med75"> ${time} </span></div>`,
  `<a class="venueLink" href="https://venue.example/venue/x/" title="${room}" >${room}</a>`,
  notes ? `<div class = "col-sm-12 mt-2 px-0 rhp-event-notes-box mb-3"> ${notes} </div>` : '',
  `<div class = "col-sm-12 px-0 singleEventDescription"><div><strong>Lineup</strong><div>${description}</div></div></div>`,
  '</div>',
].join('\n');

it('collects only same-origin show pages from the listing, once each', () => {
  const listing = [card('a'), card('a'), card('b'),
    '<a id = "eventTitle" class="url" href="https://other.example/event/c/" title="x">',
    '<a id = "eventTitle" class="url" href="https://venue.example/blog/d/" title="x">'].join('');
  expect(listingLinks(listing, feed.url)).toEqual([
    'https://venue.example/event/a/contract-club/asheville-north-carolina/',
    'https://venue.example/event/b/contract-club/asheville-north-carolina/',
  ]);
});

it('reads a nested element by class, ignoring style rules that mention it', () => {
  expect(innerHtml(page(), 'singleEventDescription')).toBe('<div><strong>Lineup</strong><div><p>An evening show.</p></div></div>');
  expect(innerHtml('<style>.x{}</style><div class="x">a<div>b</div>c</div>d', 'x')).toBe('a<div>b</div>c');
});

describe('dates without a year', () => {
  it('takes the only year that puts the date on that weekday', () => {
    expect(datedDay('Thursday, October 15', now, tz)).toBe('20261015');
    // A wrong weekday can only move a show by whole years, past the 60-day window.
    expect(datedDay('Friday, October 15', now, tz)).toBe('20271015');
    expect(datedDay('MONDAY, FEBRUARY 08', now, tz)).toBe('20270208');
  });

  it('refuses a weekday that matches no nearby year, or text it cannot read', () => {
    // October 15 falls on Thu 2026, Fri 2027, Sun 2028: a Saturday matches none.
    expect(datedDay('Saturday, October 15', now, tz)).toBeNull();
    expect(datedDay('Oct 15', now, tz)).toBeNull();
    expect(datedDay('Thursday, Octember 15', now, tz)).toBeNull();
  });

  it('uses the show time, else the doors time', () => {
    expect(showTime('Show: 7 pm | Doors: 6 pm')).toBe('190000');
    expect(showTime('Doors: 7 pm // Show: 8:30 pm')).toBe('203000');
    expect(showTime('Doors: 11 am')).toBe('110000');
    expect(showTime('Show: 12 am')).toBe('000000');
    expect(showTime('All day')).toBeNull();
  });
});

describe('show pages', () => {
  const url = 'https://venue.example/event/a/contract-club/asheville-north-carolina/';

  it('prefers the schema.org start and agrees with the page text', () => {
    const { item } = parseEventPage(page({ ld: { name: 'Night &amp; Day', startDate: '2026-10-15T19:00:00-0400',
      location: { name: 'Contract Club Patio' } } }), url, { now, timezone: tz });
    expect(item).toMatchObject({ uid: url, title: 'Night & Day', location: 'Contract Club Patio',
      start: '2026-10-15T23:00:00.000Z', ageNote: 'All Ages', cancelled: false });
    expect(item.description).toBe('All Ages\nLineup An evening show.');
  });

  it('dates a page without schema.org data from its weekday and show time', () => {
    const { item } = parseEventPage(page({ time: 'Show: 8 pm' }), url, { now, timezone: tz });
    expect(item).toMatchObject({ title: 'Header Title', location: 'Contract Club', start: '2026-10-16T00:00:00.000Z' });
  });

  it('skips a page whose structured and visible starts disagree, or that has neither', () => {
    expect(parseEventPage(page({ ld: { name: 'X', startDate: '2026-10-15T21:00:00-0400' } }), url, { now, timezone: tz }))
      .toEqual({ skip: 'conflicting start' });
    expect(parseEventPage(page({ day: 'Soon' }), url, { now, timezone: tz })).toEqual({ skip: 'missing event date' });
    expect(parseEventPage(page({ ld: { name: 'X', startDate: '2026-10-15T19:00:00' }, day: 'Soon' }), url, { now, timezone: tz }))
      .toEqual({ skip: 'missing event date' });
  });

  it('joins the age line and the notes box', () => {
    const { item } = parseEventPage(page({ age: '', notes: 'Ages 18+ FULLY SEATED SHOW' }), url, { now, timezone: tz });
    expect(item.ageNote).toBe('Ages 18+ FULLY SEATED SHOW');
  });
});

describe('ratings at a club', () => {
  const rate = (description, ageNote) => rateCalendarEvent({ title: 'Show', description, ageNote }, venue, feed);

  it('trusts the venue’s own All Ages line even when the bio later says "not"', () => {
    expect(rate('All Ages\nNot just a band: a family.', 'All Ages')).toBe('general');
    expect(rate('All Ages\nNot just a band: a family.', undefined)).toBe('mature');
  });

  it('keeps 18+ and 21-and-up shows mature whatever the age line says', () => {
    expect(rate('Ages 21 and up', 'Ages 21 and up')).toBe('mature');
    expect(rate('Ages 18 and up', 'Ages 18 and up')).toBe('mature');
    expect(rate('All Ages\nBar is 21+', 'All Ages')).toBe('mature');
  });
});

it('records what each club rating rests on', () => {
  const { rateCalendarEventWithBasis } = require('../calendar-record');
  const basis = (description, ageNote) => rateCalendarEventWithBasis({ title: 'Show', description, ageNote }, venue, feed);
  expect(basis('All Ages', 'All Ages')).toEqual({ rating: 'general', basis: 'all-ages' });
  expect(basis('A great band.')).toEqual({ rating: 'mature', basis: 'venue-default' });
  expect(basis('Ages 21+')).toEqual({ rating: 'mature', basis: 'signal' });
  expect(rateCalendarEventWithBasis({ title: 'Talk', description: 'A talk.' }, { ...venue, kind: 'hall' }, feed))
    .toEqual({ rating: 'general', basis: 'listing' });
});

describe('a run', () => {
  const links = ['a', 'b', 'c', 'd'].map((slug) => `https://venue.example/event/${slug}/contract-club/asheville-north-carolina/`);

  it('keeps the window, drops ended and far shows, and keeps rows when a page fails', () => {
    const pages = [
      { url: links[0], html: page({ day: 'Wednesday, October 07', time: 'Show: 8 pm' }) },
      { url: links[1], html: page() },
      { url: links[2], error: true },
      { url: links[3], html: page({ day: 'Monday, February 08', time: 'Show: 8 pm' }) },
    ];
    const snapshot = collectRhpEvents(links, pages, { now, timezone: tz });
    expect(snapshot.items.map((item) => item.uid)).toEqual([links[1]]);
    expect(snapshot.diagnostics).toEqual({ 'event page failed': 1 });
    expect(snapshot.retireMissing).toBe(false);
    const [adapter] = calendarAdapters([feed], [venue]);
    const result = processSourceItems(adapter, snapshot, { now, overrides: {} });
    expect(result.records).toEqual([expect.objectContaining({ id: expect.stringMatching(/^rhp-rhp-contract-/),
      venue: 'Contract Club', rating: 'general', sourceUrl: links[1] })]);
  });

  it('shortens the horizon at the page cap', () => {
    const many = Array.from({ length: MAX_EVENT_PAGES + 2 }, (_, i) => `https://venue.example/event/s${i}/x/`);
    const pages = many.slice(0, MAX_EVENT_PAGES).map((url) => ({ url, html: page() }));
    const snapshot = collectRhpEvents(many, pages, { now, timezone: tz });
    expect(snapshot.diagnostics).toEqual({ 'event page limit reached': 2 });
    expect(snapshot.horizon).toBe('2026-10-15T23:00:00.000Z');
  });
});

describe('fetching', () => {
  const respond = (body, status = 200) => ({ ok: status === 200, status, text: async () => body });

  it('reads the listing then each show page, and fails on a bad or empty listing', async () => {
    const [adapter] = calendarAdapters([feed], [venue]);
    const requested = [];
    const fetchImpl = async (url) => { requested.push(url); return respond(url === feed.url ? card('a') : page()); };
    const snapshot = await adapter.fetch({ fetchImpl, now });
    expect(requested).toEqual([feed.url, 'https://venue.example/event/a/contract-club/asheville-north-carolina/']);
    expect(snapshot.items).toHaveLength(1);
    await expect(adapter.fetch({ fetchImpl: async () => respond('', 404), now })).rejects.toThrow('(404)');
    await expect(adapter.fetch({ fetchImpl: async () => respond('<p>no shows</p>'), now })).rejects.toThrow('no event links');
  });
});

it('registers the rhp feed kind through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
});
