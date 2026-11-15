import { LOCAL_ACTIVITIES } from '@/data/naples-events';
import { regionForSpot } from '@/lib/service-region';

it('keeps Music in the Garden on Sat, Dec 12, 2:00 PM at the hours the garden published', () => {
  const event = LOCAL_ACTIVITIES.find((item) => item.id === 'live-naples-nbg-music-20261212');
  expect(event).toMatchObject({
    sourceName: 'Naples Botanical Garden',
    admission: 'paid',
    rating: 'family',
    startsAtIso: '2026-12-12T19:00:00.000Z',
    endsAtIso: '2026-12-12T21:00:00.000Z',
    whenLabel: 'Sat, Dec 12, 2:00 PM',
  });
  expect(regionForSpot(event!)).toBe('naples');
});
