import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Map as LeafletMap, Marker } from 'leaflet';
import './leaflet.web.css';
import './pin-picker.css';

import { ThemedText } from '@/components/themed-text';
import { useBackToClose } from '@/hooks/use-back-to-close';
import { isSupportedSpot, PIN_PICKER_COPY, type Spot } from '@/lib/pinned-spot';
import { SKY_SURFACE } from '@/lib/sky/palette';
import type { PinPickerProps } from './pin-picker';

/** Leaflet's browser globals are accessed only after this web component mounts. */
export function PinPicker({ start, cityName, onPick, onClose }: PinPickerProps) {
  useBackToClose(true, onClose);
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const place = useRef<((spot: Spot) => void) | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const canConfirm = isSupportedSpot(spot);

  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (!active || !element.current) return;
      const view = L.map(element.current, { center: [start.lat, start.lng], zoom: 13, zoomControl: true, keyboard: true, worldCopyJump: true });
      map.current = view;
      const icon = L.divIcon({ className: 'onto-map-pin', iconSize: [24, 24], iconAnchor: [12, 12] });
      let marker: Marker | null = null;
      const placePin = (next: Spot) => {
        if (!active) return;
        setSpot(next);
        if (marker) marker.setLatLng([next.lat, next.lng]);
        else {
          marker = L.marker([next.lat, next.lng], { icon, draggable: true, title: 'Selected location', alt: 'Selected location' }).addTo(view);
          marker.on('dragend', () => {
            const point = marker!.getLatLng();
            if (active) setSpot({ lat: point.lat, lng: point.lng });
          });
        }
      };
      place.current = placePin;
      view.on('click', event => placePin({ lat: event.latlng.lat, lng: event.latlng.lng }));
      // Standard browser caching, attribution and visible-view tiles only.
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, keepBuffer: 0, updateWhenIdle: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on('tileerror', () => { if (active) setTilesFailed(true); }).addTo(view);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => view.invalidateSize());
        observer.observe(element.current);
      }
      view.invalidateSize();
      setReady(true);
    }).catch(() => { if (active) setMapFailed(true); });
    return () => {
      active = false; observer?.disconnect(); map.current?.remove(); map.current = null; place.current = null;
    };
  }, [start.lat, start.lng]);

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.panel} testID="pin-picker">
        <View style={styles.bar}>
          <Pressable onPress={onClose} accessibilityLabel="Cancel location selection" accessibilityRole="button" style={styles.hit}><ThemedText style={styles.accent}>Cancel</ThemedText></Pressable>
          <Pressable onPress={() => canConfirm && onPick(spot)} disabled={!canConfirm} accessibilityRole="button" accessibilityLabel={PIN_PICKER_COPY.confirm} accessibilityState={{ disabled: !canConfirm }} style={styles.hit}><ThemedText style={[styles.accent, !canConfirm && styles.dim]}>{PIN_PICKER_COPY.confirm}</ThemedText></Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ThemedText style={styles.note}>{PIN_PICKER_COPY.prompt}</ThemedText>
        {cityName ? <ThemedText style={styles.note}>Map centered on {cityName} · approximate city point.</ThemedText> : null}
        <ThemedText style={styles.note}>{PIN_PICKER_COPY.webPrivacy}</ThemedText>
        {!ready && !mapFailed ? <ThemedText style={styles.note} accessibilityLiveRegion="polite">Loading map…</ThemedText> : null}
        {mapFailed || tilesFailed ? <ThemedText style={styles.note} accessibilityRole="alert">Map tiles are unavailable. Cancel to change city; city browsing still works.</ThemedText> : null}
        {spot && !canConfirm ? <ThemedText style={styles.note} accessibilityRole="alert">{PIN_PICKER_COPY.unsupported}</ThemedText> : null}
        <div ref={element} className="onto-location-map" role="region" aria-label="Location map" tabIndex={0} />
        <View style={styles.bottom}>
          <ThemedText style={styles.note}>Use arrow keys to move the map, then set the pin at its center.</ThemedText>
          <Pressable disabled={!ready} accessibilityRole="button" accessibilityLabel="Set pin at map center" accessibilityState={{ disabled: !ready }} style={styles.hit} onPress={() => {
            const center = map.current?.getCenter();
            if (center) place.current?.({ lat: center.lat, lng: center.lng });
          }}><ThemedText style={styles.accent}>Set pin at map center</ThemedText></Pressable>
        </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: { width: '100%', maxWidth: 680, height: '90%', backgroundColor: SKY_SURFACE.card, borderRadius: 20, overflow: 'hidden' },
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  hit: { minHeight: 44, justifyContent: 'center' },
  note: { color: SKY_SURFACE.secondary, paddingHorizontal: 16, paddingBottom: 8, fontSize: 13, lineHeight: 19 },
  accent: { color: SKY_SURFACE.selected },
  dim: { opacity: 0.4 },
  bottom: { padding: 12 },
});
