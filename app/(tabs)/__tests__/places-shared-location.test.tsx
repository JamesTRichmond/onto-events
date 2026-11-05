import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';
import { SelectedLocationProvider } from '@/hooks/use-selected-location';

import FeedScreen from '../index';
import PlacesScreen from '../places';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/backend/context', () => ({ useOntoBackend: () => ({ catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null }) }));
jest.mock('@/hooks/use-user-location', () => ({ useUserLocation: () => ({
  lat: 40.7608, lng: -111.891, source: 'fallback', loading: false,
  fallbackReason: 'permission-denied', refresh: jest.fn(),
}) }));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-12T18:00:00Z') }));

beforeEach(async () => { await AsyncStorage.clear(); });

it('opens Places directly using a remembered Burlington city rather than the denied SLC fallback', async () => {
  await AsyncStorage.setItem('onto.locationChoice.v2', JSON.stringify({ mode: 'city', cityId: 'burlington' }));
  render(<SelectedLocationProvider><PlacesScreen /></SelectedLocationProvider>);
  expect(await screen.findByText('Places around Burlington')).toBeTruthy();
  expect(screen.queryByText('Gallivan plaza')).toBeNull();
});

it('changes Places when the already-mounted Things To Do tab chooses another city', async () => {
  await AsyncStorage.setItem('onto.locationChoice.v2', JSON.stringify({ mode: 'city', cityId: 'salt-lake-city' }));
  render(<SelectedLocationProvider><View><FeedScreen /><PlacesScreen /></View></SelectedLocationProvider>);
  await screen.findByText('Places around Salt Lake City');
  fireEvent.press(screen.getByTestId('dash-toggle'));
  fireEvent.press(screen.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Asheville'));
  await waitFor(() => expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching Asheville/));
  expect(await screen.findByText('Places around Asheville')).toBeTruthy();
  expect(screen.queryByText('Gallivan plaza')).toBeNull();
});

it('opens Places directly using a remembered Tallahassee city without falling back to SLC', async () => {
  await AsyncStorage.setItem('onto.locationChoice.v2', JSON.stringify({ mode: 'city', cityId: 'tallahassee' }));
  render(<SelectedLocationProvider><PlacesScreen /></SelectedLocationProvider>);
  expect(await screen.findByText('Places around Tallahassee')).toBeTruthy();
  expect(screen.queryByText('Gallivan plaza')).toBeNull();
  expect(await screen.findByText('Cascades Park & Capital City Amphitheater')).toBeTruthy();
});

it('switches to Tallahassee in FeedScreen and immediately reflects Tallahassee places in PlacesScreen', async () => {
  await AsyncStorage.setItem('onto.locationChoice.v2', JSON.stringify({ mode: 'city', cityId: 'salt-lake-city' }));
  render(<SelectedLocationProvider><View><FeedScreen /><PlacesScreen /></View></SelectedLocationProvider>);
  await screen.findByText('Places around Salt Lake City');
  fireEvent.press(screen.getByTestId('dash-toggle'));
  fireEvent.press(screen.getByLabelText('change city'));
  fireEvent.press(screen.getByLabelText('Tallahassee'));
  await waitFor(() => expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching Tallahassee/));
  expect(await screen.findByText('Places around Tallahassee')).toBeTruthy();
  expect(screen.queryByText('Gallivan plaza')).toBeNull();
  expect(await screen.findByText('Cascades Park & Capital City Amphitheater')).toBeTruthy();
});
