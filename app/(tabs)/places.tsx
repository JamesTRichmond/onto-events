import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SkyAppearance } from '@/components/sky/appearance';
import { SkyBackdrop } from '@/components/sky/sky-backdrop';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip, EmptyState, Muted, Wordmark } from '@/components/ui';
import { PlaceDetails } from '@/components/ui/place-details';
import { PLACE_FILTERS } from '@/data/spots';
import { LocationControls } from '@/components/ui/location-controls';
import { useMapsApp } from '@/hooks/use-maps-app';
import { useSky } from '@/hooks/use-sky';
import { useTierMode } from '@/hooks/use-tier-mode';
import { useSelectedLocation } from '@/hooks/use-selected-location';
import { useNow } from '@/hooks/use-now';
import { useWeather } from '@/hooks/use-weather';
import { currentConditions } from '@/lib/weather/nws';
import { skyKind } from '@/lib/weather/condition';
import { placeSky } from '@/lib/place-sky';
import { travelLabel } from '@/lib/card-actions';
import { directionsFor } from '@/lib/maps-choice';
import { SKY_SURFACE } from '@/lib/sky/palette';
import {
  buildPlacesFeed,
  type PlaceFilter,
  type PlaceSort,
  type RankedPlace,
} from '@/lib/spot-feed';

const SORTS: { id: PlaceSort; label: string }[] = [
  { id: 'open', label: 'Best now' },
  { id: 'nearest', label: 'Nearest' },
  { id: 'sky', label: 'Featured' },
];

const RADIUS_MI = 15;

export default function PlacesScreen() {
  const { resolved, city } = useSelectedLocation();
  const origin = resolved.origin;
  const location = origin ?? city.anchor;
  const { mode } = useTierMode();
  const maps = useMapsApp();
  const now = useNow();
  const timeZone = origin?.timeZone ?? city.timeZone;
  const placeId = origin ? `${origin.source}:${origin.serviceRegion}` : 'unavailable';
  const report = useWeather(location.lat, location.lng, now, origin !== null);
  const observation = now === null ? null : currentConditions(report.report, now);
  const kind = observation ? skyKind(observation.word, observation.description) : null;
  const liveWeather = useMemo(() => observation && kind
    ? { kind, observedAt: observation.observedAt, placeId } : null, [observation, kind, placeId]);
  const sky = useSky({
    now, latitude: location.lat, longitude: location.lng, timeZone, placeId, weather: liveWeather,
  });
  const [filter, setFilter] = useState<PlaceFilter>('all');
  const [sort, setSort] = useState<PlaceSort>('open');
  const [open, setOpen] = useState<RankedPlace | null>(null);
  const [changingLocation, setChangingLocation] = useState(false);
  useEffect(() => setOpen(null), [origin]);

  const weather = useMemo(
    () => origin && now !== null ? placeSky(now, origin, observation) : null,
    [origin, now, observation],
  );

  const feed = useMemo(() => {
    if (!origin || !weather || now === null) return null;
    return buildPlacesFeed({
      now: new Date(now),
      origin,
      timeZone,
      radiusMi: RADIUS_MI,
      sort,
      mode,
      placeKind: filter,
      weather,
    });
  }, [origin, now, timeZone, sort, mode, filter, weather]);

  const nearby = feed?.nearby ?? [];
  const farther = feed?.farther ?? [];
  const rows = [
    ...nearby.map((item) => ({ ...item, group: 'near' as const })),
    ...farther.map((item) => ({ ...item, group: 'far' as const })),
  ];
  const empty = rows.length === 0;

  const openDirections = (item: RankedPlace) => {
    const url = directionsFor(maps.app, item.spot.lat, item.spot.lng, item.spot.venue);
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SkyAppearance.Provider value>
      <View style={styles.container}>
        <SkyBackdrop
          sky={sky.sky}
          moon={sky.astronomy?.moon ?? null}
          seed={sky.seed}
          reduceMotion={sky.reduceMotion}
          active={sky.active}
        />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <FlatList
            data={rows}
            keyExtractor={(item) => item.spot.id}
            initialNumToRender={30}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                <Wordmark />
                <Muted>Evergreen · on because the land is there.</Muted>
                <Muted testID="places-location">{origin ? origin.source === 'city' ? `Places around ${origin.label}` : origin.source === 'pin' ? 'Places around your pin' : 'Places around your location' : resolved.status === 'loading' ? 'Finding your location' : 'Choose a location'}</Muted>
                {feed ? <Muted>{feed.clock.shortLabel} · up to {RADIUS_MI} mi</Muted> : null}
                {origin?.source === 'city' ? <Muted>{city.anchor.name} · approximate city point.</Muted> : null}
                <View style={styles.row}><Chip size="compact" label="Change location" selected={changingLocation}
                  onPress={() => setChangingLocation(value => !value)} /></View>
                {changingLocation || !origin ? <LocationControls onChoose={() => setChangingLocation(false)} /> : null}
                {resolved.status === 'unavailable' ? <Muted accessibilityLiveRegion="polite">Your location is unavailable. Choose location or change city.</Muted> : null}
                {resolved.status === 'unsupported' ? <Muted accessibilityLiveRegion="polite">onto is not available in this area yet. Choose location or change city.</Muted> : null}
                <View style={styles.row}>
                  {PLACE_FILTERS.map((chip) => (
                    <Chip
                      key={chip.id}
                      label={chip.label}
                      selected={filter === chip.id}
                      onPress={() => setFilter(chip.id)}
                    />
                  ))}
                </View>
                <View style={styles.row}>
                  {SORTS.map((chip) => (
                    <Chip
                      key={chip.id}
                      label={chip.label}
                      selected={sort === chip.id}
                      onPress={() => setSort(chip.id)}
                    />
                  ))}
                </View>
              </View>
            }
            ListEmptyComponent={
              empty && origin && now !== null ? (
                <EmptyState
                  title="No places in these filters yet."
                  hint="Try another kind of place or change your location."
                />
              ) : null
            }
            renderItem={({ item, index }) => (
              <View style={styles.cardWrap}>
                {item.group === 'far' && (index === 0 || rows[index - 1].group === 'near') ? (
                  <Muted>Farther · still worth the drive</Muted>
                ) : null}
                <Pressable
                  onPress={() => setOpen(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Details: ${item.spot.title}`}>
                  <ThemedView lightColor={SKY_SURFACE.card} darkColor={SKY_SURFACE.card} style={styles.card}>
                    <Muted>{item.spot.placeKind.toUpperCase()} · {item.line}</Muted>
                    <ThemedText type="subtitle">{item.spot.title}</ThemedText>
                    <Muted>{item.spot.venue} · {item.spot.area}</Muted>
                    <Muted>{travelLabel(item.miles)}</Muted>
                    <Muted numberOfLines={2}>{item.spot.short}</Muted>
                    {item.spot.sourceName ? <Muted>via {item.spot.sourceName}</Muted> : null}
                  </ThemedView>
                </Pressable>
              </View>
            )}
          />
        </SafeAreaView>
        <PlaceDetails item={open?.spot.serviceRegion === origin?.serviceRegion ? open : null} onClose={() => setOpen(null)} onDirections={openDirections} />
      </View>
    </SkyAppearance.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SKY_SURFACE.background },
  safe: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  header: { gap: 8, marginTop: 16, padding: 16, borderRadius: 20, backgroundColor: SKY_SURFACE.card },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardWrap: { gap: 8 },
  card: { borderRadius: 16, padding: 16, gap: 4 },
});
