import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';

import PlacesScreen from '../places';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    lat: 40.7608, lng: -111.891, source: 'fallback', loading: false, fallbackReason: null,
    refresh: jest.fn(),
  }),
}));

describe('Places screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('owns the Featured sort; Discover does not', () => {
    render(<PlacesScreen />, { wrapper: SelectedLocationProvider });

    expect(screen.getByText('Featured')).toBeTruthy();
    expect(screen.queryByText('This sky')).toBeNull();
    expect(screen.getByText('Nearest')).toBeTruthy();
    expect(screen.getByText('Best now')).toBeTruthy();
    expect(screen.queryByText('Open now')).toBeNull();
    expect(screen.getByText('Evergreen · on because the land is there.')).toBeTruthy();
  });
});
