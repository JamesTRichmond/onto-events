import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, type MapPressEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Muted } from '@/components/ui/muted';
import { isSupportedSpot, isValidSpot, PIN_PICKER_COPY, type Spot } from '@/lib/pinned-spot';

export type PinPickerProps = {
  /** Where the map opens. Never the device position unless the viewer asked. */
  start: Spot;
  cityName?: string;
  onPick: (spot: Spot) => void;
  onClose: () => void;
};

/**
 * A map where the viewer taps a spot for onto to look around, so distance can
 * work without sharing where they are. The spot is handed back and held in
 * memory only (SAFETY.md, location minimization).
 */
export function PinPicker({ start, cityName, onPick, onClose }: PinPickerProps) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const canConfirm = isSupportedSpot(spot);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.fill} testID="pin-picker">
        <View style={styles.bar}>
          <Pressable onPress={onClose} accessibilityLabel="Cancel location selection" accessibilityRole="button" style={styles.hit}>
            <ThemedText type="link">Cancel</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => canConfirm && onPick(spot)}
            disabled={!canConfirm}
            accessibilityLabel={PIN_PICKER_COPY.confirm}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
            style={styles.hit}>
            <ThemedText type="link" style={canConfirm ? null : styles.dim}>
              {PIN_PICKER_COPY.confirm}
            </ThemedText>
          </Pressable>
        </View>
        <Muted style={styles.note}>{spot ? PIN_PICKER_COPY.privacy : PIN_PICKER_COPY.prompt}</Muted>
        {cityName ? <Muted style={styles.note}>Map centered on {cityName} · approximate city point.</Muted> : null}
        {spot && !canConfirm ? <ThemedText accessibilityRole="alert" style={styles.note}>{PIN_PICKER_COPY.unsupported}</ThemedText> : null}
        <MapView
          testID="location-map"
          style={styles.fill}
          showsUserLocation={false}
          initialRegion={{
            latitude: start.lat,
            longitude: start.lng,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12,
          }}
          onPress={(event: MapPressEvent) => {
            const { latitude, longitude } = event.nativeEvent.coordinate;
            setSpot({ lat: latitude, lng: longitude });
          }}>
          {isValidSpot(spot) ? <Marker draggable coordinate={{ latitude: spot.lat, longitude: spot.lng }} onDragEnd={event => setSpot({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude })} /> : null}
        </MapView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  hit: { minHeight: 44, justifyContent: 'center' },
  dim: { opacity: 0.4 },
  note: { paddingHorizontal: 16, paddingBottom: 8 },
});
