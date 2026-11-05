import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { weatherCell } from '@/lib/weather/cell';
import { fetchWeather, type WeatherReport } from '@/lib/weather/nws';
import { fakeNwsFetch } from '@/lib/weather/__tests__/fake-nws';
import { WeatherStrip } from '../weather-strip';

jest.mock('@/components/weather/weather-map', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    WeatherMap: (props: { cell: { key: string }; radiusMi: number }) => (
      <Text testID="weather-map">{`map ${props.cell.key} r${props.radiusMi}`}</Text>
    ),
  };
});

const AT = Date.parse('2026-09-28T20:30:00Z');
const cell = weatherCell(40.7608, -111.891)!;
let report: WeatherReport;

beforeAll(async () => {
  report = await fetchWeather(cell, fakeNwsFetch().fetchImpl, AT);
});

const strip = (overrides: Partial<Parameters<typeof WeatherStrip>[0]> = {}) => (
  <WeatherStrip
    weather={{ cell, report, loading: false, unavailable: false }}
    now={AT}
    timeZone="America/Denver"
    lat={40.7608}
    lng={-111.891}
    radiusMi={5}
    {...overrides}
  />
);
const pull = (dy: number) =>
  act(() => {
    fireGestureHandler(getByGestureTestId('weather-pull'), [
      { state: State.BEGAN, translationY: 0 },
      { state: State.ACTIVE, translationY: dy / 2 },
      { state: State.END, translationY: dy },
    ]);
  });

describe('WeatherStrip', () => {
  it('folded: one line of weather for where the feed looks', () => {
    render(strip());
    expect(screen.getByText('61°')).toBeTruthy();
    expect(screen.getByText('Cloudy')).toBeTruthy();
    expect(screen.getByText('Wind 11 mph S · near Salt Lake City, UT')).toBeTruthy();
    expect(screen.queryByTestId('weather-panel')).toBeNull();
    expect(screen.getByRole('button', { name: /^Weather: 61°, Cloudy/ }).props.accessibilityState).toEqual({ expanded: false });
  });

  it('pulling it down reveals the hours and the aerial radar map; pulling up folds it', () => {
    render(strip());
    pull(60);

    expect(screen.getByTestId('weather-panel')).toBeTruthy();
    expect(screen.getByTestId('weather-map').props.children).toBe('map 40.8,-111.9 r5');
    expect(screen.getByText('2 PM')).toBeTruthy();
    expect(screen.getByText('78%')).toBeTruthy();
    expect(screen.getByText(/observed 2:15 PM at KSLC/)).toBeTruthy();
    expect(screen.getByText(/NOAA NEXRAD via Iowa Environmental Mesonet/)).toBeTruthy();

    pull(-60);
    expect(screen.queryByTestId('weather-panel')).toBeNull();
  });

  it('a small drag does nothing; a tap toggles', () => {
    render(strip());
    pull(10);
    expect(screen.queryByTestId('weather-panel')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^Weather:/ }));
    expect(screen.getByTestId('weather-panel')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Weather:/ }));
    expect(screen.queryByTestId('weather-panel')).toBeNull();
  });

  it('a stale observation gives way to the forecast, labelled as one', () => {
    render(strip({ now: Date.parse('2026-09-28T22:30:00Z') }));
    expect(screen.getByText('Forecast · near Salt Lake City, UT')).toBeTruthy();
  });

  it('loading is one quiet line; unavailable is silence, never a wrong number', () => {
    const { rerender } = render(strip({ weather: { cell, report: null, loading: true, unavailable: false } }));
    expect(screen.getByText('Checking the sky…')).toBeTruthy();
    rerender(strip({ weather: { cell, report: null, loading: false, unavailable: true } }));
    expect(screen.queryByText('Checking the sky…')).toBeNull();
    expect(screen.queryByTestId('weather-strip')).toBeNull();
  });
});
