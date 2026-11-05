import { skyKind, WEATHER_WORDS, weatherWord } from '../condition';

describe('one weather word', () => {
  it.each([
    ['Clear', 'Clear'],
    ['Sunny', 'Clear'],
    ['Mostly Cloudy', 'Clouds'],
    ['Overcast', 'Clouds'],
    ['Light Rain', 'Rain'],
    ['Showers And Thunderstorms Likely', 'Thunderstorm'],
    ['Thunderstorms and Rain', 'Thunderstorm'],
    ['Light Rain and Fog/Mist', 'Rain'],
    ['Freezing Rain', 'Rain'],
    ['Freezing Fog', 'Fog'],
    ['Light Drizzle', 'Drizzle'],
    ['Heavy Snow', 'Snow'],
    ['Chance Rain And Snow', 'Snow'],
    ['Fog/Mist', 'Fog'],
    ['Mist', 'Mist'],
    ['Haze', 'Haze'],
    ['Areas Of Smoke', 'Smoke'],
    ['Blowing Dust', 'Haze'],
  ])('%s → %s', (text, word) => {
    expect(weatherWord(text)).toBe(word);
  });

  it('anything unrecognised, or nothing at all, is Unknown — never a guess', () => {
    expect(weatherWord('Funnel Cloud Nearby'.replace('Cloud', 'Clod'))).toBe('Unknown');
    expect(weatherWord('')).toBe('Unknown');
    expect(weatherWord(null)).toBe('Unknown');
    expect(WEATHER_WORDS).toHaveLength(11);
  });

  it('the sky tells a few clouds from a lid of them, and paints nothing for Unknown', () => {
    expect(skyKind('Clouds', 'Partly Cloudy')).toBe('cloud');
    expect(skyKind('Clouds', 'Cloudy')).toBe('overcast');
    expect(skyKind('Clouds', 'Overcast')).toBe('overcast');
    expect(skyKind('Thunderstorm', 'x')).toBe('rain');
    expect(skyKind('Smoke', 'x')).toBe('smog');
    expect(skyKind('Mist', 'x')).toBe('fog');
    expect(skyKind('Unknown', 'x')).toBeNull();
  });
});
