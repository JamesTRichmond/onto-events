import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { CityPicker } from '@/components/ui/city-picker';
import { Muted } from '@/components/ui/muted';
import { PinPicker } from '@/components/ui/pin-picker';
import { useSelectedLocation } from '@/hooks/use-selected-location';
import { nativeMapsReady } from '@/lib/native-maps';
import { LOOK_COPY } from '@/lib/pinned-spot';
import { getItem, onOntoDataErased, setItem, STORAGE_KEYS } from '@/lib/storage';

const firstRunSeenListeners = new Set<() => void>();

/** Persist the first-run location flag and dismiss any mounted first-run prompt. */
export function markFirstRunLocationSeen(): void {
  void setItem(STORAGE_KEYS.firstRunLocationSeen, '1');
  firstRunSeenListeners.forEach((listener) => listener());
}

/** The same deliberate location controls in Discover's accordion and Places. */
export function LocationControls({ onChoose }: { onChoose?: () => void }) {
  const { choice, city, loaded, findMe, chooseCity, choosePin } = useSelectedLocation();
  const [picker, setPicker] = useState<'city' | 'pin' | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showNarrowHint, setShowNarrowHint] = useState(false);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    markFirstRunLocationSeen();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let dismissed = false;
    const onSeen = () => {
      dismissed = true;
      if (!cancelled) setShowPrompt(false);
    };
    firstRunSeenListeners.add(onSeen);
    void Promise.all([
      getItem(STORAGE_KEYS.firstRunLocationSeen),
      getItem(STORAGE_KEYS.locationChoice),
      getItem(STORAGE_KEYS.legacyLocationChoice),
    ]).then(([seen, savedChoice, legacy]) => {
      if (cancelled || dismissed) return;
      if (seen === null && savedChoice === null && legacy === null) {
        setShowPrompt(true);
      }
    });
    const unsubscribeErase = onOntoDataErased(() => {
      if (!cancelled) {
        setShowPrompt(true);
        setShowNarrowHint(false);
      }
    });
    return () => {
      cancelled = true;
      firstRunSeenListeners.delete(onSeen);
      unsubscribeErase();
    };
  }, []);

  return <>
    {showPrompt ? (
      <View style={styles.promptRow} testID="first-run-location-prompt">
        <Muted>{LOOK_COPY.sharePrompt}</Muted>
        <View style={styles.row}>
          <Chip label={LOOK_COPY.allowLocation} selected={false}
            onPress={() => { dismissPrompt(); setShowNarrowHint(false); findMe(); onChoose?.(); }}
            accessibilityHint="Uses your current location once to choose where both pages search." />
          <Chip label={LOOK_COPY.notNow} selected={false}
            onPress={() => { dismissPrompt(); setPicker('city'); }}
            accessibilityHint="Choose an available city without location permission." />
        </View>
      </View>
    ) : null}
    <View style={styles.singleLineRow} testID="look-row">
      <View style={styles.flexChip}>
        <Chip
          label={LOOK_COPY.displayFindMe}
          accessibilityLabel={LOOK_COPY.findMe}
          selected={choice === 'device'}
          onPress={() => { dismissPrompt(); setShowNarrowHint(false); findMe(); onChoose?.(); }}
          accessibilityHint="GPS: Uses your current location once to choose where both pages search." />
      </View>
      {nativeMapsReady() ? (
        <View style={styles.flexChip}>
          <Chip
            label={LOOK_COPY.displayDropPin}
            accessibilityLabel={LOOK_COPY.dropPin}
            selected={choice === 'pin'}
            onPress={() => { dismissPrompt(); setPicker('pin'); }}
            accessibilityHint="Map Pin: Choose a place on a map. Both pages use the pin until onto closes." />
        </View>
      ) : null}
      <View style={styles.flexChip}>
        <Chip
          label={LOOK_COPY.displaySlc}
          accessibilityLabel={LOOK_COPY.slc}
          selected={choice === 'city'}
          onPress={() => { dismissPrompt(); setPicker('city'); }}
          accessibilityHint={`City: Selected city: ${city.name}. Choose an available city without location permission.`} />
      </View>
    </View>
    {nativeMapsReady() && showNarrowHint && choice === 'city' && loaded ? (
      <Pressable onPress={() => setPicker('pin')} accessibilityRole="button"
        accessibilityLabel={LOOK_COPY.narrowOnMap}
        accessibilityHint="Choose a place on a map. Both pages use the pin until onto closes."
        testID="narrow-on-map" style={styles.narrowButton}>
        <Muted>{LOOK_COPY.narrowOnMap}</Muted>
      </Pressable>
    ) : null}
    {picker === 'city' ? <CityPicker selectedCityId={city.id} onClose={() => setPicker(null)}
      onPick={id => { if (chooseCity(id)) { dismissPrompt(); setShowNarrowHint(true); setPicker(null); onChoose?.(); } }} /> : null}
    {picker === 'pin' && loaded ? <PinPicker start={city.anchor} cityName={city.name} onClose={() => setPicker(null)}
      onPick={spot => { if (choosePin(spot)) { dismissPrompt(); setShowNarrowHint(false); setPicker(null); onChoose?.(); } }} /> : null}
  </>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  singleLineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' },
  flexChip: { flex: 1 },
  promptRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  narrowButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
