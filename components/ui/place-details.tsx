import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { Muted } from '@/components/ui/muted';
import { useBackToClose } from '@/hooks/use-back-to-close';
import { httpsOnlyUrl } from '@/lib/card-actions';
import { venuePhotoFor } from '@/lib/venue-website';
import { SKY_SURFACE } from '@/lib/sky/palette';
import type { RankedPlace } from '@/lib/spot-feed';

import { VenuePhoto } from './venue-photo';

export function PlaceDetails({
  item,
  onClose,
  onDirections,
}: {
  item: RankedPlace | null;
  onClose: () => void;
  onDirections: (item: RankedPlace) => void;
}) {
  useBackToClose(item !== null, onClose);
  const website = item ? httpsOnlyUrl(item.spot.sourceUrl) : null;
  const photo = item
    ? (venuePhotoFor(item.spot.venue, website) ?? venuePhotoFor(item.spot.title, website))
    : null;
  return (
    <Modal visible={item !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetScrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss place details"
        />
        <ThemedView lightColor={SKY_SURFACE.card} darkColor={SKY_SURFACE.card} style={styles.sheet}>
          {item ? (
            <>
              <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetContent}>
                <ThemedText type="subtitle">{item.spot.title}</ThemedText>
                <VenuePhoto photo={photo} website={website} expandable />
                {item.spot.address ? <Muted>{item.spot.address}</Muted> : null}
                {item.spot.approximate ? <Muted>Approximate public-place location.</Muted> : null}
                <Muted>{item.spot.hours}</Muted>
                <Muted>{item.line}</Muted>
                <ThemedText>{item.spot.description}</ThemedText>
                <ThemedText>{item.spot.stewardship}</ThemedText>
                {item.spot.hint ? <Muted>{item.spot.hint}</Muted> : null}
                {item.spot.sourceName ? <Muted>via {item.spot.sourceName}</Muted> : null}
              </ScrollView>
              <View style={styles.row}>
                <Chip label="Directions" selected={false} onPress={() => onDirections(item)} />
                {website ? (
                  <Chip
                    label="Venue website"
                    selected={false}
                    accessibilityLabel={`Venue website for ${item.spot.venue}`}
                    onPress={() => {
                      Linking.openURL(website).catch(() => {});
                    }}
                  />
                ) : null}
                <Chip label="Close" selected={false} onPress={onClose} />
              </View>
            </>
          ) : null}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,13,30,0.45)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, gap: 10, maxHeight: '90%' },
  sheetBody: { flexShrink: 1 },
  sheetContent: { gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
