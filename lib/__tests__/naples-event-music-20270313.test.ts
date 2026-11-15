import { LOCAL_ACTIVITIES } from '@/data/naples-events';
import { regionForSpot } from '@/lib/service-region';

it('keeps Music in the Garden on Sat, Mar 13, 2:00 PM at the hours the garden published', () => {
  const event = LOCAL_ACTIVITIES.find((item) => item.id === 'live-naples-nbg-music-20270313');
  expect(event).toMatchObject({
    sourceName: 'Naples Botanical Garden',
    admission: 'paid',
    rating: 'family',
    startsAtIso: '2027-03-13T19:00:00.000Z',
    endsAtIso: '2027-03-13T21:00:00.000Z',
    whenLabel: 'Sat, Mar 13, 2:00 PM',
  });
  expect(regionForSpot(event!)).toBe('naples');
});
