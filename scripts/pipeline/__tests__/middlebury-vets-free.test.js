jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const fs = require('node:fs');
const { calendarAdapters } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const feed = require('../../../docs/sources/vermont-round-two/batch-07-middlebury-vets/feed.json');
const venue = require('../../../docs/sources/vermont-round-two/batch-07-middlebury-vets/venue.json');
const body = require('../fixtures/tribe/vermont-vets-town-halls.json');
const now = Date.parse(body.capture.evaluationClock);
const adapter = () => calendarAdapters([feed], [venue])[0];

it('does not classify the real family-of-veterans audience meeting as a children’s activity', () => {
  const result = readSourceFixture(adapter(), undefined, { now });
  expect(result.records).toHaveLength(1);
  expect(result.records[0]).toMatchObject({ title: 'Middlebury Family Vets Town Hall (2026)', rating: 'general', venue: venue.name, locality: 'Middlebury', startsAtIso: '2026-11-12T22:30:00.000Z' });
  expect(result.records[0].endsAtIso).toBeUndefined();
  expect(result.rejectedCount).toBe(0);
  expect(result.retireMissing).toBe(false);
  expect(result.skipped).toEqual({ 'restricted or room-booking listing': 9 });
  expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(result.records[0])))).not.toBeNull();
});

it('preserves real child-focused activities and stronger age restrictions when a title contains kinship language', () => {
  const { rateCalendarEvent } = require('../calendar-record');
  const a = adapter(), event = a.parseFixture(JSON.stringify(body), { now }).items.find((r) => r.title.startsWith('Middlebury'));
  expect(rateCalendarEvent({ ...event, title: 'Family Vets Town Hall: Children’s Storytime' }, venue, feed)).toBe('family');
  expect(rateCalendarEvent({ ...event, title: 'Family Museum Day' }, venue, feed)).toBe('family');
  expect(rateCalendarEvent({ ...event, description: event.description + ' Adults only, ages 18+.' }, venue, feed)).toBe('mature');
});

it('requires free public physical attendance and preserves cancellation identity without borrowing another town’s venue', () => {
  const a = adapter(), event = a.parseFixture(JSON.stringify(body), { now }).items.find((r) => r.title.startsWith('Middlebury'));
  const original = a.normalize(event, { now });
  expect(a.normalize({ ...event, title: 'Cancelled: ' + event.title }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  for (const description of ['General admission costs $20.', 'This event is private.', event.description + ' This event is online-only.']) {
    expect(a.normalize({ ...event, description }, { now })).toBeNull();
  }
  expect(a.normalize({ ...event, location: 'A different Town Hall Theater' }, { now })).toBeNull();
  expect(original.description).toContain('See the publisher');
  expect(original.description).not.toMatch(/@|omitted/);
});

it('adds only one scoped publisher contract and public studio to the candidate registry', () => {
  const feeds = require('../../../data/feeds.json'), venues = require('../../../data/venues.json');
  expect(validateRegistries(feeds, venues)).toEqual([]);
  expect(feeds.find((f) => f.id === feed.id)).toEqual(feed);
  expect(venues.find((v) => v.name === venue.name)).toEqual(venue);
  expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain(`- '${feed.name}'`);
});
