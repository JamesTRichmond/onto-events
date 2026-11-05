import { cityClock, formatSun } from '../daypart';
import { astronomyAt } from '../sky/astronomy';

describe('cityClock and civil dayparts', () => {
  const sunriseUtc = Date.parse('2026-10-15T11:30:00Z'); // ~07:30 EDT
  const sunsetUtc = Date.parse('2026-10-15T23:00:00Z');  // ~19:00 EDT

  it('aligns Tallahassee civil dayparts with Eastern Time (America/New_York)', () => {
    // 18:00 UTC = 14:00 EDT in Tallahassee (midday)
    const middayUtc = new Date('2026-10-15T18:00:00Z');
    const tlhMidday = cityClock(middayUtc, sunriseUtc, sunsetUtc, 'America/New_York');
    expect(tlhMidday.hour).toBe(14);
    expect(tlhMidday.minute).toBe(0);
    expect(tlhMidday.parts).toContain('midday');

    // 22:30 UTC = 18:30 EDT in Tallahassee (afterWork / golden / sunset)
    const sunsetHourUtc = new Date('2026-10-15T22:30:00Z');
    const tlhSunset = cityClock(sunsetHourUtc, sunriseUtc, sunsetUtc, 'America/New_York');
    expect(tlhSunset.hour).toBe(18);
    expect(tlhSunset.minute).toBe(30);
    expect(tlhSunset.parts).toContain('sunset');
    expect(tlhSunset.parts).toContain('golden');
    expect(tlhSunset.parts).toContain('afterWork');

    // 23:30 UTC = 19:30 EDT in Tallahassee (evening)
    const eveningUtc = new Date('2026-10-15T23:30:00Z');
    const tlhEvening = cityClock(eveningUtc, sunriseUtc, sunsetUtc, 'America/New_York');
    expect(tlhEvening.hour).toBe(19);
    expect(tlhEvening.minute).toBe(30);
    expect(tlhEvening.parts).toContain('evening');

    // In Denver at 22:30 UTC, it is only 16:30 MDT (afterSchool)
    const denverAfternoon = cityClock(sunsetHourUtc, sunriseUtc, sunsetUtc, 'America/Denver');
    expect(denverAfternoon.hour).toBe(16);
    expect(denverAfternoon.minute).toBe(30);
    expect(denverAfternoon.parts).toContain('afterSchool');
  });

  it('formats sun times in the specified city timezone', () => {
    // 11:30 UTC = 07:30 EDT / 05:30 MDT
    expect(formatSun(sunriseUtc, 'America/New_York')).toMatch(/7:30\s*AM/i);
    expect(formatSun(sunriseUtc, 'America/Denver')).toMatch(/5:30\s*AM/i);
  });

  it('computes pure on-device astronomy for Tallahassee coordinates', () => {
    const tlh = { latitude: 30.4383, longitude: -84.2807 };
    // Solar noon in Tallahassee (~17:35 UTC on Oct 15)
    const solarNoonUtc = Date.parse('2026-10-15T17:35:00Z');
    const noonSky = astronomyAt(solarNoonUtc, tlh);
    expect(noonSky.sun.altitude).toBeGreaterThan(45); // High in southern sky
    expect(noonSky.sun.azimuth).toBeGreaterThan(160);
    expect(noonSky.sun.azimuth).toBeLessThan(200);

    // After sunset (~00:00 UTC next day)
    const nightUtc = Date.parse('2026-10-16T00:30:00Z');
    const nightSky = astronomyAt(nightUtc, tlh);
    expect(nightSky.sun.altitude).toBeLessThan(0);
    expect(nightSky.sun.rising).toBe(false);
  });
});
