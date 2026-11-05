import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActivityDetails } from '@/components/ui/activity-details';
import { Muted } from '@/components/ui/muted';
import { SaveToCalendar } from '@/components/ui/save-to-calendar';
import { Surface } from '@/constants/theme';
import { useUiPalette } from '@/hooks/use-ui-palette';
import { travelLabel } from '@/lib/card-actions';
import { cardText } from '@/lib/card-text';
import { shareActivity } from '@/lib/calendar-share';
import type { FeedItem } from '@/lib/feed';
import { TierMode } from '@/lib/tiers';

/** Shared Discover card ceiling — every card shares this footprint (COM-6). */
export const ACTIVITY_CARD_MAX_HEIGHT = 280;

export type ActivityCardProps = {
  item: FeedItem;
  mode: TierMode;
  joined: boolean;
  onToggleJoin: () => void;
  /** Fires before any outbound link opens, so the feed can record the tap. */
  onAction: () => void;
  /** Named actions VoiceOver offers on the card (a swipe card's sort choices). */
  accessibilityActions?: readonly { name: string; label: string }[];
  onAccessibilityAction?: (name: string) => void;
  /** Details can toggle a map when the feed is sorted by distance. */
  byDistance?: boolean;
};

export function ActivityCard({
  item,
  mode,
  joined,
  onToggleJoin,
  onAction,
  accessibilityActions,
  onAccessibilityAction,
  byDistance = false,
}: ActivityCardProps) {
  const palette = useUiPalette();
  const [open, setOpen] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState('');
  // The card face shows capped text so one long listing cannot take the room
  // of three; the details sheet and the accessibility label keep every word.
  const text = cardText(item);
  const planStatus = joined ? 'Saved to your plans' : null;
  const join = joined ? 'Going ✓' : 'Going';

  return (
    <>
      <ThemedView
        testID="activity-card"
        lightColor={palette.element}
        darkColor={palette.element}
        style={[styles.card, palette.sky && { borderWidth: 1, borderColor: palette.border }]}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Details: ${item.title}`}
          accessibilityHint="Opens the full event details and available links."
          accessibilityActions={accessibilityActions?.length ? [...accessibilityActions] : undefined}
          onAccessibilityAction={
            onAccessibilityAction ? (event) => onAccessibilityAction(event.nativeEvent.actionName) : undefined
          }>
          <View style={styles.cardTopRow}>
            <Muted mono>
              {item.category === 'roadtrip' ? 'ROAD TRIP' : item.category.toUpperCase()}
              {item.source === 'user' ? ' · POSTED BY A MEMBER' : ''}
              {item.rating === 'mature' ? ' · 21+' : ''}
              {item.rating === 'family' ? ' · FAMILY' : ''}
            </Muted>
            <Muted mono>{item.whenLabel}</Muted>
          </View>

          <ThemedText
            type="subtitle"
            numberOfLines={2}
            ellipsizeMode="tail"
            style={[
              styles.cardTitle,
              palette.sky && { fontSize: 18, lineHeight: 24, fontWeight: '600' },
            ]}>
            {text.title}
          </ThemedText>
          <Muted numberOfLines={1} ellipsizeMode="tail">{text.place}</Muted>
          <Muted numberOfLines={1} ellipsizeMode="tail">{travelLabel(item.miles)}</Muted>
          <ThemedText
            testID="activity-card-description"
            numberOfLines={2}
            ellipsizeMode="tail"
            style={styles.cardDescription}>
            {text.description}
          </ThemedText>
        </Pressable>

        <View style={styles.cardBottomRow}>
          <View style={styles.cardBottomLeft}>
            {planStatus ? <Muted numberOfLines={1}>{planStatus}</Muted> : null}
            {/* Tier decision Q3: tier-neutral per-card source credits. */}
            {item.sourceName ? <Muted numberOfLines={1}>via {item.sourceName}</Muted> : null}
            {mode === 'everyone' && item.rating === 'general' && item.hosted?.newcomersWelcome ? <Muted numberOfLines={1}>Newcomers welcome</Muted> : null}
          </View>
          <Pressable
            onPress={onToggleJoin}
            accessibilityRole="button"
            accessibilityState={{ selected: joined }}
            accessibilityHint={
              joined
                ? 'Remove this RSVP from your plans.'
                : 'RSVP only: save this event to your plans. Tickets may be required separately.'
            }
            accessibilityLabel={`${join}: ${item.title}`}>
            <ThemedView
              lightColor={
                palette.sky ? palette.selected : joined ? Surface.elementSelected.light : '#ffffff'
              }
              darkColor={
                palette.sky ? palette.selected : joined ? Surface.elementSelected.dark : '#000000'
              }
              style={styles.joinButton}>
              <ThemedText
                lightColor={palette.sky ? palette.onSelected : undefined}
                darkColor={palette.sky ? palette.onSelected : undefined}
                style={styles.smallBold}>
                {join}
              </ThemedText>
            </ThemedView>
          </Pressable>
          <SaveToCalendar item={item} compact onFeedback={setCalendarNotice} />
          {joined ? (
            <Pressable
              onPress={() => { void shareActivity(item); }}
              accessibilityRole="button"
              accessibilityLabel={`Share ${item.title}`}
              style={styles.shareButton}>
              <MaterialIcons name="share" size={20} color={palette.text} />
            </Pressable>
          ) : null}
        </View>
      </ThemedView>
      {calendarNotice ? <Muted accessibilityLiveRegion="polite">{calendarNotice}</Muted> : null}
      {open ? (
        <ActivityDetails
          item={item}
          mode={mode}
          joined={joined}
          onToggleJoin={onToggleJoin}
          onAction={onAction}
          onClose={() => setOpen(false)}
          byDistance={byDistance}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
    maxHeight: ACTIVITY_CARD_MAX_HEIGHT,
    overflow: 'hidden',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  cardTitle: {
    // Fixed 2-line footprint so long titles cannot grow the card (COM-6).
    lineHeight: 24,
    maxHeight: 48,
    overflow: 'hidden',
  },
  cardDescription: {
    marginTop: 4,
    // Fixed 2-line footprint so Discover cards share one summary height on web
    // (RN numberOfLines alone still shrinks short copy).
    fontSize: 16,
    lineHeight: 24,
    height: 48,
    overflow: 'hidden',
  },
  cardBottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardBottomLeft: {
    gap: 2,
    flexShrink: 1,
  },
  joinButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    justifyContent: 'center',
  },
  shareButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
});
