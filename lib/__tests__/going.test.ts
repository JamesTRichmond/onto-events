import { goingSections, parsePlans, snapshot, type PlanEvent, type PlanRecords } from '@/lib/going';

const now = Date.parse('2026-10-28T12:00:00Z');
const event: PlanEvent = { id: 'event', title: 'Community event', venue: 'Public venue', whenLabel: '',
  rating: 'general', startsAtIso: '2026-10-28T14:00:00Z', endsAtIso: '2026-10-28T15:00:00Z' };
const record = (e: PlanEvent, unmarkedAt?: number) => ({ event: e, savedAt: now-1000, ...(unmarkedAt === undefined ? {} : { unmarkedAt }) });

it('puts upcoming first in time order and retains ended plans as labeled history data', () => {
  const past = { ...event, id: 'past', startsAtIso: '2026-10-27T12:00:00Z', endsAtIso: '2026-10-27T13:00:00Z' };
  const early = { ...event, id: 'early', startsAtIso: '2026-10-28T13:00:00Z' };
  const records = { event: record(event), past: record(past), early: record(early) };
  const sections = goingSections(records, new Set(['event','past','early']), now, 'everyone');
  expect(sections.upcoming.map(p=>p.event.id)).toEqual(['early','event']);
  expect(sections.past.map(p=>p.event.id)).toEqual(['past']);
});

it('removes unmarked upcoming plans and keeps plans unmarked after their end as history', () => {
  const records = { event: record(event, now) };
  expect(goingSections(records, new Set(), now, 'everyone').upcoming).toEqual([]);
  expect(goingSections(records, new Set(), now+86400000, 'everyone').past).toEqual([]);
  records.event = record(event, now+86400000);
  expect(goingSections(records, new Set(), now+86400000, 'everyone').past).toHaveLength(1);
});

it('enforces the existing modes, never treating unknown or 21+ ratings as family', () => {
  const records: PlanRecords = {};
  for (const rating of ['family','general','mature',undefined] as const) {
    const id = String(rating); records[id] = record({ ...event, id, rating });
  }
  const ids = new Set(Object.keys(records));
  expect(goingSections(records, ids, now, 'family').upcoming.map(p=>p.event.rating)).toEqual(['family']);
  expect(goingSections(records, ids, now, 'everyone').upcoming.map(p=>p.event.rating)).toEqual(['general']);
  process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
  expect(goingSections(records, ids, now, 'mature').upcoming.map(p=>p.event.rating).sort()).toEqual(['general','mature']);
  delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
  expect(goingSections(records, ids, now, 'mature').upcoming.map(p=>p.event.rating)).toEqual(['general']);
});

it('retains publisher snapshots without any Discover radius/window/query or device coordinates', () => {
  const withDevice = { ...event, lat: 40.123456, lng: -111.123456, miles: 400 };
  const saved = snapshot(withDevice);
  expect(saved).not.toHaveProperty('lat');
  expect(saved).not.toHaveProperty('lng');
  expect(saved).not.toHaveProperty('miles');
  const records = parsePlans(JSON.stringify({ event: record(saved) }));
  expect(goingSections(records, new Set(['event']), now, 'everyone').upcoming).toHaveLength(1);
  expect(goingSections(records, new Set(['event']), now+86400000, 'everyone').past).toHaveLength(1);
});

it('keeps unknown times separate rather than inventing an event end', () => {
  const records = { event: record({ ...event, startsAtIso: undefined, endsAtIso: undefined }) };
  expect(goingSections(records, new Set(['event']), now, 'everyone').undated).toHaveLength(1);
  expect(parsePlans('garbage')).toEqual({});
});
