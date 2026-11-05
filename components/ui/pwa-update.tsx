import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { ActionButton } from './action-button';
import { acknowledgeHandoff, singleReload, watchUpdates } from '@/lib/pwa-update';

export function PwaUpdateBanner() {
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const reload = useRef(singleReload(() => window.location.reload()));
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    return watchUpdates(navigator.serviceWorker, () => setReady(true));
  }, []);
  if (!ready) return null;
  return <ThemedView style={{ padding: 16, gap: 12 }}>
    <ThemedText accessibilityLiveRegion="polite">A newer onto is ready.</ThemedText>
    {blocked ? <>
      <ThemedText>Finish or cancel your save or calendar handoff first.</ThemedText>
    </> : null}
    <ActionButton label={blocked ? "I've finished the handoff" : 'Reload onto'} onPress={() => {
      if (blocked) { acknowledgeHandoff(); setBlocked(false); }
      else if (!reload.current()) setBlocked(true);
    }} />
  </ThemedView>;
}
export function UpdateFallback() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.serviceWorker); }, []);
  return show ? <ThemedText>Refresh this page to get the latest onto.</ThemedText> : null;
}
