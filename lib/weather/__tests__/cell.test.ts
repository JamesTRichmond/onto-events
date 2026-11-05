import { mapSpanDeg, weatherCell } from '../cell';

describe('weather cell', () => {
  it('rounds a position to the public 0.1° grid point, so no request carries it', () => {
    expect(weatherCell(40.7608, -111.891)).toEqual({ lat: 40.8, lng: -111.9, key: '40.8,-111.9' });
    expect(weatherCell(40.7412, -111.8467)?.key).toBe('40.7,-111.8');
    expect(weatherCell(35.6528, 139.7289)).toEqual({ lat: 35.7, lng: 139.7, key: '35.7,139.7' });
    expect(weatherCell(37.7793, -122.4161)).toEqual({ lat: 37.8, lng: -122.4, key: '37.8,-122.4' });
    expect(weatherCell(40.6558, -111.5036)).toEqual({ lat: 40.7, lng: -111.5, key: '40.7,-111.5' });
    expect(weatherCell(30.4383, -84.2807)).toEqual({ lat: 30.4, lng: -84.3, key: '30.4,-84.3' });
    expect(weatherCell(44.0053, -73.1737)).toEqual({ lat: 44.0, lng: -73.2, key: '44.0,-73.2' });
    expect(weatherCell(45.5154, -73.5623)).toEqual({ lat: 45.5, lng: -73.6, key: '45.5,-73.6' });
    expect(weatherCell(43.0825, -73.7844)).toEqual({ lat: 43.1, lng: -73.8, key: '43.1,-73.8' });
    expect(weatherCell(42.3493, -71.0784)).toEqual({ lat: 42.3, lng: -71.1, key: '42.3,-71.1' });
  });

  it('everyone near one grid point asks with the same key', () => {
    const keys = new Set([
      weatherCell(40.76, -111.86)?.key,
      weatherCell(40.79, -111.93)?.key,
      weatherCell(40.8449, -111.8501)?.key,
    ]);
    expect([...keys]).toEqual(['40.8,-111.9']);
  });

  it('never keys "-0.0", and refuses points that are not on Earth', () => {
    expect(weatherCell(-0.04, -0.04)?.key).toBe('0.0,0.0');
    expect(weatherCell(Number.NaN, 0)).toBeNull();
    expect(weatherCell(91, 0)).toBeNull();
    expect(weatherCell(0, 181)).toBeNull();
  });

  it('the map spans the feed radius with room around it, within sane bounds', () => {
    expect(mapSpanDeg(1)).toBe(0.15);
    expect(mapSpanDeg(10)).toBeCloseTo(0.5217, 3);
    expect(mapSpanDeg(100)).toBe(3);
    expect(mapSpanDeg(Number.NaN)).toBe(0.15);
  });
});
