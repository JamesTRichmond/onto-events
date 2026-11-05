import type { WeatherKind } from '@/lib/sky/palette';

/**
 * One weather word (DECISIONS 2026-09-14): the National Weather Service's
 * free-text description is classified once into a fixed vocabulary, so the
 * strip, the sky and (later) Places all read the same word. Anything the
 * classifier does not recognise is Unknown — never a guess.
 */
export const WEATHER_WORDS = [
  'Clear',
  'Clouds',
  'Rain',
  'Drizzle',
  'Snow',
  'Thunderstorm',
  'Mist',
  'Fog',
  'Haze',
  'Smoke',
  'Unknown',
] as const;
export type WeatherWord = (typeof WEATHER_WORDS)[number];

// Order matters: the most severe or most specific phrase wins, so "Light
// Rain and Fog" is Rain and "Thunderstorms and Rain" is Thunderstorm.
const RULES: readonly [RegExp, WeatherWord][] = [
  [/thunder|t-storm|tstorm/i, 'Thunderstorm'],
  [/snow|sleet|ice pellets|flurr|blizzard|wintry/i, 'Snow'],
  [/drizzle/i, 'Drizzle'],
  [/rain|shower/i, 'Rain'],
  [/smoke/i, 'Smoke'],
  [/haze|dust|sand/i, 'Haze'],
  [/fog/i, 'Fog'],
  [/mist/i, 'Mist'],
  [/cloud|overcast/i, 'Clouds'],
  [/clear|sunny|fair/i, 'Clear'],
];

export function weatherWord(description: string | null | undefined): WeatherWord {
  const text = (description ?? '').trim();
  if (!text) return 'Unknown';
  for (const [pattern, word] of RULES) if (pattern.test(text)) return word;
  return 'Unknown';
}

/**
 * The sky's own seven looks, from the word plus the raw text (the sky tells
 * a few clouds from a lid of them). Unknown gives null: the sky keeps
 * clock-and-sun rather than painting weather it was not told about.
 */
export function skyKind(word: WeatherWord, description: string | null | undefined): WeatherKind | null {
  switch (word) {
    case 'Clear':
      return 'clear';
    case 'Clouds':
      return /overcast|^\s*cloudy\s*$|mostly cloudy/i.test(description ?? '') ? 'overcast' : 'cloud';
    case 'Rain':
    case 'Drizzle':
    case 'Thunderstorm':
      return 'rain';
    case 'Snow':
      return 'snow';
    case 'Mist':
    case 'Fog':
      return 'fog';
    case 'Haze':
    case 'Smoke':
      return 'smog';
    default:
      return null;
  }
}
