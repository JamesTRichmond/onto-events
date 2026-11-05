import { astronomyAt } from '../astronomy';

const SLC = { latitude: 40.76, longitude: -111.89 };
const at = (iso: string) => astronomyAt(Date.parse(iso), SLC);

describe('astronomyAt', () => {
  it('matches SunCalc v1.9 published position fixtures after north/degree conversion', () => {
    // https://github.com/mourner/suncalc/blob/v1.9.0/test.js (regression, not measured accuracy).
    const sky = astronomyAt(Date.parse('2013-03-05T00:00:00Z'), { latitude: 50.5, longitude: 30.5 });
    const degrees = 180 / Math.PI;
    expect(sky.sun.altitude).toBeCloseTo(-0.7000406838781611 * degrees, 6);
    expect(sky.sun.azimuth).toBeCloseTo(-2.5003175907168385 * degrees + 180, 6);
    expect(sky.moon.altitude).toBeCloseTo(0.014551482243892251 * degrees, 6);
    expect(sky.moon.azimuth).toBeCloseTo(-0.9783999522438226 * degrees + 180, 6);
    expect(sky.moon.illumination).toBeCloseTo(0.4848068202456373, 6);
  });

  it.each([
    ['2026-09-06T13:00:00Z', true], // 07:00 MDT sunrise.
    ['2026-09-07T01:51:00Z', false], // 19:51 MDT sunset.
  ])('is near the standard solar horizon at USNO SLC fixture %s', (iso, rising) => {
    // USNO API v4.0.1, queried 2026-09-06; geometric center at standard rise/set ~= -0.833°.
    // https://aa.usno.navy.mil/api/rstt/oneday?date=2026-09-06&coords=40.76,-111.89&tz=-6
    // 0.6° fixture tolerance, not a global accuracy promise or mountain-horizon prediction.
    expect(Math.abs(at(iso as string).sun.altitude + 0.833)).toBeLessThan(0.6);
    expect(at(iso as string).sun.rising).toBe(rising);
  });

  it('tracks independent NASA new/full phase fixtures', () => {
    // Fred Espenak, NASA/GSFC: https://eclipse.gsfc.nasa.gov/phase/phase2001gmt.html
    expect(at('2024-04-08T18:21:00Z').moon.illumination).toBeLessThan(0.01);
    expect(at('2024-03-25T07:00:00Z').moon.illumination).toBeGreaterThan(0.99);
  });

  it('stays within decorative angular tolerances of independent USNO positions', () => {
    // USNO v4.0.1 geocentric positions; UTC vs UT1 difference is immaterial here.
    // https://aa.usno.navy.mil/api/celnav?date=2026-09-06&time=15:31&coords=40.76,-111.89
    const sky = at('2026-09-06T15:31:00Z');
    expect(Math.abs(sky.sun.altitude - 27.533228)).toBeLessThan(0.5);
    expect(Math.abs(sky.sun.azimuth - 106.662568)).toBeLessThan(0.5);
    // Moon near zenith: compare great-circle direction, not unstable azimuth alone.
    const rad = Math.PI / 180;
    const actualAltitude = sky.moon.altitude * rad;
    const expectedAltitude = 75.543434 * rad;
    const dot = Math.sin(actualAltitude) * Math.sin(expectedAltitude)
      + Math.cos(actualAltitude) * Math.cos(expectedAltitude)
      * Math.cos((sky.moon.azimuth - 179.845266) * rad);
    expect(Math.acos(Math.min(1, dot)) / rad).toBeLessThan(2);
    expect(Math.abs(sky.moon.illumination - 0.25)).toBeLessThan(0.03);
  });

  it('depends on explicit place and instant, never the device clock', () => {
    const instant = Date.parse('2026-09-06T18:00:00Z');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      expect(astronomyAt(instant, SLC)).toEqual(astronomyAt(instant, { ...SLC }));
      expect(astronomyAt(instant, SLC).sun.altitude).not.toEqual(
        astronomyAt(instant, { latitude: 35.68, longitude: 139.65 }).sun.altitude);
      expect(clock).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });

  it.each([-90, 0, 90])('remains finite at latitude %s, including polar day/night', (latitude) => {
    for (const iso of ['2026-06-21T12:00:00Z', '2026-12-21T00:00:00Z']) {
      const sky = astronomyAt(Date.parse(iso), { latitude, longitude: 180 });
      for (const position of [sky.sun, sky.moon]) {
        expect(Number.isFinite(position.altitude)).toBe(true);
        expect(position.azimuth).toBeGreaterThanOrEqual(0);
        expect(position.azimuth).toBeLessThan(360);
      }
      expect(sky.moon.illumination).toBeGreaterThanOrEqual(0);
      expect(sky.moon.illumination).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    [NaN, SLC], [Infinity, SLC], [1e20, SLC],
    [0, { latitude: 91, longitude: 0 }], [0, { latitude: 0, longitude: -181 }],
    [0, { latitude: NaN, longitude: 0 }],
  ])('rejects invalid input %#', (instant, place) => {
    expect(() => astronomyAt(instant, place)).toThrow(RangeError);
  });
});
