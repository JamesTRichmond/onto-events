import { LOCAL_ACTIVITIES } from '@/data/naples-events';
import { regionForSpot } from '@/lib/service-region';

it('keeps Music in the Garden on Sat, Jun 12, 12:00 PM at the hours the garden published', () => {
  const event = LOCAL_ACTIVITIES.find((item) => item.id === 'live-naples-nbg-music-20270612');
  expect(event).toMatchObject({
    sourceName: 'Naples Botanical Garden',
    admission: 'paid',
    rating: 'family',
    startsAtIso: '2027-06-12T16:00:00.000Z',
    endsAtIso: '2027-06-12T18:00:00.000Z',
    whenLabel: 'Sat, Jun 12, 12:00 PM',
  });
  expect(regionForSpot(event!)).toBe('naples');
});
