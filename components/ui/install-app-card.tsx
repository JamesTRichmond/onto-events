import { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton } from '@/components/ui/action-button';
import { Brand, Surface } from '@/constants/theme';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { installSteps } from '@/lib/pwa-install';
import { getItem, setItem, STORAGE_KEYS } from '@/lib/storage';

const dismissListeners = new Set<() => void>();

export function InstallAppCard({ firstVisit = false }: { firstVisit?: boolean }) {
  const { state, install } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState<readonly string[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let active = true;
    const instructions = installSteps(window.navigator.userAgent, window.navigator.maxTouchPoints);
    setSteps(instructions);
    void Promise.all([getItem(STORAGE_KEYS.installTipDismissed), getItem(STORAGE_KEYS.installTipSeen)]).then(([dismissed, seen]) => {
      if (!active || dismissed || (firstVisit && seen) || (!instructions.length && state !== 'promptable') || state === 'installed') return;
      setVisible(true);
      if (firstVisit) void setItem(STORAGE_KEYS.installTipSeen, '1');
    });
    return () => { active = false; };
  }, [firstVisit, state]);
  useEffect(() => { const hide = () => setVisible(false); dismissListeners.add(hide); return () => { dismissListeners.delete(hide); }; }, []);
  const dismiss = () => { dismissListeners.forEach(hide => hide()); void setItem(STORAGE_KEYS.installTipDismissed, '1'); };
  if (!visible || state === 'installed' || (!steps.length && state !== 'promptable')) return null;
  const card = <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card} testID="install-app">
    <ThemedText style={styles.heading}>Tips</ThemedText>
    <ThemedText style={styles.heading}>Add onto to your home screen</ThemedText>
    {steps.map((step, i) => <ThemedView key={step} style={styles.step}>
      <ThemedText style={styles.heading}>{i + 1}.</ThemedText>
      <ThemedText style={styles.label}>{step}</ThemedText>
    </ThemedView>)}
    {state === 'promptable' ? <ActionButton label="Install onto" onPress={() => void install()} /> : null}
    <ActionButton quiet label="Dismiss install tip" onPress={dismiss} />
  </ThemedView>;
  return firstVisit ? <Modal transparent animationType="fade" onRequestClose={dismiss}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(23,26,52,0.75)' }}>
      <ScrollView style={{ maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>{card}</ScrollView>
    </View>
  </Modal> : card;
}
const styles = StyleSheet.create({
  card: { padding: 20, gap: 16, borderRadius: 20 },
  heading: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  step: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: Brand.coral },
  label: { flex: 1, fontSize: 21, lineHeight: 30 },
});
