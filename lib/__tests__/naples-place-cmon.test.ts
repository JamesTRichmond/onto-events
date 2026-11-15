import { SPOTS } from '@/data/spots';
import { regionForSpot } from '@/lib/service-region';

it('keeps cmon inside Collier County with a publisher link', () => {
  const spot = SPOTS.find((item) => item.id === 'spot-naples-cmon');
  expect(spot).toMatchObject({
    serviceRegion: 'naples',
    placeKind: 'indoor',
    approximate: true,
    checkedOn: '2026-11-14',
  });
  expect(spot?.sourceUrl).toMatch(/^https:\/\//);
  expect(spot?.address).toBeTruthy();
  expect(regionForSpot(spot!)).toBe('naples');
});
