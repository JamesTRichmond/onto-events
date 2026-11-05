import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { CITIES, CITY_STATES, COMING_SOON_CITIES, type City, type CityId } from '@/data/cities';
import { useBackToClose } from '@/hooks/use-back-to-close';
import { SKY_SURFACE } from '@/lib/sky/palette';

type Props = { selectedCityId: CityId; onPick: (id: CityId) => void; onClose: () => void };

// Alphabetize the states list
const SORTED_STATES = [...CITY_STATES].sort((a, b) => a.localeCompare(b));

// Group and alphabetize the cities within each state non-destructively
const CITIES_BY_STATE = SORTED_STATES.reduce<Record<string, City[]>>((acc, state) => {
  acc[state] = CITIES.filter(city => city.state === state)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return acc;
}, {});

// Alphabetize coming soon previews
const SORTED_COMING_SOON = [...COMING_SOON_CITIES].sort((a, b) => a.localeCompare(b));

export function CityPicker({ selectedCityId, onPick, onClose }: Props) {
  useBackToClose(true, onClose);

  // Auto-expand the state containing the currently selected city by default
  const activeState = CITIES.find(city => city.id === selectedCityId)?.state;
  const [expandedStates, setExpandedStates] = useState<Set<string>>(
    () => new Set(activeState ? [activeState] : [])
  );

  const toggleState = (state: string) => {
    setExpandedStates(prev => {
      const next = new Set(prev);
      if (next.has(state)) {
        next.delete(state);
      } else {
        next.add(state);
      }
      return next;
    });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.panel} testID="city-picker">
          <View style={styles.bar}>
            <ThemedText type="subtitle" style={styles.text} accessibilityRole="header">
              change city
            </ThemedText>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Cancel city selection"
              accessibilityRole="button"
              style={styles.cancel}>
              <ThemedText style={styles.accent}>Cancel</ThemedText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {SORTED_STATES.map(state => {
              const cities = CITIES_BY_STATE[state] ?? [];
              const isExpanded = expandedStates.has(state);
              return (
                <View key={state} style={styles.stateSection}>
                  <Pressable
                    onPress={() => toggleState(state)}
                    accessibilityRole="button"
                    accessibilityLabel={`${state}, ${cities.length} ${cities.length === 1 ? 'city' : 'cities'}, ${isExpanded ? 'expanded' : 'collapsed'}`}
                    accessibilityState={{ expanded: isExpanded }}
                    testID={`state-toggle-${state.toLowerCase().replace(/\s+/g, '-')}`}
                    style={({ pressed }) => [styles.stateHeader, pressed && styles.stateHeaderPressed]}>
                    <View style={styles.stateTitleRow}>
                      <ThemedText style={styles.chevron}>{isExpanded ? '▾' : '▸'}</ThemedText>
                      <ThemedText style={styles.stateTitle}>{state}</ThemedText>
                    </View>
                    <ThemedText style={styles.countBadge}>
                      {cities.length} {cities.length === 1 ? 'city' : 'cities'}
                    </ThemedText>
                  </Pressable>
                  <View style={!isExpanded ? styles.collapsed : styles.cityList}>
                    {cities.map(city => {
                      const isSelected = city.id === selectedCityId;
                      return (
                        <Pressable
                          key={city.id}
                          onPress={() => onPick(city.id)}
                          accessibilityRole="button"
                          accessibilityLabel={city.name}
                          accessibilityState={{ selected: isSelected }}
                          style={[styles.row, isSelected && styles.selected]}>
                          <ThemedText style={styles.text}>{city.name}</ThemedText>
                          {isSelected ? <ThemedText style={styles.accent}>Selected city</ThemedText> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            {SORTED_COMING_SOON.length > 0 ? (
              <ThemedText style={styles.group} accessibilityRole="header">
                Coming soon
              </ThemedText>
            ) : null}
            {SORTED_COMING_SOON.map(name => (
              <Pressable
                key={name}
                disabled
                accessibilityRole="button"
                accessibilityLabel={`${name}, Coming soon`}
                accessibilityState={{ disabled: true }}
                style={styles.row}>
                <ThemedText style={styles.dim}>{name}</ThemedText>
                <ThemedText style={styles.dim}>Coming soon</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 16 },
  panel: { width: '100%', maxWidth: 640, maxHeight: '90%', flexShrink: 1, backgroundColor: SKY_SURFACE.card, borderRadius: 20, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  stateSection: { marginBottom: 4 },
  stateHeader: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.04)' },
  stateHeaderPressed: { opacity: 0.75, backgroundColor: 'rgba(255,255,255,0.08)' },
  stateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chevron: { color: SKY_SURFACE.secondary, fontSize: 13, width: 14, textAlign: 'center' },
  stateTitle: { color: SKY_SURFACE.text, fontWeight: '600', fontSize: 15 },
  countBadge: { color: SKY_SURFACE.secondary, fontSize: 13 },
  cityList: { paddingLeft: 8, paddingTop: 2, paddingBottom: 4 },
  collapsed: { height: 0, overflow: 'hidden', opacity: 0 },
  row: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  selected: { backgroundColor: SKY_SURFACE.chip },
  group: { color: SKY_SURFACE.secondary, paddingHorizontal: 12, paddingTop: 20, paddingBottom: 8 },
  text: { color: SKY_SURFACE.text },
  accent: { color: SKY_SURFACE.selected },
  dim: { color: '#9597AA' },
});
