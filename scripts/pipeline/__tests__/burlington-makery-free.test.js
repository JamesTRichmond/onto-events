jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const fs = require('node:fs');
const { calendarAdapters } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const feed = require('../../../docs/sources/vermont-round-two/batch-09-burlington-free/feeds.json').find((f) => f.id === 'the-makery-burlington');
const venue = require('../../../docs/sources/vermont-round-two/batch-09-burlington-free/venues.json').find((v) => v.name === 'The Makery Burlington');
const html = fs.readFileSync('scripts/pipeline/fixtures/schedule/the-makery-burlington.html', 'utf8');
// The HTML programme was captured on October16, not generated from a recurrence.
const now = Date.parse('2026-10-16T17:32:21.044Z');
const adapter = () => calendarAdapters([feed], [venue])[0];

it('reads the actual free November5 craft night at its published Burlington address', () => {
  const result = readSourceFixture(adapter(), undefined, { now });
  expect(result.records).toHaveLength(1);
  expect(result.records[0]).toMatchObject({ title: 'Bring Your Own Craft Night', venue: venue.name, locality: 'Burlington', rating: 'general', startsAtIso: '2026-11-05T22:00:00.000Z', endsAtIso: '2026-11-06T00:00:00.000Z' });
  expect(result.rejectedCount).toBe(0);
  expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(result.records[0])))).not.toBeNull();
  expect(result.records[0].description).not.toMatch(/@|omitted/);
});

it('never invents another monthly craft night after the three explicitly published dates end', () => {
  expect(feed.schedule.events).toHaveLength(1);
  expect(feed.schedule.events[0].dates).toEqual(['2026-09-03', '2026-10-01', '2026-11-05']);
  expect(readSourceFixture(adapter(), undefined, { now: Date.parse('2026-11-06T01:00:00Z') }).records).toEqual([]);
});

it('halts for review if programme access, dates or address change, even when old text survives in scripts', () => {
  const a = adapter();
  const changed = [
    html.replace('Free! No registration Required', 'Admission costs $20. Registration required.'),
    html.replace('Free! No registration Required', 'Free! Private members only. No registration Required'),
    html.replace('Free! No registration Required', 'Free! No registration Required This event is cancelled.'),
    html.replace('Nov. 5, 2026', 'Nov. 12, 2026'),
    html.replace('388 Pine St, Burlington VT', '390 Pine St, Burlington VT'),
    '<p>Closed.</p><script>' + feed.schedule.evidence.join(' ') + '</script>',
  ];
  for (const page of changed) expect(() => a.parseFixture(page, { now })).toThrow('Published schedule no longer states');
  // The paid adjacent children's class is a boundary, never a second event.
  expect(a.parseFixture(html, { now }).items.map((e) => e.title)).toEqual(['Bring Your Own Craft Night']);
});

it('registers one publisher and one venue with the existing schedule reader', () => {
  const feeds = require('../../../data/feeds.json'), venues = require('../../../data/venues.json');
  expect(validateRegistries(feeds, venues)).toEqual([]);
  expect(feeds.find((f) => f.id === feed.id)).toEqual(feed);
  expect(venues.find((v) => v.name === venue.name)).toEqual(venue);
  expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain(`- '${feed.name}'`);
});
