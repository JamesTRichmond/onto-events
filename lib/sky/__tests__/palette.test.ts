import { computeSky, mixColor, SKY_RAMPS, SKY_SURFACE, usableWeather, type WeatherKind } from '../palette';
import { astronomyAt } from '../astronomy';

const now = Date.parse('2026-09-06T07:00:00Z');
const input = {
  sun: { altitude: -30, azimuth: 0, rising: false },
  moon: { illumination: 0.02, altitude: 45, azimuth: 120 },
  now, placeId: 'slc',
};

describe('living-sky palette decisions', () => {
  it.each([
    [-30, false, 'night'], [-4, true, 'dawn'], [6, true, 'morning'],
    [45, true, 'day'], [6, false, 'golden'], [-2, false, 'dusk'],
  ])('sun %s / rising %s selects %s', (altitude, rising, phase) => {
    expect(computeSky({ ...input, sun: { altitude: Number(altitude), rising: Boolean(rising), azimuth: 0 } }).phase).toBe(phase);
  });

  it('is deterministic and defaults to no motion and unavailable weather', () => {
    const a = computeSky(input);
    expect(computeSky(input)).toEqual(a);
    expect(a).toMatchObject({ animate: false, weather: 'unavailable' });
    expect(computeSky({ ...input, reduceMotion: false }).animate).toBe(true);
  });

  it('moonlight reduces star density only above the horizon', () => {
    const newMoon = computeSky(input);
    const fullMoon = computeSky({ ...input, moon: { ...input.moon, illumination: 0.98 } });
    expect(fullMoon.starDensity).toBeLessThan(newMoon.starDensity);
    expect(fullMoon.moonGlow).toBeGreaterThan(0);
    expect(fullMoon.colors).not.toEqual(newMoon.colors);
    const below = computeSky({ ...input, moon: { ...input.moon, illumination: 0.98, altitude: -10 } });
    expect(below.moonGlow).toBe(0);
    expect(below.starDensity).toBe(1);
  });

  it.each<WeatherKind>(['overcast', 'snow', 'rain', 'fog'])('%s persists at night and hides stars', (kind) => {
    const sky = computeSky({ ...input, weather: { kind, placeId: 'slc', observedAt: now } });
    expect(sky.weather).toBe(kind);
    expect(sky.starDensity).toBe(0);
    expect(sky.moonGlow).toBe(0);
    expect(sky.colors).not.toEqual(computeSky(input).colors);
  });

  it('accepts explicit smog evidence but never infers a civic event or observed clear sky', () => {
    const sky = computeSky({ ...input, sun: { ...input.sun, altitude: 35 }, weather: { kind: 'smog', placeId: 'slc', observedAt: now } });
    expect(sky.weather).toBe('smog');
    expect(sky.colors).not.toEqual(SKY_RAMPS.day);
    expect(computeSky({ ...input, now: Date.parse('2026-07-05T04:00:00Z') }).weather).toBe('unavailable');
  });

  it('accepts weather through 60 minutes, never future, stale or another place', () => {
    const sample = { kind: 'snow' as const, placeId: 'slc', observedAt: now - 3_600_000 };
    expect(usableWeather(sample, now, 'slc')).toBe('snow');
    expect(usableWeather(sample, now + 1, 'slc')).toBe('unavailable');
    expect(usableWeather(sample, now, 'elsewhere')).toBe('unavailable');
    expect(usableWeather({ ...sample, observedAt: now + 1 }, now, 'slc')).toBe('unavailable');
    expect(usableWeather({ ...sample, observedAt: NaN }, now, 'slc')).toBe('unavailable');
  });

  it.each([-12, 0, 10, 20])('has no color jump at altitude %s', (boundary) => {
    for (const rising of [true, false]) {
      const ramp = (altitude: number) => computeSky({ ...input, sun: { ...input.sun, altitude, rising } }).colors;
      expect(ramp(boundary - 0.00001)).toEqual(ramp(boundary + 0.00001));
    }
  });

  it('also transitions smoothly through low winter noon, below the common day ramp', () => {
    const place = { latitude: 51.5074, longitude: -0.1278 };
    const before = astronomyAt(Date.parse('2026-12-21T11:58:00Z'), place);
    const after = astronomyAt(Date.parse('2026-12-21T11:59:00Z'), place);
    expect(before.sun.rising).toBe(true);
    expect(after.sun.rising).toBe(false);
    const a = computeSky({ ...input, ...before }).colors;
    const b = computeSky({ ...input, ...after }).colors;
    a.forEach((color, i) => [1, 3, 5].forEach((offset) => {
      expect(Math.abs(parseInt(color.slice(offset, offset + 2), 16)
        - parseInt(b[i].slice(offset, offset + 2), 16))).toBeLessThanOrEqual(2);
    }));
  });
});

function luminance(hex: string): number {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

it('keeps every body/metadata/link token above 4.5:1 at every sky stop and white worst-case', () => {
  for (const stop of [...Object.values(SKY_RAMPS).flat(), '#FFFFFF']) {
    const card = mixColor(stop, SKY_SURFACE.background, 0.94);
    for (const surface of [card, SKY_SURFACE.chip, SKY_SURFACE.background]) {
      for (const text of [SKY_SURFACE.text, SKY_SURFACE.secondary, SKY_SURFACE.link]) {
        expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
  expect(contrast(SKY_SURFACE.onSelected, SKY_SURFACE.selected)).toBeGreaterThanOrEqual(4.5);
});
