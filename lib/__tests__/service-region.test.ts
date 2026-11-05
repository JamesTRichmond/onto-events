import { regionForSpot, regionLocalities, vermontLocalities } from '../service-region';
test.each([
  [44.4759, -73.2121],
  [44.0153, -73.1673],
  [44.1209, -73.079],
  [44.1672, -73.254],
  [43.6106, -72.9726],
  [44.2601, -72.5754],
  [43.6489, -72.3193],
])('routes Vermont hub %s %s to corridor discovery', (lat, lng) =>
  expect(regionForSpot({ lat, lng })).toBe('vermont-corridor'),
);
test.each([
  [35.5951, -82.5515],
  [35.6179, -82.3212],
  [35.697, -82.5607],
])('routes Asheville hub %s %s to the asheville region', (lat, lng) =>
  expect(regionForSpot({ lat, lng })).toBe('asheville'),
);
test.each([
  [30.4383, -84.2807],
  [30.4414, -84.2839],
  [30.3956, -84.3414],
])('routes Tallahassee hub %s %s to the tallahassee region', (lat, lng) =>
  expect(regionForSpot({ lat, lng })).toBe('tallahassee'),
);
test('keeps Tallahassee apart from places just outside its envelope', () => {
  expect(regionForSpot({ lat: 30.8365, lng: -83.9787 })).toBeNull(); // Thomasville, GA
  expect(regionForSpot({ lat: 30.1174, lng: -83.5824 })).toBeNull(); // Perry, FL
});
test('keeps Asheville apart from places just outside its envelope', () => {
  expect(regionForSpot({ lat: 35.3187, lng: -82.461 })).toBeNull();
  expect(regionForSpot({ lat: 34.8526, lng: -82.394 })).toBeNull();
});
test('retains Utah and rejects distant or invalid points', () => {
  expect(regionForSpot({ lat: 40.76, lng: -111.89 })).toBe('utah');
  expect(regionForSpot({ lat: 42.36, lng: -71.06 })).toBe('boston');
  expect(regionForSpot({ lat: 32.7767, lng: -96.7970 })).toBeNull();
  expect(regionForSpot({ lat: NaN, lng: -73 })).toBeNull();
  expect(vermontLocalities()).toContain('White River Junction');
  expect(vermontLocalities()).not.toContain('Hanover');
  expect(regionLocalities('tallahassee')).toContain('Tallahassee');
  expect(regionLocalities('tallahassee')).toContain('Woodville');
  expect(regionLocalities('tallahassee')).not.toContain('Thomasville');
});
test.each([
  [40.745, -73.845],
  [40.75, -73.98],
  [40.68, -73.95],
])('routes launched NYC locations %s %s to the nyc region', (lat, lng) =>
  expect(regionForSpot({ lat, lng })).toBe('nyc'),
);
test('routes Hoboken City Hall to hoboken and leaves Jersey City and Manhattan in nyc', () => {
  expect(regionForSpot({ lat: 40.73729239, lng: -74.03139353 })).toBe('hoboken');
  expect(regionForSpot({ lat: 40.69028, lng: -74.06461 })).toBe('nyc');
  expect(regionForSpot({ lat: 40.7531, lng: -73.9819 })).toBe('nyc');
});
test('routes Montreal anchor and Laval to montreal service region', () => {
  expect(regionForSpot({ lat: 45.5154, lng: -73.5623 })).toBe('montreal');
  expect(regionForSpot({ lat: 45.5604, lng: -73.7225 })).toBe('montreal');
  expect(regionLocalities('montreal')).toContain('Montreal');
  expect(regionLocalities('montreal')).toContain('Laval');
  expect(regionLocalities('montreal')).toContain('Longueuil');
  expect(regionLocalities('montreal')).not.toContain('Quebec City');
});

