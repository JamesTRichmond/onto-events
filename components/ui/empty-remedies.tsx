import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { CityPicker } from '@/components/ui/city-picker';
import { useSelectedLocation } from '@/hooks/use-selected-location';
import { widenLabel, type WidenSuggestion } from '@/lib/widen-radius';

/**
 * One-tap ways out of a dead-end Discover screen (#434). These sit inside the
 * empty state, never in the dashboard: the dashboard and the location
 * controls belong to other queued work, so this file only reuses them.
 */

/** "Nothing in range." → the smallest distance that shows a card, with its count. */
export function WidenRemedy({ suggestion, onWiden }: { suggestion: WidenSuggestion; onWiden: (radiusMi: number) => void }) {
  return (
    <View style={styles.row} testID="widen-remedy">
      <Chip
        label={widenLabel(suggestion)}
        selected={false}
        onPress={() => onWiden(suggestion.radiusMi)}
        accessibilityHint="Saves this distance and shows what it reaches. Feed options can change it back."
      />
    </View>
  );
}

/**
 * No usable location (denied, timed out, or outside every service region) →
 * pick a launched city, or ask the device again. The city path needs no
 * permission; asking again re-runs the one permission request the browser
 * allows, and never repeats on its own.
 */
export function LocationRemedy() {
  const { city, chooseCity, findMe } = useSelectedLocation();
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.row} testID="location-remedy">
      <Chip
        label="Pick a city"
        selected={false}
        onPress={() => setPicking(true)}
        accessibilityHint="Choose an available city without location permission."
      />
      <Chip
        label="Try location again"
        selected={false}
        onPress={findMe}
        accessibilityHint="Asks for your current location once."
      />
      {picking ? (
        <CityPicker
          selectedCityId={city.id}
          onClose={() => setPicking(false)}
          onPick={(id) => { if (chooseCity(id)) setPicking(false); }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
});
