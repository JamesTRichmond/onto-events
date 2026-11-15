import { SPOTS } from '@/data/spots';
import { regionForSpot } from '@/lib/service-region';

it('keeps delnor wiggins inside Collier County with a publisher link', () => {
  const spot = SPOTS.find((item) => item.id === 'spot-naples-delnor-wiggins');
  expect(spot).toMatchObject({
    serviceRegion: 'naples',
    placeKind: 'water',
    approximate: true,
    checkedOn: '2026-11-14',
  });
  expect(spot?.sourceUrl).toMatch(/^https:\/\//);
  expect(spot?.address).toBeTruthy();
  expect(regionForSpot(spot!)).toBe('naples');
});
