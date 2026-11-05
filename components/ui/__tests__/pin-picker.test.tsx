import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { PinPicker } from '../pin-picker';

// react-native-maps on Android holds back the caller's props (testID, onPress)
// until the native map reports ready. Jest has no native map, so the Android
// lane reports it here; iOS passes the props from the first render.
function mapIsReady() {
  if (Platform.OS !== 'android') return;
  const map = screen.UNSAFE_root.findAll((node) => typeof node.props.onMapReady === 'function')[0];
  act(() => map.props.onMapReady());
}

it('requires a supported pin and confirms only the latest point', () => {
  const onPick = jest.fn(); const onClose = jest.fn();
  render(<PinPicker start={{ lat: 35.5956, lng: -82.5486 }} onPick={onPick} onClose={onClose} />);
  mapIsReady();
  expect(screen.getByLabelText('Use this location')).toBeDisabled();
  expect(screen.getByTestId('location-map').props.initialRegion).toMatchObject({ latitude: 35.5956, longitude: -82.5486 });
  fireEvent(screen.getByTestId('location-map'), 'press', { nativeEvent: { coordinate: { latitude: 0, longitude: 0 } } });
  expect(screen.getByLabelText('Use this location')).toBeDisabled();
  expect(screen.getByText('This location is outside available regions. Choose another point.')).toBeTruthy();
  fireEvent(screen.getByTestId('location-map'), 'press', { nativeEvent: { coordinate: { latitude: 44.48, longitude: -73.21 } } });
  fireEvent(screen.getByTestId('location-map'), 'press', { nativeEvent: { coordinate: { latitude: 44.14, longitude: -73.08 } } });
  expect(onPick).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Use this location'));
  expect(onPick).toHaveBeenCalledWith({ lat: 44.14, lng: -73.08 });
  fireEvent.press(screen.getByLabelText('Cancel location selection'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
