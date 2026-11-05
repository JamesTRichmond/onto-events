import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { EventMap } from '../event-map';
import { LocationControls } from '../location-controls';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Importing react-native-maps is harmless; mounting a MapView is the crash.
jest.mock('react-native-maps', () => {
  const crash = () => {
    throw new Error('MapView mounted on an Android build with no Google Maps key');
  };
  return { __esModule: true, default: crash, Marker: crash };
});

jest.mock('@/hooks/use-selected-location', () => ({
  useSelectedLocation: () => ({
    choice: 'city',
    city: { id: 'asheville', name: 'Asheville', anchor: { lat: 35.5956, lng: -82.5486, name: 'City Hall', approximate: true } },
    loaded: true,
    findMe: jest.fn(),
    chooseCity: jest.fn(() => true),
    choosePin: jest.fn(),
  }),
}));

// An Android build without a Google Maps key: MapView would crash the app.
describe('Android build with no Google Maps key', () => {
  let platform: jest.ReplaceProperty<string>;
  const flag = process.env.EXPO_PUBLIC_ANDROID_MAPS;
  beforeEach(() => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    delete process.env.EXPO_PUBLIC_ANDROID_MAPS;
  });
  afterEach(() => {
    platform.restore();
    if (flag === undefined) delete process.env.EXPO_PUBLIC_ANDROID_MAPS;
    else process.env.EXPO_PUBLIC_ANDROID_MAPS = flag;
  });

  it('event details point to Directions instead of mounting a map', () => {
    render(<EventMap lat={35.59} lng={-82.55} title="Pack Square Park" />);
    expect(screen.getByText('Tap Directions to see Pack Square Park in your maps app.')).toBeTruthy();
  });

  it('location controls drop the map pin and keep my location and change city', async () => {
    render(<LocationControls />);
    await act(async () => {});
    expect(screen.queryByText('choose location')).toBeNull();
    expect(screen.getByText('GPS')).toBeTruthy();
    expect(screen.getByText('City')).toBeTruthy();
  });

  it('does not offer a pin map after choosing a city', async () => {
    render(<LocationControls />);
    await act(async () => {});
    fireEvent.press(screen.getByText('City'));
    fireEvent.press(screen.getByRole('button', { name: 'Asheville' }));
    expect(screen.queryByTestId('city-picker')).toBeNull();
    expect(screen.queryByTestId('narrow-on-map')).toBeNull();
  });
});
