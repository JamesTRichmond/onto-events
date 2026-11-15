import { LOCAL_ACTIVITIES } from '@/data/naples-events';
import { regionForSpot } from '@/lib/service-region';

it('keeps the library advisory board at the time Headquarters published', () => {
  const event = LOCAL_ACTIVITIES.find((item) => item.id === 'live-naples-library-advisory-board-20261118');
  expect(event).toMatchObject({
    sourceName: 'Collier County Public Library',
    startsAtIso: '2026-11-18T15:30:00.000Z',
    rating: 'general',
  });
  expect(event?.endsAtIso).toBeUndefined();
  expect(regionForSpot(event!)).toBe('naples');
});
