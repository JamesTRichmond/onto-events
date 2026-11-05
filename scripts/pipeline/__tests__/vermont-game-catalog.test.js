jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const { readSourceFixture } = require('../run-source');
const { createIcsAdapter } = require('../adapters/ics');
const { dedupeRecords } = require('../dedupe');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const { buildFeed } = require('../../../lib/feed');
const proposedFeeds = require('../../../docs/sources/proposals/feeds.proposed.json');
const liveVenues = require('../../../data/venues.json');
const proposedVenues = require('../../../docs/sources/proposals/venues.proposed.json');

const clock = '2026-10-10T01:46:32.350Z';
const now = Date.parse(clock);
const venues = [...liveVenues, ...proposedVenues.filter((value) => !liveVenues.some((live) => live.name === value.name))];
const ids = ['quarterstaff-burlington-games', 'vermont-gaming-academy-expansion', 'vermont-gaming-academy-vault'];
const feeds = proposedFeeds.filter((feed) => ids.includes(feed.id));
const records = feeds.flatMap((feed) => readSourceFixture(createIcsAdapter(feed, venues), undefined, { now }).records);
const future30 = records.filter((record) => Date.parse(record.startsAtIso) >= now && Date.parse(record.startsAtIso) < now + 30 * 86400000);
const unique = dedupeRecords(future30, { weak: false }).records;
const activities = unique.map((record) => catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record, clock))));

it('delivers real game fixtures through database rows and the app catalog without unrecognized or non-event cards', () => {
  expect(records).toHaveLength(360);
  expect(unique).toHaveLength(168);
  expect(activities).not.toContain(null);
  for (const activity of activities) {
    expect(activity).toMatchObject({ category: 'games', source: 'live', rating: 'general', attendees: 0 });
    expect(activity.title).not.toMatch(/^NO (OTHER|FRIDAY)/);
    expect(activity.sourceUrl).toMatch(/^https:\/\/www\.(quarterstaffgames|vermontgamingacademy)\.com\//);
  }
  const row = toSupabaseRow(unique[0], clock);
  expect(catalogEventToActivity(mapCatalogEvent({ ...row, is_cancelled: true }))).toBeNull();
  expect(catalogEventToActivity(mapCatalogEvent({ ...row, title: 'Private party' }))).toBeNull();
});

it.each([
  ['Burlington', 44.4759, -73.2121, 31],
  ['South Burlington', 44.4674, -73.1709, 137],
])('renders the measured thirty-day game supply around the declared %s city point at one mile', (name, lat, lng, count) => {
  const result = buildFeed(activities, { now, lat, lng, radiusMi: 1, sort: 'soonest', mode: 'everyone', interests: new Set() });
  expect(result.items).toHaveLength(count);
  expect(result.emptyReason).toBe('none');
  expect(result.items.every((item) => item.miles <= 1)).toBe(true);
});
