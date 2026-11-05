import { SkyAppearance } from '@/components/sky/appearance';
import { ScrollView, View, StyleSheet, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Muted, Wordmark } from '@/components/ui';
import { SaveToCalendar } from '@/components/ui/save-to-calendar';
import { GoingScope, useGoing } from '@/hooks/use-going';
import { useTierMode } from '@/hooks/use-tier-mode';
import { goingSections, type SavedPlan } from '@/lib/going';
import { shareLine } from '@/lib/calendar-share';
import { SKY_SURFACE } from '@/lib/sky/palette';
import { TAB_TITLES } from '@/lib/tab-titles';

export default function GoingScreen() { return <SkyAppearance.Provider value><GoingScope><GoingContent /></GoingScope></SkyAppearance.Provider>; }

function GoingContent() {
  const going = useGoing();
  const { mode } = useTierMode();
  const sections = goingSections(going.records, going.joinedIds, going.now, mode);
  const entry = (plan: SavedPlan, past: boolean) => <View key={plan.event.id} style={styles.card}>
    <ThemedText type="subtitle" lightColor={SKY_SURFACE.text} darkColor={SKY_SURFACE.text}>{plan.event.title}</ThemedText>
    <Muted>{shareLine(plan.event)}</Muted>
    {plan.event.isCancelled ? <Muted>Cancelled by the source.</Muted> : null}
    {past && !(Date.parse(plan.event.endsAtIso ?? '') > Date.parse(plan.event.startsAtIso ?? ''))
      ? <Muted>Start time has passed; end time unknown.</Muted> : null}
    {past ? <Muted>History</Muted> : null}
    {going.joinedIds.has(plan.event.id) ? <Pressable accessibilityRole="button"
      accessibilityLabel={`Unmark Going: ${plan.event.title}`} onPress={() => going.togglePlan(plan.event)}
      style={styles.action}><Muted>{past ? 'Remove Going mark · keep history' : 'Unmark Going'}</Muted></Pressable> : null}
    <SaveToCalendar item={plan.event} />
  </View>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Wordmark />
    <ThemedText type="title" lightColor={SKY_SURFACE.text} darkColor={SKY_SURFACE.text}>{TAB_TITLES.going}</ThemedText>
    <Muted>Your plans, independent of Discover’s date and distance.</Muted>
    {!going.loaded || going.now === null ? <Muted>Loading plans…</Muted> : <>
      <ThemedText type="subtitle" lightColor={SKY_SURFACE.text} darkColor={SKY_SURFACE.text}>Upcoming</ThemedText>
      {sections.upcoming.length ? sections.upcoming.map(p => entry(p,false)) : <Muted>No upcoming plans in this mode.</Muted>}
      {sections.undated.length ? <><Muted>Time unavailable</Muted>{sections.undated.map(p=>entry(p,false))}</> : null}
      <ThemedText type="subtitle" lightColor={SKY_SURFACE.text} darkColor={SKY_SURFACE.text}>Past</ThemedText>
      {sections.past.length ? sections.past.map(p=>entry(p,true)) : <Muted>No past plans in this mode.</Muted>}
      {[...going.joinedIds].some(id=>!going.records[id]?.event.rating) || Object.values(going.records).some(p=>!p.event.rating)
        ? <Muted>Some saved plans need details and a rating before they can be shown.</Muted> : null}
    </>}
    {going.syncing ? <Muted>Syncing plans…</Muted> : null}
    {going.syncError ? <Muted accessibilityLiveRegion="polite">Cloud sync is offline. Showing plans available on this device. Check sign-in in Account.</Muted> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SKY_SURFACE.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: SKY_SURFACE.chip, padding: 16, gap: 8, borderRadius: 16 },
  action: { minHeight: 44, justifyContent: 'center' },
});
