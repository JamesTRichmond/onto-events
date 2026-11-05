jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const fs = require('node:fs');
const { calendarAdapters } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRegistries } = require('../registry-validation');
const { toSupabaseRow } = require('../to-supabase-row');
const { mapCatalogEvent } = require('../../../lib/backend/supabase-backend');
const { catalogEventToActivity } = require('../../../hooks/use-event-catalog');
const feed = require('../../../docs/sources/vermont-round-two/batch-08-sheldon-free/feed.json');
const venue = require('../../../docs/sources/vermont-round-two/batch-08-sheldon-free/venue.json');
const body = require('../fixtures/squarespace/henry-sheldon-museum.json');
const now = Date.parse(body.capture.evaluationClock);
const adapter = () => calendarAdapters([feed], [venue])[0];

it('reads two genuinely free museum programmes at their current offsite library venue', () => {
  const result = readSourceFixture(adapter(), undefined, { now });
  expect(result.records.map(({ title, venue, startsAtIso, endsAtIso, rating }) => ({ title, venue, startsAtIso, endsAtIso, rating }))).toEqual([
    { title: 'Illustrating Vermont History', venue: venue.name, startsAtIso: '2026-10-24T17:00:00.000Z', endsAtIso: '2026-10-24T19:00:00.000Z', rating: 'general' },
    { title: 'Considering the Life Museum', venue: venue.name, startsAtIso: '2026-11-06T22:30:00.000Z', endsAtIso: '2026-11-06T23:30:00.000Z', rating: 'general' },
  ]);
  expect(result.rejectedCount).toBe(0);
  expect(result.retireMissing).toBe(false);
  for (const record of result.records) {
    expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).not.toBeNull();
    expect(record.description).not.toMatch(/@|omitted/);
  }
});

it('excludes actual ticketed and multiweek listings and fails closed when free public admission changes', () => {
  const a = adapter(), events = a.parseFixture(JSON.stringify(body), { now }).items;
  expect(events.some((e) => e.title === 'Welcome Blanket Project')).toBe(true);
  expect(events.some((e) => e.title === 'Rolling down the Tracks: Holiday Trains!')).toBe(true);
  for (const event of events.filter((e) => /Welcome Blanket|Holiday Trains|Walking Tour/.test(e.title))) {
    expect(a.normalize(event, { now })).toBeNull();
  }
  const event = events.find((e) => e.title === 'Considering the Life Museum');
  for (const description of ['Tickets cost $20.', 'Museum members receive free admission.', event.description + ' General admission costs $20.', event.description + ' This programme is private.', event.description + ' This programme is online-only.']) {
    expect(a.normalize({ ...event, description }, { now })).toBeNull();
  }
});

it('does not replace an unknown event venue with the museum or library address and retains cancellation ownership', () => {
  const a = adapter(), event = a.parseFixture(JSON.stringify(body), { now }).items.find((e) => e.title === 'Considering the Life Museum');
  const original = a.normalize(event, { now });
  expect(a.normalize({ ...event, location: 'Henry Sheldon Museum' }, { now })).toBeNull();
  expect(a.normalize({ ...event, location: 'Unreviewed library branch' }, { now })).toBeNull();
  expect(a.normalize({ ...event, title: 'Cancelled: ' + event.title }, { now })).toMatchObject({ id: original.id, isCancelled: true });
  expect(a.normalize({ ...event, description: event.description + ' Adults only, ages 18+.' }, { now })).toMatchObject({ rating: 'mature' });
});

it('adds one publisher identity and its reviewed offsite venue without requesting prohibited Squarespace exports', () => {
  const feeds = require('../../../data/feeds.json'), venues = require('../../../data/venues.json');
  expect(validateRegistries(feeds, venues)).toEqual([]);
  expect(feeds.find((f) => f.id === feed.id)).toEqual(feed);
  expect(venues.find((v) => v.name === venue.name)).toEqual(venue);
  expect(fs.readFileSync('.github/workflows/sync-events.yml', 'utf8')).toContain(`- '${feed.name}'`);
  expect(body.rss).not.toMatch(/format=(?:json|ical)/);
  expect(Object.keys(body.pages)).toHaveLength(28);
  expect(Object.keys(body.pages).every((url) => new URL(url).origin === 'https://www.henrysheldonmuseum.org')).toBe(true);
});
