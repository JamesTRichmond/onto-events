import { LOCAL_ACTIVITIES } from '@/data/naples-events';
import { regionForSpot } from '@/lib/service-region';

it('keeps the Christmas Parade on the evening the city published', () => {
  const event = LOCAL_ACTIVITIES.find((item) => item.id === 'live-naples-christmas-parade-20261208');
  expect(event).toMatchObject({
    startsAtIso: '2026-12-08T23:30:00.000Z',
    endsAtIso: '2026-12-09T01:00:00.000Z',
    rating: 'family',
    source: 'live',
  });
  expect(Date.parse(event!.startsAtIso!)).toBeGreaterThan(Date.parse('2026-11-15T02:36:00.000Z'));
  expect(regionForSpot(event!)).toBe('naples');
});
