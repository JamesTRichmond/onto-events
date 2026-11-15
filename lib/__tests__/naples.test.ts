import { CITIES, COMING_SOON_CITIES, cityById } from '@/data/cities';
import { NAPLES, regionForSpot, regionLocalities } from '@/lib/service-region';
import { timeZoneForSpot } from '@/lib/pinned-spot';
import { weatherCell } from '@/lib/weather/cell';

const anchor = { lat: 26.146459, lng: -81.798961 };

it('launches Naples in Collier County without borrowing a neighboring metro', () => {
  expect(cityById('naples')).toMatchObject({
    name: 'Naples',
    state: 'Florida',
    serviceRegion: 'naples',
    timeZone: 'America/New_York',
    availability: 'available',
    anchor: { name: 'Naples Regional Library', approximate: true },
  });
  expect(CITIES.some((city) => city.id === 'naples')).toBe(true);
  expect(COMING_SOON_CITIES).not.toContain('Naples');
  expect(NAPLES.timezone).toBe('America/New_York');
  expect(NAPLES.boundaryId).toBe('collier-county-2025');
  expect(regionLocalities('naples')).toEqual(
    expect.arrayContaining(['Naples', 'Marco Island', 'Immokalee', 'Everglades City']),
  );
  expect(weatherCell(anchor.lat, anchor.lng)?.key).toBe('26.1,-81.8');
});

it.each([
  ['Naples Regional Library', 26.146459, -81.798961],
  ['Marco Island, Tigertail Beach', 25.950223, -81.741857],
  ['Headquarters Library, North Naples', 26.232858, -81.769378],
  ['Corkscrew Swamp Sanctuary', 26.374541, -81.604119],
  ['Collier-Seminole State Park', 25.992861, -81.590698],
])('accepts %s inside Collier County on Eastern time', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).toBe('naples');
  expect(timeZoneForSpot({ lat, lng })).toBe('America/New_York');
});

it.each([
  ['Fort Myers', 26.640628, -81.872308],
  ['Bonita Springs', 26.339806, -81.778702],
  ['Miami', 25.761681, -80.191788],
  ['Tampa', 27.950575, -82.457176],
])('rejects %s outside Collier County', (_name, lat, lng) => {
  expect(regionForSpot({ lat, lng })).not.toBe('naples');
});
