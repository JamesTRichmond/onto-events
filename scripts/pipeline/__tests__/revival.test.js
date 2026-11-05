const { revivalItems, cardDate, showTime, createRevivalAdapter } = require('../adapters/revival');
const { validateRegistries } = require('../registry-validation');

const venue = {
  name: 'Contract Bar', aliases: [], lat: 35.5918, lng: -82.5558, address: '66 Asheland Avenue', locality: 'Asheville', region: 'NC',
  sourceUrl: 'https://example.org/', kind: 'bar', allAges: 'unknown', verifiedOn: '2026-10-09',
};
const feed = {
  id: 'contract-revival', name: 'Contract Bar', kind: 'revival', sourceKind: 'community', serviceRegion: 'asheville',
  timezone: 'America/New_York', url: 'https://bar.example/calendar', defaultCategory: 'music', defaultRating: 'general',
  venueHint: 'Contract Bar', termsUrl: 'https://bar.example/', termsCheckedOn: '2026-10-09', notes: 'Contract feed.',
  fixturePath: 'scripts/pipeline/fixtures/revival/revival.html',
};
const now = Date.parse('2026-10-08T16:00:00Z');
const card = (weekday, day, time, title, href = `https://tickets.example/e/${title.length}`) => `<div role="listitem" class="ca-info w-dyn-item"><a href="${href}" class="cal-container-2"><div class="event-info-2"><div class="dayofevent"><p class="b-venue-2 date">${weekday}</p><p class="b-venue-2 comma">,</p><p class="b-venue-2 date">${day}</p></div><p class="b-venue-2 date dark">${time}</p><div class="title"><div class="b-show-2">${title}</div></div><div class="doortime"><p class="b-venue-2 doors">DOORS: </p><p class="b-venue-2 time space">Lorem ipsum dolor sit amet.</p></div></div></a></div>`;

it('takes the year from the weekday a card states', () => {
  expect(cardDate('Thursday', 'Oct 8', now, 'America/New_York')).toBe('20261008');
  expect(cardDate('Saturday', 'Jan 23', now, 'America/New_York')).toBe('20270123');
  expect(cardDate('Friday', 'Jan 23', now, 'America/New_York')).toBeNull();
  expect(cardDate('Someday', 'Oct 9', now, 'America/New_York')).toBeNull();
  // Just after midnight on New Year's Day, last night's card is still last year's.
  expect(cardDate('Thursday', 'Dec 31', Date.parse('2027-01-01T05:30:00Z'), 'America/New_York')).toBe('20261231');
  expect(showTime('8:00 pm')).toBe('200000');
  expect(showTime('9:30 PM')).toBe('213000');
  expect(showTime('TBA')).toBeNull();
});

it('lists each card at the venue by title and ticket link, never the placeholder text', () => {
  const html = [
    card('Thursday', 'Oct 8', '8:00 pm', 'Improvement Movement - Your Perfect Real LIVE &#x27;26'),
    card('Friday', 'Jan 23', '7:00 pm', 'Wrong weekday'),
    card('Saturday', 'Oct 31', 'Late', 'No time'),
    card('Sunday', 'Dec 20', '7:00 pm', 'Past the horizon'),
  ].join('');
  const { items, diagnostics } = revivalItems(html, feed, now);
  expect(items).toEqual([{
    uid: 'https://tickets.example/e/54', occurrence: '2026-10-09T00:00:00.000Z', title: 'Improvement Movement - Your Perfect Real LIVE \'26',
    description: '', location: '', url: 'https://tickets.example/e/54', timezone: 'America/New_York', start: '2026-10-09T00:00:00.000Z',
  }]);
  expect(diagnostics).toEqual({ 'missing event date': 1, 'missing event time': 1 });
  const record = createRevivalAdapter(feed, [venue]).normalize(items[0], { now, skip: () => {} });
  expect(record).toMatchObject({ venue: 'Contract Bar', rating: 'mature', ratingBasis: 'venue-default' });
  expect(record.description).not.toMatch(/lorem/i);
});

it('fails the run when the page has no cards', async () => {
  const adapter = createRevivalAdapter(feed, [venue]);
  await expect(adapter.fetch({ now, fetchImpl: async () => ({ ok: true, text: async () => '<p>Coming soon</p>' }) })).rejects.toThrow('no show cards');
  expect(validateRegistries([feed], [venue])).toEqual([]);
  expect(validateRegistries([{ ...feed, venueHint: undefined }], [venue])).not.toEqual([]);
});
