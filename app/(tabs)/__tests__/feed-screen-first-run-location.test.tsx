import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { StyleSheet } from 'react-native';

import FeedScreen from '../index';
import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import { LOOK_COPY } from '@/lib/pinned-spot';
import { STORAGE_KEYS } from '@/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
const mockCatalog = { listEvents: jest.fn(), getEvent: jest.fn(), getCatalogFreshness: jest.fn() };
jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => ({ catalogBackend: mockCatalog, rsvpBackend: null, rsvpOwnerId: null }),
}));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-17T16:00:00Z') }));
jest.mock('@/data/bundled-activities', () => ({
  BUNDLED_ACTIVITIES: [
    {
      id: 'vt-middlebury-green',
      title: 'Town Green Acoustic Hour',
      venue: 'Middlebury Town Green',
      area: 'Middlebury',
      description: 'Community music on the green.',
      category: 'music',
      rating: 'general',
      source: 'local',
      sourceName: 'Town of Middlebury',
      whenLabel: 'Today',
      startsInMinutes: 15,
      startsAtIso: '2026-10-17T16:15:00Z',
      lat: 44.0153,
      lng: -73.1673,
      serviceRegion: 'vermont-corridor',
    },
  ],
}));
jest.mock('@/components/ui/pin-picker', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    PinPicker: ({
      cityName,
      onPick,
      onClose,
    }: {
      cityName?: string;
      onPick: (spot: { lat: number; lng: number }) => void;
      onClose: () => void;
    }) => (
      <View testID="pin-picker">
        <Text>{`Pin picker for ${cityName}`}</Text>
        <Pressable
          accessibilityLabel="Confirm Middlebury pin"
          onPress={() => onPick({ lat: 44.0155, lng: -73.1675 })}>
          <Text>Use this location</Text>
        </Pressable>
        <Pressable accessibilityLabel="Cancel location selection" onPress={onClose}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
    ),
  };
});

describe('FeedScreen first-run location flow', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
      coords: { latitude: 40.7608, longitude: -111.891 },
    } as never);
    mockCatalog.listEvents.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('opens the dropdown on first run with "Share location (optional)" and 44pt plain-word buttons', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    expect(await screen.findByTestId('feed-controls')).toBeTruthy();
    // LocationControls mounts inside feed-controls and decides the prompt after its own storage read.
    expect(await screen.findByTestId('first-run-location-prompt')).toBeTruthy();
    expect(screen.getByText(LOOK_COPY.sharePrompt)).toBeTruthy();

    for (const label of [
      LOOK_COPY.allowLocation,
      LOOK_COPY.notNow,
      LOOK_COPY.findMe,
      LOOK_COPY.dropPin,
      LOOK_COPY.slc,
    ]) {
      const button = screen.getByLabelText(label);
      expect(button).toBeTruthy();
      const pill = button.children[0];
      expect(typeof pill).toBe('object');
      if (typeof pill !== 'string') {
        const flatStyle = StyleSheet.flatten(pill.props.style);
        expect(flatStyle.minHeight).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('Not now opens the city list, persists the flag, shows events for Middlebury, and offers an optional map pin; second open starts closed', async () => {
    mockCatalog.listEvents.mockRejectedValue(new Error('offline'));
    const first = render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await screen.findByText(LOOK_COPY.sharePrompt);
    fireEvent.press(screen.getByLabelText(LOOK_COPY.notNow));

    expect(screen.getByTestId('city-picker')).toBeTruthy();
    expect(screen.queryByTestId('first-run-location-prompt')).toBeNull();
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(STORAGE_KEYS.firstRunLocationSeen)).toBe('1');
    });

    fireEvent.press(screen.getByLabelText('Middlebury'));
    expect(screen.queryByTestId('city-picker')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching Middlebury · within 1 mile/);
    });

    // Events are already visible without forcing the map pin.
    expect(await screen.findByText('Town Green Acoustic Hour')).toBeTruthy();

    // Optional quiet line to narrow down on the map, at least 44pt tall.
    const narrowBtn = screen.getByTestId('narrow-on-map');
    expect(narrowBtn).toBeTruthy();
    expect(StyleSheet.flatten(narrowBtn.props.style).minHeight).toBeGreaterThanOrEqual(44);

    fireEvent.press(narrowBtn);
    expect(screen.getByTestId('pin-picker')).toBeTruthy();
    expect(screen.getByText('Pin picker for Middlebury')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Confirm Middlebury pin'));
    await waitFor(() => {
      expect(screen.getByTestId('search-place')).toHaveTextContent(/Searching around your pin/);
    });
    expect(screen.queryByTestId('narrow-on-map')).toBeNull();
    expect(screen.queryByTestId('first-run-location-prompt')).toBeNull();

    // Second open: dropdown starts closed and nothing prompts.
    first.unmount();
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await act(async () => {});
    expect(screen.queryByTestId('feed-controls')).toBeNull();
    expect(screen.queryByTestId('first-run-location-prompt')).toBeNull();

    // Even if the user opens the dropdown on second run, the prompt never appears twice.
    fireEvent.press(screen.getByTestId('dash-toggle'));
    expect(screen.getByTestId('feed-controls')).toBeTruthy();
    expect(screen.queryByTestId('first-run-location-prompt')).toBeNull();
  });

  it('Allow triggers findMe, persists the first-run flag, and never shows the prompt again', async () => {
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await screen.findByText(LOOK_COPY.sharePrompt);
    // Initial mount asked once; tapping Allow asks again via findMe().
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);

    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
    fireEvent.press(screen.getByLabelText(LOOK_COPY.allowLocation));

    expect(screen.queryByTestId('first-run-location-prompt')).toBeNull();
    await waitFor(() => {
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
      expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    });
    expect(await AsyncStorage.getItem(STORAGE_KEYS.firstRunLocationSeen)).toBe('1');
  });

  it('closing the dropdown on first run persists the flag so reopening or relaunching never prompts again', async () => {
    const first = render(<FeedScreen />, { wrapper: SelectedLocationProvider });

    await screen.findByText(LOOK_COPY.sharePrompt);
    fireEvent.press(screen.getByTestId('dash-toggle'));

    expect(screen.queryByTestId('feed-controls')).toBeNull();
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(STORAGE_KEYS.firstRunLocationSeen)).toBe('1');
    });

    // Reopening in the same session does not re-show the prompt.
    fireEvent.press(screen.getByTestId('dash-toggle'));
    expect(screen.getByTestId('feed-controls')).toBeTruthy();
    expect(screen.queryByTestId('first-run-location-prompt')).toBeNull();

    // Second launch starts closed.
    first.unmount();
    render(<FeedScreen />, { wrapper: SelectedLocationProvider });
    await act(async () => {});
    expect(screen.queryByTestId('feed-controls')).toBeNull();
  });
});
