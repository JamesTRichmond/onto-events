import { render, screen } from '@testing-library/react-native';

import { EventMap } from '../event-map';

const seen: { map: Record<string, unknown>[]; marker: Record<string, unknown>[] } = {
  map: [],
  marker: [],
};

jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  const MapView = (props: { children?: React.ReactNode }) => {
    seen.map.push(props);
    return <View testID="native-map">{props.children}</View>;
  };
  const Marker = (props: Record<string, unknown>) => {
    seen.marker.push(props);
    return <View testID="native-marker" />;
  };
  return { __esModule: true, default: MapView, Marker };
});

describe('EventMap', () => {
  beforeEach(() => {
    seen.map.length = 0;
    seen.marker.length = 0;
  });

  it('pins the venue and keeps the device dot off', () => {
    render(<EventMap lat={40.764} lng={-111.891} title="Gallivan Center" />);

    expect(seen.map).toHaveLength(1);
    expect(seen.map[0]).toEqual(expect.objectContaining({
      showsUserLocation: false,
      showsMyLocationButton: false,
    }));
    expect(seen.marker).toEqual([
      expect.objectContaining({
        coordinate: { latitude: 40.764, longitude: -111.891 },
        title: 'Gallivan Center',
      }),
    ]);
    expect(screen.getByTestId('native-map')).toBeTruthy();
  });

  it('does not mount a map when the venue coordinate is not finite', () => {
    render(<EventMap lat={Number.NaN} lng={-111.891} title="Nowhere" />);
    expect(seen.map).toHaveLength(0);
    expect(screen.queryByTestId('native-map')).toBeNull();
  });
});
