import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Muted } from '@/components/ui/muted';
import { Surface } from '@/constants/theme';
import { useUiPalette } from '@/hooks/use-ui-palette';
import { shareActivity } from '@/lib/calendar-share';
import {
  canShare,
  friendNamesLabel,
  headcountLabel,
  sourceActionFor,
  travelLabel,
} from '@/lib/card-actions';
import type { FeedItem } from '@/lib/feed';
import { FeedText } from '@/lib/feed-text';
import { useMapsApp } from '@/hooks/use-maps-app';
import { directionsFor } from '@/lib/maps-choice';
import { venuePhotoFor, venueWebsiteFor } from '@/lib/venue-website';
import { TierMode } from '@/lib/tiers';
import { CommunityDetails } from './community-details';
import { EventMap } from '@/components/ui/event-map';
import { useBackToClose } from '@/hooks/use-back-to-close';
import { VenuePhoto } from '@/components/ui/venue-photo';

export type ActivityDetailsProps = {
  item: FeedItem;
  mode: TierMode;
  joined: boolean;
  onToggleJoin: () => void;
  onAction: () => void;
  onClose: () => void;
  /** Discover is sorted by distance, so the sheet can open a map of the venue. */
  byDistance?: boolean;
  /** Friend display names visible via explicit opt-in grants (W5). Never invent. */
  visibleFriendNames?: readonly string[];
};

type ActivityDetailsSourceLink = Readonly<{
  label: 'Source';
  url: string;
}>;

export function ActivityDetails({
  item,
  mode,
  joined,
  onToggleJoin,
  onAction,
  onClose,
  byDistance = false,
  visibleFriendNames = [],
}: ActivityDetailsProps) {
  const palette = useUiPalette();
  const { app: mapsApp } = useMapsApp();
  const [mapOpen, setMapOpen] = useState(false);
  // Android Back (web app) closes the sheet instead of leaving onto.
  useBackToClose(true, onClose);
  const source = sourceActionFor(item);
  const sourceLink: ActivityDetailsSourceLink | null =
    source?.kind === 'link' ? { label: 'Source', url: source.url } : null;
  const venueSite = venueWebsiteFor(item.venue);
  const venuePhoto = venuePhotoFor(item.venue);
  const join = joined ? 'Going ✓' : 'Going';
  const kicker = [
    item.category === 'roadtrip' ? 'ROAD TRIP' : item.category.toUpperCase(),
    item.source === 'user' ? 'POSTED BY A MEMBER' : null,
    item.rating === 'mature' ? '21+' : null,
    item.rating === 'family' ? 'FAMILY' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      accessibilityViewIsModal>
      <View style={styles.overlay} testID="activity-details">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss details"
        />
        <ThemedView
          lightColor={palette.element}
          darkColor={palette.element}
          style={[styles.sheet, palette.sky && { borderColor: palette.border }]}
          accessibilityRole="summary">
          <SafeAreaView edges={['bottom']} style={styles.safe} testID="activity-details-body">
            <View style={styles.grabRow}>
              <View style={[styles.grab, { backgroundColor: palette.border }]} />
            </View>
            <View style={styles.headerRow}>
              <Muted mono>{kicker}</Muted>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeTarget}>
                <ThemedText type="link" style={styles.small}>
                  Close
                </ThemedText>
              </Pressable>
            </View>
            <ScrollView
              testID="activity-details-scroll"
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}>
              <ThemedText type="subtitle" numberOfLines={3} ellipsizeMode="tail">
                {item.title}
              </ThemedText>
              <VenuePhoto photo={venuePhoto} website={venueSite?.url ?? null} />
              <Muted>{item.whenLabel}</Muted>
              <Muted>
                {item.venue} · {item.area}
              </Muted>
              <Muted>{travelLabel(item.miles)}</Muted>
              {byDistance ? (
                <Pressable
                  onPress={() => setMapOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: mapOpen }}
                  accessibilityLabel={mapOpen ? `Hide map of ${item.title}` : `Map of ${item.title}`}
                  style={styles.linkTarget}>
                  <ThemedText type="link" style={styles.small}>
                    {mapOpen ? 'Hide map' : 'Map'}
                  </ThemedText>
                </Pressable>
              ) : null}
              {byDistance && mapOpen ? (
                <EventMap lat={item.lat} lng={item.lng} title={item.venue} />
              ) : null}
              <ThemedText style={styles.description}>{FeedText.display(item.description)}</ThemedText>
              <Muted testID="activity-headcount">{headcountLabel(item.attendees ?? 0)}</Muted>
              {friendNamesLabel(visibleFriendNames) ? (
                <Muted testID="activity-friends">{friendNamesLabel(visibleFriendNames)}</Muted>
              ) : null}
              {item.sourceName ? <Muted>via {item.sourceName}</Muted> : null}
              <CommunityDetails key={item.id} item={item} joined={joined} mode={mode} onNavigate={onClose} />

              {source?.kind === 'note' ? <Muted>{source.text}</Muted> : null}

              <View style={styles.actionRow}>
                {sourceLink ? (
                  <Pressable
                    onPress={() => {
                      onAction();
                      Linking.openURL(sourceLink.url).catch(() => {});
                    }}
                    accessibilityRole="link"
                    style={styles.linkTarget}
                    accessibilityLabel={`Source for ${item.title}`}>
                    <ThemedText type="link" style={styles.small}>
                      {sourceLink.label}
                    </ThemedText>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    onAction();
                    Linking.openURL(directionsFor(mapsApp, item.lat, item.lng, item.venue)).catch(
                      () => {},
                    );
                  }}
                  accessibilityRole="link"
                  style={styles.linkTarget}
                  accessibilityLabel={`Directions to ${item.venue}`}>
                  <ThemedText type="link" style={styles.small}>
                    Directions
                  </ThemedText>
                </Pressable>
                {venueSite ? (
                  <Pressable
                    onPress={() => {
                      Linking.openURL(venueSite.url).catch(() => {});
                    }}
                    accessibilityRole="link"
                    style={styles.linkTarget}
                    testID="venue-website"
                    accessibilityLabel={`Venue website for ${venueSite.name}`}>
                    <ThemedText type="link" style={styles.small}>
                      Venue website
                    </ThemedText>
                  </Pressable>
                ) : null}

              </View>
            </ScrollView>
            <View style={styles.joinRow}>
            <Pressable
              onPress={onToggleJoin}
              accessibilityRole="button"
              accessibilityState={{ selected: joined }}
              accessibilityHint={
                joined
                  ? 'Remove this RSVP from your plans.'
                  : 'RSVP only: save this event to your plans. Tickets may be required separately.'
              }
              accessibilityLabel={`${join}: ${item.title}`}
              style={styles.joinWrap}>
              <ThemedView
                lightColor={
                  palette.sky
                    ? palette.selected
                    : joined
                      ? Surface.elementSelected.light
                      : '#ffffff'
                }
                darkColor={
                  palette.sky
                    ? palette.selected
                    : joined
                      ? Surface.elementSelected.dark
                      : '#000000'
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
              {canShare(joined) ? (
                <Pressable
                  onPress={() => { void shareActivity(item); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${item.title}`}
                  style={styles.shareButton}>
                  <MaterialIcons name="share" size={22} color={palette.text} />
                </Pressable>
              ) : null}
            </View>
          </SafeAreaView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(11, 13, 30, 0.55)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  // The sheet caps at 88% of the screen, but a child only respects that cap if
  // it is allowed to shrink. Without flexShrink here and on the scroll area, a
  // long event grew the scroll area to its full content height: it ran off the
  // bottom of the screen, had nothing to scroll, and pushed Going/Share out of
  // reach (James's iPhone, 2026-10-17: scrolling an event page closed the
  // browser). Places' sheet already shrinks its ScrollView the same way.
  safe: {
    flexShrink: 1,
    minHeight: 0,
    gap: 8,
    paddingBottom: 12,
  },
  grabRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 999,
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    gap: 6,
    paddingBottom: 8,
  },
  description: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  closeTarget: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  linkTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  joinWrap: { flex: 1 },
  shareButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  joinButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
});
