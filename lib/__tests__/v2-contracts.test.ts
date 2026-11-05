import { SEED_ACTIVITIES } from '@/data/activities';
import { parseRadius } from '@/lib/discovery-preferences';
import { readEventFacts } from '@/lib/event-facts';
import { isCancelledTitle, isRestrictedListing } from '@/lib/event-availability';
import { buildFeed, upcomingPlans } from '@/lib/feed';
import { sharePlan } from '@/lib/calendar-share';
import { catalogEventToActivity } from '@/hooks/use-event-catalog';
import { mapCatalogEvent } from '@/lib/backend/supabase-backend';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toSupabaseRow } = require('../../scripts/pipeline/to-supabase-row');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateRecord } = require('../../scripts/pipeline/schema');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { calendarRecord } = require('../../scripts/pipeline/calendar-record');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pipelineAvailability = require('../../scripts/pipeline/event-availability');

const evidence = { sourceUrl: 'https://example.org/public-event', excerpt: 'Admission is free and a meal is included.', checkedOn: '2026-09-30' };
const item = { ...SEED_ACTIVITIES[0], id: 'ics-fixture-test', category: 'music' as const, rating: 'general' as const, source: 'live' as const, sourceName: 'Public fixture', startsAtIso: '2026-10-01T18:00:00-06:00', timezone: 'America/Denver', recurrence: undefined };
const input = { now: Date.parse('2026-09-30T12:00:00Z'), lat: item.lat, lng: item.lng, radiusMi: 1, sort: 'nearest' as const, mode: 'everyone' as const, interests: new Set<string>(), includesFoodOnly: true };

it.each(['', '0', '101', 'Infinity', 'NaN', '1e2', '5junk', '-5', '0x10'])('rejects custom distance %p', (value) => expect(parseRadius(value)).toBeNull());
it.each(['1', '100', '2.5', ' 10 '])('accepts a complete finite distance %p', (value) => expect(parseRadius(value)).toBe(Number(value)));

it('food category, restaurant, free admission and unknown evidence do not prove included food', () => {
  const records = [item, { ...item, id: 'restaurant', category: 'food' as const, venue: 'Restaurant', admission: 'free' as const },
    { ...item, id: 'false', eventFacts: { includesFood: { ...evidence, value: false } } },
    { ...item, id: 'malformed', eventFacts: { includesFood: { ...evidence, sourceUrl: 'http://example.org', value: true } } },
    { ...item, id: 'confirmed', eventFacts: { includesFood: { ...evidence, value: true } } }];
  expect(buildFeed(records, input).items.map((record) => record.id)).toEqual(['confirmed']);
  expect(buildFeed([{ ...records[4], rating: 'mature' }], input).items).toEqual([]);
});

it('publisher evidence survives canonical row, backend and cached catalog conversion without a migration', () => {
  const eventFacts = { admission: { ...evidence, value: 'free' }, includesFood: { ...evidence, value: true } };
  const record = { ...item, eventFacts };
  expect(validateRecord(record).ok).toBe(true);
  const mapped = catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)));
  expect(mapped?.eventFacts).toEqual(eventFacts);
  expect(mapped?.admission).toBe('free');
  expect(buildFeed([mapped!], { ...input, freeOnly: true }).items).toHaveLength(1);
  expect(validateRecord({ ...record, eventFacts: { includesFood: true } }).ok).toBe(false);
});

it('invalid dates, credential URLs and unsupported values stay unknown', () => {
  for (const fact of [{ ...evidence, checkedOn: '2026-02-30' }, { ...evidence, sourceUrl: 'https://name:password@example.org/' }, { ...evidence, excerpt: '' }]) {
    expect(readEventFacts({ includesFood: { ...fact, value: true } })).toEqual({});
  }
});

it('conflicting or malformed supplied admission never passes Free only', () => {
  const records = [
    { ...item, admission: 'free' as const, eventFacts: { admission: { ...evidence, value: 'paid' as const } } },
    { ...item, admission: 'paid' as const, eventFacts: { admission: { ...evidence, value: 'free' as const } } },
    { ...item, admission: 'free' as const, eventFacts: { admission: { ...evidence, sourceUrl: 'http://example.org', value: 'free' as const } } },
  ];
  for (const record of records) {
    expect(buildFeed([record], { ...input, includesFoodOnly: false, freeOnly: true }).items).toEqual([]);
    const cached = catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)));
    expect(buildFeed([cached!], { ...input, includesFoodOnly: false, freeOnly: true }).items).toEqual([]);
  }
});

it('explicit cancellation survives the pipeline and cannot reappear in discovery or Going from old cache', () => {
  for (const title of ['NO CLASS Siddhartha’s Legacy', 'Cancelled: Concert', 'Service is canceled', '*CANCELLED* Foundation Skatepark Benefit', '[Canceled] Patio Show']) {
    expect(isCancelledTitle(title)).toBe(true);
    expect(pipelineAvailability.isCancelledTitle(title)).toBe(true);
    const record = { ...item, title };
    expect(buildFeed([record], { ...input, includesFoodOnly: false }).items).toEqual([]);
    expect(upcomingPlans([record], new Set([record.id]), input)).toEqual([]);
  }
  expect(isCancelledTitle('Cancellation Policy Workshop')).toBe(false);
  expect(isCancelledTitle('Star Wars (Cancelled TV Show Night)')).toBe(false);
  expect(pipelineAvailability.isCancelledTitle('Cancellation Policy Workshop')).toBe(false);
  const feed = { id: 'public-fixture', name: 'Public fixture', kind: 'ics', defaultCategory: 'community', defaultRating: 'general', timezone: 'America/Denver', url: 'https://example.org/calendar' };
  const venue = { name: item.venue, aliases: [], address: 'Public venue', locality: 'Salt Lake City', region: 'UT', lat: item.lat, lng: item.lng, kind: 'hall' };
  const canonical = calendarRecord({ uid: 'cancelled-title', title: 'NO CLASS Public fixture', location: venue.name, start: item.startsAtIso }, { feed, venues: [venue] });
  expect(canonical.isCancelled).toBe(true);
  expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(canonical)))).toBeNull();
  expect(buildFeed([{ ...item, isCancelled: true }], { ...input, includesFoodOnly: false }).items).toEqual([]);
});

it.each(['Private party', 'Eliot Hall Rental: Reception', 'Hall/Kitchen/Chapel: Rental', 'Hall — Rental', 'Members-only meeting', 'Invitation-only art', 'Staff-only meeting'])('excludes explicit restricted listing %p from cached discovery and Going', (title) => {
  const record = { ...item, title };
  expect(isRestrictedListing(title)).toBe(true);
  expect(pipelineAvailability.isRestrictedListing(title, '')).toBe(true);
  expect(buildFeed([record], { ...input, includesFoodOnly: false }).items).toEqual([]);
  expect(upcomingPlans([record], new Set([record.id]), input)).toEqual([]);
  expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).toBeNull();
});

it('keeps public listings with private-party advertising while rejecting direct private declarations', () => {
  const publicRecord = { ...item, title: 'Public zoo day', description: 'All welcome. Book a private party at our venue.' };
  expect(isRestrictedListing(publicRecord.title, publicRecord.description)).toBe(false);
  expect(pipelineAvailability.isRestrictedListing(publicRecord.title, publicRecord.description)).toBe(false);
  expect(buildFeed([publicRecord], { ...input, includesFoodOnly: false }).items).toHaveLength(1);
  const privateRecord = { ...item, description: 'This event is private.' };
  expect(buildFeed([privateRecord], { ...input, includesFoodOnly: false }).items).toEqual([]);
  expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(privateRecord)))).toBeNull();
});

it('excludes direct members-and-their-guests invitations from ingestion, cached discovery and Going', () => {
  const description = 'JAM welcomes Media Maker Members and their guests to a work in progress session.';
  const record = { ...item, title: 'Media Maker Monday', description };
  expect(isRestrictedListing(record.title, description)).toBe(true);
  expect(pipelineAvailability.isRestrictedListing(record.title, description)).toBe(true);
  expect(buildFeed([record], { ...input, includesFoodOnly: false }).items).toEqual([]);
  expect(upcomingPlans([record], new Set([record.id]), input)).toEqual([]);
  expect(catalogEventToActivity(mapCatalogEvent(toSupabaseRow(record)))).toBeNull();
});

it('preserves unrestricted community invitations and public events with member discounts', () => {
  for (const description of [
    'All members of the Upper Valley community are invited. All are welcome!',
    'Members and their guests get a discount. Open to the public.',
    'Open to all Lampshaders as well as any poet who is interested.',
  ]) {
    expect(isRestrictedListing('Public program', description)).toBe(false);
    expect(pipelineAvailability.isRestrictedListing('Public program', description)).toBe(false);
    expect(buildFeed([{ ...item, description }], { ...input, includesFoodOnly: false }).items).toHaveLength(1);
  }
});

it('share uses the public event time even when a card says Happening now and contains no private data', () => {
  const message = sharePlan({ ...item, whenLabel: 'Happening now', id: 'private-id', joined: true, userId: 'private-person', lat: 1, lng: 2 } as typeof item);
  expect(message).toContain('Oct 1, 2026');
  expect(message).toContain('6:00 PM MDT');
  expect(message).not.toMatch(/private-id|private-person|Happening now|latitude|joined/);
  expect(message).not.toMatch(/https?:\/\//i);
});

it('a recurring event shares its resolved date and start rather than Happening now', () => {
  const now = new Date(2026, 8, 30, 18, 30).getTime();
  const recurring = { ...item, startsAtIso: undefined, recurrence: { days: [new Date(now).getDay()], startHour: 18, endHour: 20 }, timezone: undefined };
  const shown = buildFeed([recurring], { ...input, now, includesFoodOnly: false }).items[0];
  expect(shown.whenLabel).toContain('Happening now');
  const message = sharePlan(shown);
  expect(message).toContain('Sep 30, 2026');
  expect(message).toContain('6:00 PM');
  expect(message).not.toContain('Happening now');
});
