import { StyleSheet } from 'react-native';

import { MapFallback } from '@/components/ui/map-fallback';
import { nativeMapsReady } from '@/lib/native-maps';
import { mapSpanDeg } from '@/lib/weather/cell';

export type EventMapProps = {
  lat: number;
  lng: number;
  title: string;
};

/**
 * The venue on a map, shown from event details while Discover is sorted by
 * distance. The pin is the event's public venue. The device dot stays off:
 * nothing new about the viewer leaves the phone (SAFETY.md).
 */
export function EventMap({ lat, lng, title }: EventMapProps) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Android without a Google Maps key would crash on MapView (lib/native-maps.ts).
  if (!nativeMapsReady()) return <MapFallback title={title} testID="event-map" />;
  // Required only when the map is actually opened, so a test that never
  // toggles it does not load the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const maps = require('react-native-maps') as typeof import('react-native-maps');
  const MapView = maps.default;
  const Marker = maps.Marker;
  const span = mapSpanDeg(0.6);
  const lngSpan = span / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return (
    <MapView
      testID="event-map"
      style={styles.map}
      mapType="hybrid"
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsPointsOfInterest={false}
      pitchEnabled={false}
      rotateEnabled={false}
      toolbarEnabled={false}
      initialRegion={{
        latitude: lat,
        longitude: lng,
        latitudeDelta: span,
        longitudeDelta: lngSpan,
      }}
      accessibilityLabel={`Map of ${title}`}>
      <Marker coordinate={{ latitude: lat, longitude: lng }} title={title} />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
});
