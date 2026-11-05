import { StyleSheet } from 'react-native';
import MapView, { Circle, UrlTile } from 'react-native-maps';

import { mapSpanDeg, type WeatherCell } from '@/lib/weather/cell';
import { RADAR_TILE_URL } from '@/lib/weather/radar';

export type WeatherMapProps = {
  cell: WeatherCell;
  /** The feed's own point, drawn locally as the ring; never sent anywhere. */
  lat: number;
  lng: number;
  radiusMi: number;
};

/**
 * The aerial weather view: Apple's satellite imagery with road and place
 * labels, NEXRAD radar laid over it, and a ring for the area the feed covers.
 * The map opens on the weather cell's grid point, so imagery and radar tiles
 * are asked for around that public point, not around the viewer. No device
 * dot (SAFETY.md: the map opens with the device dot off).
 */
export function WeatherMap({ cell, lat, lng, radiusMi }: WeatherMapProps) {
  const span = mapSpanDeg(radiusMi);
  const lngSpan = span / Math.max(0.2, Math.cos((cell.lat * Math.PI) / 180));
  return (
    <MapView
      key={`${cell.key}|${span}`}
      testID="weather-map"
      style={styles.map}
      mapType="hybrid"
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsPointsOfInterest={false}
      pitchEnabled={false}
      rotateEnabled={false}
      toolbarEnabled={false}
      initialRegion={{ latitude: cell.lat, longitude: cell.lng, latitudeDelta: span, longitudeDelta: lngSpan }}
      accessibilityLabel="Radar over a satellite map of the area this feed covers">
      {/* Radar exists to zoom 10; closer in it is drawn larger, never blank. */}
      <UrlTile urlTemplate={RADAR_TILE_URL} maximumNativeZ={10} opacity={0.7} zIndex={1} tileSize={256} />
      <Circle
        center={{ latitude: lat, longitude: lng }}
        radius={Math.max(1, radiusMi) * 1609.344}
        strokeColor="rgba(255, 138, 107, 0.95)"
        fillColor="rgba(255, 138, 107, 0.08)"
        strokeWidth={2}
        zIndex={2}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
