import { LOCAL_ACTIVITIES } from '@/data/naples-events';
import { nextOccurrence } from '@/lib/recurrence';
import { regionForSpot } from '@/lib/service-region';

const NOW = Date.parse('2026-11-15T02:36:00.000Z');

it('keeps the Cambier Park beach church on the Sundays the city listed', () => {
  const event = LOCAL_ACTIVITIES.find((item) => item.id === 'live-naples-cambier-beach-church');
  expect(event?.source).toBe('live');
  expect(regionForSpot(event!)).toBe('naples');
  const next = nextOccurrence(event!.recurrence!, NOW, { timeZone: 'America/New_York' });
  expect(new Date(next!.startsAt).toISOString()).toBe('2026-11-15T14:30:00.000Z');
  const after = nextOccurrence(event!.recurrence!, Date.parse('2026-11-23T15:00:00.000Z'), {
    timeZone: 'America/New_York',
  });
  expect(after).toBeNull();
});
