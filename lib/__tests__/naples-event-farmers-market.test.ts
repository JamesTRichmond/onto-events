import { LOCAL_ACTIVITIES } from '@/data/naples-events';
import { nextOccurrence } from '@/lib/recurrence';
import { regionForSpot } from '@/lib/service-region';

const NOW = Date.parse('2026-11-15T02:36:00.000Z');

it('uses the city calendar for the Third Street South Farmers Market', () => {
  const event = LOCAL_ACTIVITIES.find((item) => item.id === 'live-naples-third-street-market');
  expect(event?.sourceUrl).toBe(
    'https://www.naplesgov.com/parksrec/page/third-street-south-farmers-market-5',
  );
  expect(event?.rating).toBe('family');
  expect(regionForSpot(event!)).toBe('naples');
  const next = nextOccurrence(event!.recurrence!, NOW, { timeZone: 'America/New_York' });
  expect(new Date(next!.startsAt).toISOString()).toBe('2026-11-21T12:30:00.000Z');
  expect(new Date(next!.endsAt!).toISOString()).toBe('2026-11-21T16:30:00.000Z');
});
