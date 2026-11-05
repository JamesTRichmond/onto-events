import { cityById } from '@/data/cities';
import { parseLocationPreference, resolveLocationOrigin } from '../location-choice';

const gps = { lat: 35.5956, lng: -82.5486, source: 'gps' as const, loading: false, fallbackReason: null };
const preference = { mode: 'device' as const, cityId: 'salt-lake-city' as const };

it.each([
  ['salt-lake-city', 'utah', 'America/Denver'],
  ['asheville', 'asheville', 'America/New_York'],
  ['black-mountain', 'asheville', 'America/New_York'],
  ['weaverville', 'asheville', 'America/New_York'],
  ['tallahassee', 'tallahassee', 'America/New_York'],
  ['burlington', 'vermont-corridor', 'America/New_York'],
  ['south-burlington', 'vermont-corridor', 'America/New_York'],
  ['williston', 'vermont-corridor', 'America/New_York'],
  ['bristol', 'vermont-corridor', 'America/New_York'],
  ['middlebury', 'vermont-corridor', 'America/New_York'],
  ['vergennes', 'vermont-corridor', 'America/New_York'],
  ['rutland', 'vermont-corridor', 'America/New_York'],
  ['montpelier', 'vermont-corridor', 'America/New_York'],
  ['white-river-junction', 'vermont-corridor', 'America/New_York'],
])('resolves %s without needing device permission', (cityId, region, timeZone) => {
  const city = cityById(cityId)!;
  const result = resolveLocationOrigin({ mode: 'city', cityId: city.id }, null, { ...gps, source: 'fallback', fallbackReason: 'permission-denied' }, true);
  expect(result).toMatchObject({ status: 'ready', origin: { serviceRegion: region, timeZone, source: 'city', label: city.name } });
});

it('uses Asheville, Tallahassee, Vermont and Boston fixes immediately and rejects an unsupported fix', () => {
  expect(resolveLocationOrigin(preference, null, gps, true)).toMatchObject({ status: 'ready', origin: { serviceRegion: 'asheville', lat: 35.5956, timeZone: 'America/New_York' } });
  expect(resolveLocationOrigin(preference, null, { ...gps, lat: 30.4383, lng: -84.2807 }, true)).toMatchObject({ status: 'ready', origin: { serviceRegion: 'tallahassee', lat: 30.4383, timeZone: 'America/New_York' } });
  expect(resolveLocationOrigin(preference, null, { ...gps, lat: 44.48, lng: -73.21 }, true)).toMatchObject({ status: 'ready', origin: { serviceRegion: 'vermont-corridor' } });
  expect(resolveLocationOrigin(preference, null, { ...gps, lat: 42.36, lng: -71.06 }, true)).toMatchObject({ status: 'ready', origin: { serviceRegion: 'boston' } });
  expect(resolveLocationOrigin(preference, null, { ...gps, lat: 32.7767, lng: -96.7970 }, true)).toEqual({ status: 'unsupported', origin: null });
});

it('never turns denied, pending or unavailable GPS into an SLC origin', () => {
  expect(resolveLocationOrigin(preference, null, gps, false)).toEqual({ status: 'loading', origin: null });
  expect(resolveLocationOrigin(preference, null, { ...gps, loading: true }, true)).toEqual({ status: 'loading', origin: null });
  expect(resolveLocationOrigin(preference, null, { ...gps, source: 'fallback', fallbackReason: 'timeout' }, true)).toEqual({ status: 'unavailable', origin: null });
});

it('gives a supported temporary pin priority without changing the stored city', () => {
  expect(resolveLocationOrigin({ mode: 'city', cityId: 'asheville' }, { lat: 44.48, lng: -73.21 }, gps, true)).toMatchObject({ status: 'ready', origin: { source: 'pin', serviceRegion: 'vermont-corridor', lat: 44.48 } });
  expect(resolveLocationOrigin(preference, { lat: 0, lng: 0 }, gps, true)).toEqual({ status: 'unsupported', origin: null });
});

it('resolves Queens locations now that NYC is launched', () => {
  const queens = { lat: 40.745, lng: -73.845 };
  expect(resolveLocationOrigin(preference, null, { ...gps, ...queens }, true))
    .toMatchObject({ status: 'ready', origin: { serviceRegion: 'nyc', lat: 40.745, lng: -73.845, source: 'device', timeZone: 'America/New_York' } });
  expect(resolveLocationOrigin({ mode: 'city', cityId: 'asheville' }, queens, gps, true))
    .toMatchObject({ status: 'ready', origin: { source: 'pin', serviceRegion: 'nyc', lat: 40.745 } });
});

it('rejects upcoming, unknown and coordinate-shaped preferences', () => {
  for (const cityId of ['unlaunched-city', 'unknown', '__proto__']) {
    expect(parseLocationPreference(JSON.stringify({ mode: 'city', cityId }))).toEqual(preference);
  }
  expect(parseLocationPreference('{"lat":44.48,"lng":-73.21}')).toEqual(preference);
  expect(parseLocationPreference('{')).toEqual(preference);
});


it('accepts the newly registered Atlanta city preference', () => {
  expect(parseLocationPreference(JSON.stringify({ mode: 'city', cityId: 'atlanta' })))
    .toEqual({ mode: 'city', cityId: 'atlanta' });
});
