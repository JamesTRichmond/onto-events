const { labeledFields, labeledDate, labeledTimes, pageItems, expandLabeledPages, createLabeledAdapter } = require('../adapters/labeled');
const { locationCandidate } = require('../calendar-record');
const { validateRegistries } = require('../registry-validation');

const venue = {
  name: 'Contract Center', aliases: [], lat: 35.5975, lng: -82.5553, address: '87 Haywood Street', locality: 'Asheville', region: 'NC',
  sourceUrl: 'https://example.org/', kind: 'hall', allAges: 'unknown', verifiedOn: '2026-10-09',
};
const feed = {
  id: 'contract-labeled', name: 'Contract Center', kind: 'labeled', sourceKind: 'community', serviceRegion: 'asheville',
  timezone: 'America/New_York', url: 'https://center.example/events-tickets/', eventHosts: ['center.example'], eventPath: '^/events/[a-z0-9-]+/$',
  defaultCategory: 'music', titleCategories: { volleyball: 'sports', 'craft fair': 'sales' }, defaultRating: 'general',
  venueHint: 'Contract Center', campusRooms: true, termsUrl: 'https://center.example/', termsCheckedOn: '2026-10-09',
  notes: 'Contract feed.', fixturePath: 'scripts/pipeline/fixtures/labeled/harrahs-cherokee-center.json',
};
const now = Date.parse('2026-10-09T12:00:00Z');
const page = ({ title, date, venueName = 'Arena.example.com Arena', doors, times, policy, prose = 'A night out.' }) => `
<h1 class="title">${title}</h1>
<div class="avia_textblock single-event-details">
  <p><strong>DATE</strong><br> ${date} </p>
  <p><strong>VENUE</strong><br> ${venueName} </p>
  ${doors ? `<dl><dt>DOORS</dt><dd>${doors}</dd></dl>` : ''}
  ${times ? `<dl><dt>EVENT TIME(S)</dt><dd>${times}</dd></dl>` : ''}
  ${policy ? `<p><strong>ENTRY POLICY</strong><br> ${policy} </p>` : ''}
  <script>var hidden = "<strong>DATE</strong><br>Monday, January 1, 2029</p>";</script>
</div>
<div class="event-featured-image"></div>
<section><div class="avia_textblock"><p>${prose}</p><p><a href="#" class="event-read-more-link">Read More</a></p></div></section>
<section><div class="avia_textblock"><h4>RELATED EVENTS</h4></div></section>
<section><div class="avia_textblock"><p>Another show entirely.</p></div></section>`;

it('reads the labels in both markups, ignoring script text', () => {
  expect(labeledFields(page({ title: 'Show', date: 'Friday, October 23, 2026', doors: '6:30 pm', times: '7:30 pm', policy: 'Ages 2 and up require a ticket.' }))).toEqual({
    DATE: 'Friday, October 23, 2026', VENUE: 'Arena.example.com Arena', DOORS: '6:30 pm', 'EVENT TIME(S)': '7:30 pm', 'ENTRY POLICY': 'Ages 2 and up require a ticket.',
  });
});

it('accepts only a full date with its year, and the clock times a page states', () => {
  expect(labeledDate('Wednesday, October 28, 2026')).toBe('20261028');
  expect(labeledDate('Sept 3, 2027')).toBe('20270903');
  expect(labeledDate('October 28')).toBeNull();
  expect(labeledDate('February 30, 2027')).toBeNull();
  expect(labeledTimes('10:00 am - 5:00 pm')).toEqual([{ start: '100000', end: '170000' }]);
  expect(labeledTimes('12p - 6p')).toEqual([{ start: '120000', end: '180000' }]);
  expect(labeledTimes('2:00 pm & 7:30 pm')).toEqual([{ start: '140000' }, { start: '193000' }]);
  expect(labeledTimes('Varies Daily')).toEqual([]);
});

it('reads each part of a times value on its own, and never a doors time as a show', () => {
  expect(labeledTimes('2:00 pm - 4:00 pm & 7:00 pm - 9:00 pm')).toEqual([{ start: '140000', end: '160000' }, { start: '190000', end: '210000' }]);
  expect(labeledTimes('2pm-4pm, 7pm')).toEqual([{ start: '140000', end: '160000' }, { start: '190000' }]);
  expect(labeledTimes('2:00 pm and 7:30 pm')).toEqual([{ start: '140000' }, { start: '193000' }]);
  expect(labeledTimes('8:00 pm (doors 7:00 pm)')).toEqual([{ start: '200000' }]);
  // A clock without its own meridiem, a word for a time or a doors line is
  // reported rather than read as a different show time.
  expect(labeledTimes('2 - 4 pm & 7 - 9 pm')).toEqual([]);
  expect(labeledTimes('Noon - 5 pm')).toEqual([]);
  expect(labeledTimes('Doors 7 pm, show 8 pm')).toEqual([]);
  expect(labeledTimes('7:00 pm 8:00 pm 9:00 pm')).toEqual([]);
});

it('lists each stated show time at the room, with the page’s facts and prose', () => {
  const html = page({ title: 'Indoor Volleyball: Open Play', date: 'Thursday, October 22, 2026', doors: '5:00 pm', times: '5:00 pm - 9:00 pm', policy: 'All ages.' });
  const { items } = pageItems('https://center.example/events/open-play/', html, feed, now);
  expect(items).toEqual([expect.objectContaining({
    uid: 'https://center.example/events/open-play/', title: 'Indoor Volleyball: Open Play',
    start: '2026-10-22T21:00:00.000Z', end: '2026-10-23T01:00:00.000Z', location: 'Arena.example.com Arena', ageNote: 'All ages.',
    description: 'Doors: 5:00 pm. Entry policy: All ages. A night out.',
  })]);
  const twoShows = pageItems('https://center.example/events/two/', page({ title: 'Two Shows', date: 'Saturday, October 24, 2026', times: '2:00 pm & 7:30 pm' }), feed, now);
  expect(twoShows.items.map((item) => item.occurrence)).toEqual(['2026-10-24T18:00:00.000Z', '2026-10-24T23:30:00.000Z']);
  // The feed files its own title words under a category; other titles keep the default.
  const adapter = createLabeledAdapter(feed, [venue]);
  expect(adapter.normalize(items[0], { now, skip: () => {} }).category).toBe('sports');
  expect(adapter.normalize(twoShows.items[0], { now, skip: () => {} }).category).toBe('music');
});

it('reports a page without a year or a show time, and ignores pages outside the horizon', () => {
  const snapshot = expandLabeledPages([
    ['https://center.example/events/a/', page({ title: 'No year', date: 'October 22', times: '7:00 pm' })],
    ['https://center.example/events/b/', page({ title: 'Varies', date: 'Thursday, November 19, 2026', times: 'Varies Daily' })],
    ['https://center.example/events/c/', page({ title: 'Far', date: 'Friday, March 12, 2027', times: 'Varies Daily' })],
    ['https://center.example/events/d/', null],
  ], feed, now);
  expect(snapshot.items).toEqual([]);
  expect(snapshot.diagnostics).toEqual({ 'missing event date': 1, 'missing event time': 1, 'event page fetch failed': 1 });
  expect(snapshot.retireMissing).toBe(false);
});

// "ExploreAsheville.com Arena" is the arena's name, not a web address.
it('keeps a room named after a web domain, and still drops bare domains', () => {
  expect(locationCandidate('ExploreAsheville.com Arena')).toBe('ExploreAsheville.com Arena');
  expect(locationCandidate('wilkescenter.utah.edu…')).toBe('');
  expect(locationCandidate('zoom.us/j/123 (Meeting ID 4)')).toBe('');
  const adapter = createLabeledAdapter(feed, [venue]);
  const html = page({ title: 'Craft Fair of the Highlands', date: 'Thursday, October 15, 2026', times: '10:00 am - 5:00 pm' });
  const [item] = pageItems('https://center.example/events/fair/', html, feed, now).items;
  expect(adapter.normalize(item, { now, skip: () => {} })).toMatchObject({
    venue: 'Contract Center', category: 'sales', description: expect.stringMatching(/^Where: Arena\.example\.com Arena\. /),
  });
});

it('fetches the listing and its linked pages with the feed pacing', async () => {
  const adapter = createLabeledAdapter({ ...feed, minIntervalMs: 1000 }, [venue]);
  const requested = [];
  const snapshot = await adapter.fetch({ now, fetchImpl: async (url, options) => {
    requested.push(url);
    expect(options).toEqual({ minIntervalMs: 1000, timeoutMs: undefined });
    if (url === feed.url) return { ok: true, text: async () => '<a href="/events/one/">1</a><a href="https://center.example/events/one/?ref=x">1</a><a href="/visit/">v</a>' };
    return { ok: true, text: async () => page({ title: 'One', date: 'Friday, October 23, 2026', times: '7:30 pm' }) };
  } });
  expect(requested).toEqual([feed.url, 'https://center.example/events/one/']);
  expect(snapshot.items.map((item) => item.title)).toEqual(['One']);
  await expect(adapter.fetch({ now, fetchImpl: async () => ({ ok: true, text: async () => '<p>No events</p>' }) })).rejects.toThrow('links no event pages');
});

it('validates link and category settings through the shared registry rules', () => {
  expect(validateRegistries([feed], [venue])).toEqual([]);
  const bad = (change) => validateRegistries([{ ...feed, ...change }], [venue]);
  expect(bad({ eventPath: undefined })).not.toEqual([]);
  expect(bad({ titleCategories: { volleyball: 'volleyball' } })).not.toEqual([]);
  expect(bad({ titleCategories: { 'Bad Phrase!': 'sports' } })).not.toEqual([]);
  expect(bad({ titleCategories: {} })).not.toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'jsonld', titleCategories: undefined, campusRooms: undefined }], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, kind: 'ics', titleCategories: undefined }], [venue])).not.toEqual([]);
});
