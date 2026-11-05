import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { Muted } from '@/components/ui/muted';
import type { VenuePhoto as VenuePhotoRecord } from '@/data/venue-photos';
import { useBackToClose } from '@/hooks/use-back-to-close';
import { httpsOnlyUrl } from '@/lib/card-actions';
import { SKY_SURFACE } from '@/lib/sky/palette';

/** Fixed so a late image never shoves the card. Wide enough to read the building. */
export const VENUE_PHOTO_WIDTH = 320;
export const VENUE_PHOTO_HEIGHT = 180;
export const VENUE_PHOTO_EXPANDED_WIDTH = 640;
export const VENUE_PHOTO_EXPANDED_HEIGHT = 380;

/**
 * The venue's picture. In activity details, tapping opens the venue's own
 * website. When `expandable` is enabled (such as in place details), tapping
 * opens a larger photo viewer modal with attribution, source context, and a
 * clean return to the place details sheet.
 */
export function VenuePhoto({
  photo,
  website,
  expandable = false,
}: {
  photo: VenuePhotoRecord | null;
  website: string | null;
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useBackToClose(expanded, () => setExpanded(false));

  useEffect(() => {
    setExpanded(false);
    setImageError(false);
  }, [photo?.venue, website]);

  useEffect(() => {
    if (!expandable || !expanded) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onKeyDown = (event: { key?: string; preventDefault?: () => void }) => {
      if (event.key === 'Escape') {
        event.preventDefault?.();
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expandable, expanded]);

  if (!photo || !website) return null;

  const sourcePageUrl = httpsOnlyUrl(photo.sourcePage);

  if (imageError) {
    return (
      <View style={styles.wrap} testID="venue-photo">
        <View style={styles.fallbackBox} testID="venue-photo-fallback">
          <Muted>{`Photo unavailable for ${photo.venue}.`}</Muted>
        </View>
        <Muted testID="venue-photo-credit">{`${photo.credit} · ${photo.license}`}</Muted>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="venue-photo">
      <Pressable
        onPress={() => {
          if (expandable) {
            setExpanded(true);
            return;
          }
          Linking.openURL(website).catch(() => {});
        }}
        accessibilityRole={expandable ? 'button' : 'link'}
        accessibilityLabel={
          expandable
            ? `View larger photo of ${photo.venue}`
            : `Photo of ${photo.venue}. Opens the venue website.`
        }>
        <Image
          source={photo.file}
          style={styles.image}
          contentFit="cover"
          transition={0}
          onError={() => setImageError(true)}
          accessibilityLabel={`Photo of ${photo.venue}`}
        />
      </Pressable>
      <Muted testID="venue-photo-credit">{`${photo.credit} · ${photo.license}`}</Muted>
      {expandable ? (
        <Modal
          visible={expanded}
          transparent
          animationType="fade"
          onRequestClose={() => setExpanded(false)}
          accessibilityViewIsModal>
          <View style={styles.modalScrim} testID="venue-photo-modal">
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setExpanded(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss enlarged photo"
            />
            <ThemedView
              lightColor={SKY_SURFACE.card}
              darkColor={SKY_SURFACE.card}
              style={styles.modalCard}
              accessibilityRole="summary">
              <ScrollView
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}>
                <ThemedText type="subtitle">{photo.venue}</ThemedText>
                <Image
                  source={photo.file}
                  style={styles.expandedImage}
                  contentFit="contain"
                  transition={0}
                  onError={() => setImageError(true)}
                  accessibilityLabel={`Enlarged photo of ${photo.venue}`}
                />
                <Muted testID="venue-photo-modal-credit">{`Photo credit: ${photo.credit} · ${photo.license}`}</Muted>
                <View style={styles.modalActions}>
                  {sourcePageUrl ? (
                    <Chip
                      label="Photo source"
                      selected={false}
                      accessibilityLabel={`Photo source for ${photo.venue}`}
                      onPress={() => {
                        Linking.openURL(sourcePageUrl).catch(() => {});
                      }}
                    />
                  ) : null}
                  <Chip
                    label="Venue website"
                    selected={false}
                    accessibilityLabel={`Photo of ${photo.venue}. Opens the venue website.`}
                    onPress={() => {
                      Linking.openURL(website).catch(() => {});
                    }}
                  />
                  <Chip
                    label="Close photo"
                    selected={false}
                    accessibilityLabel="Close enlarged photo"
                    onPress={() => setExpanded(false)}
                  />
                </View>
              </ScrollView>
            </ThemedView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 4 },
  image: {
    width: VENUE_PHOTO_WIDTH,
    maxWidth: '100%',
    height: VENUE_PHOTO_HEIGHT,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 13, 30, 0.08)',
  },
  fallbackBox: {
    width: VENUE_PHOTO_WIDTH,
    maxWidth: '100%',
    minHeight: 72,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 13, 30, 0.08)',
  },
  modalScrim: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(11, 13, 30, 0.78)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  modalScrollContent: {
    gap: 10,
  },
  expandedImage: {
    width: VENUE_PHOTO_EXPANDED_WIDTH,
    maxWidth: '100%',
    height: VENUE_PHOTO_EXPANDED_HEIGHT,
    maxHeight: 380,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 13, 30, 0.2)',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
