import type { Astronomy } from './astronomy';

export type SkyPhase = 'night' | 'dawn' | 'morning' | 'day' | 'golden' | 'dusk';
export type SkyRamp = readonly [string, string, string, string, string];
// Reversible palette starting points from Fable's Sept 6 handoff, not weather data.
export const SKY_RAMPS: Record<SkyPhase, SkyRamp> = {
  night: ['#0B0D1E', '#171A34', '#1C2044', '#23274F', '#2A2E58'],
  dawn: ['#171A34', '#3A2E5C', '#8A4B6C', '#E07A5F', '#F2B880'],
  morning: ['#5B7DB8', '#8FB3E0', '#C6DBF2', '#E8EFF7', '#F7F5F0'],
  day: ['#3D6BB3', '#6E9AD6', '#A9C7EA', '#D6E4F3', '#EEF3F8'],
  golden: ['#4A5FA8', '#9A6C8C', '#E0895E', '#F2B36A', '#F7D9A0'],
  dusk: ['#1C2044', '#3F2F63', '#7A3E5E', '#B85A4C', '#2A2E58'],
};

// Fixed contrast floor, including when the sky underneath is almost white.
// The handoff's 45%-opacity metadata fails contrast; these tokens do not.
export const SKY_SURFACE = {
  background: '#171A34',
  card: 'rgba(23, 26, 52, 0.94)',
  chip: '#343752',
  selected: '#FF8A6B',
  text: '#F7F5F0',
  secondary: '#C3C5D0',
  link: '#FFAB94',
  onSelected: '#171A34',
  border: '#505470',
} as const;

export type WeatherKind = 'clear' | 'cloud' | 'overcast' | 'rain' | 'snow' | 'fog' | 'smog';
export type SkyWeather = { placeId: string; observedAt: number; kind: WeatherKind };
export type SkyState = {
  phase: SkyPhase;
  colors: SkyRamp;
  starDensity: number;
  moonGlow: number;
  weather: WeatherKind | 'unavailable';
  animate: boolean;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function mixColor(from: string, to: string, fraction: number): string {
  const rgb = [1, 3, 5].map((offset) => {
    const a = parseInt(from.slice(offset, offset + 2), 16);
    const b = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * clamp(fraction)).toString(16).padStart(2, '0');
  });
  return `#${rgb.join('')}`.toUpperCase();
}

function blend(from: SkyRamp, to: SkyRamp, fraction: number): SkyRamp {
  return from.map((color, index) => mixColor(color, to[index], fraction)) as unknown as SkyRamp;
}

/** Continuous at each phase boundary; the clock/position calculations are separate. */
function solarRamp(altitude: number, rising: boolean): { phase: SkyPhase; colors: SkyRamp } {
  if (altitude <= -12) return { phase: 'night', colors: SKY_RAMPS.night };
  if (altitude >= 20) return { phase: 'day', colors: SKY_RAMPS.day };
  if (altitude < 0) {
    const phase = rising ? 'dawn' : 'dusk';
    return { phase, colors: blend(SKY_RAMPS.night, SKY_RAMPS[phase], (altitude + 12) / 12) };
  }
  const phase = rising ? 'morning' : 'golden';
  const horizon = SKY_RAMPS[rising ? 'dawn' : 'dusk'];
  const middle = SKY_RAMPS[phase];
  return {
    phase,
    colors: altitude <= 10
      ? blend(horizon, middle, altitude / 10)
      : blend(middle, SKY_RAMPS.day, (altitude - 10) / 10),
  };
}

/** Stale, future or differently located samples are not current weather. */
export function usableWeather(sample: SkyWeather | null | undefined, now: number, placeId: string) {
  return sample && sample.placeId === placeId && Number.isFinite(sample.observedAt)
    && sample.observedAt <= now && now - sample.observedAt <= 60 * 60_000
    ? sample.kind : 'unavailable';
}

/** Pure visual decision. No fetch, timer, persistence, civic inference or GPS side effect. */
export function computeSky({ sun, moon, now, placeId, weather, reduceMotion = true }: Astronomy & {
  now: number;
  placeId: string;
  weather?: SkyWeather | null;
  reduceMotion?: boolean;
}): SkyState {
  const solar = solarRamp(sun.altitude, sun.rising);
  if (sun.riseWeight !== undefined) {
    solar.colors = blend(solarRamp(sun.altitude, false).colors,
      solarRamp(sun.altitude, true).colors, sun.riseWeight);
  }
  const night = clamp(-sun.altitude / 12);
  const illumination = clamp(moon.illumination) * clamp(moon.altitude / 10);
  let colors = solar.colors.map((color) => mixColor(color, '#2E3466', illumination * night * 0.12)) as unknown as SkyRamp;
  const kind = usableWeather(weather, now, placeId);
  const covered = kind === 'overcast' || kind === 'fog' || kind === 'snow' || kind === 'rain';
  const veil = kind === 'fog' ? ['#C3C5D0', 0.3] as const
    : kind === 'smog' ? ['#8A7A66', 0.35] as const
    : kind === 'overcast' ? ['#57596F', 0.65] as const
    : kind === 'snow' ? ['#F7F5F0', 0.06] as const
    : kind === 'rain' ? ['#171A34', 0.18] as const
    : kind === 'cloud' ? ['#77798A', 0.1] as const : null;
  if (veil) colors = colors.map((color) => mixColor(color, veil[0], veil[1])) as unknown as SkyRamp;
  return {
    ...solar,
    colors,
    starDensity: covered ? 0 : night * (1 - illumination * 0.65) * (kind === 'cloud' ? 0.5 : 1),
    moonGlow: covered ? 0 : night * illumination * (moon.illumination >= 0.6 ? 1 : 0),
    weather: kind,
    animate: !reduceMotion,
  };
}
