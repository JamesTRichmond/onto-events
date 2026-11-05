import { weatherCell } from '../cell';
import { detailsLine, degrees, hourLabel, weatherSummary, windLabel } from '../format';
import { fetchWeather, type WeatherNow } from '../nws';
import { fakeNwsFetch } from './fake-nws';

const AT = Date.parse('2026-09-28T20:30:00Z');
const base: WeatherNow = {
  observedAt: AT, description: 'Clear', word: 'Clear', tempF: 72, feelsF: 72,
  windMph: 6, gustMph: null, windFrom: 'NW', humidityPct: 30, station: 'KSLC',
};

describe('weather words on screen', () => {
  it('degrees and wind say only what was reported', () => {
    expect(degrees(61)).toBe('61°');
    expect(degrees(null)).toBe('—');
    expect(windLabel(base)).toBe('Wind 6 mph NW');
    expect(windLabel({ windMph: 0, windFrom: 'N' })).toBe('Calm');
    expect(windLabel({ windMph: null, windFrom: null })).toBeNull();
  });

  it('feels-like appears only when it differs; gusts only above the wind', () => {
    expect(detailsLine(base)).toBe('Humidity 30%');
    expect(detailsLine({ ...base, feelsF: 64, tempF: 72, gustMph: 20 })).toBe('Feels like 64° · Humidity 30% · Gusts 20 mph');
  });

  it('hour labels read in the feed’s own time zone', () => {
    expect(hourLabel(Date.parse('2026-09-28T21:00:00Z'), 'America/Denver')).toBe('3 PM');
    expect(hourLabel(Date.parse('2026-09-28T20:00:00Z'), 'America/Denver')).toBe('2 PM');
    expect(hourLabel(Date.parse('2026-09-28T20:00:00Z'), 'Not/AZone')).toMatch(/PM|AM/);
  });

  it('summary: the fresh observation, else the forecast labelled as one, else nothing', async () => {
    const { fetchImpl } = fakeNwsFetch();
    const report = await fetchWeather(weatherCell(40.76, -111.89)!, fetchImpl, AT);

    expect(weatherSummary(report, AT)).toMatchObject({
      temp: '61°', text: 'Cloudy', sub: 'Wind 11 mph S · near Salt Lake City, UT', source: 'observed',
    });
    const later = weatherSummary(report, Date.parse('2026-09-28T22:30:00Z'));
    expect(later).toMatchObject({ source: 'forecast', sub: 'Forecast · near Salt Lake City, UT' });
    expect(later?.now).toBeNull();
    expect(weatherSummary(report, Date.parse('2026-10-05T00:00:00Z'))).toBeNull();
    expect(weatherSummary(null, AT)).toBeNull();
  });
});
