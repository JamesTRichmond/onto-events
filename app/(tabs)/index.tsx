import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ActivityCard, Chip, EmptyState, Muted, Wordmark } from '@/components/ui';
import { SkyAppearance } from '@/components/sky/appearance';
import { SkyBackdrop } from '@/components/sky/sky-backdrop';
import { ALL_CATEGORIES } from '@/data/activities';
import { isTicketSeller } from '@/data/source-trust';
import { BUNDLED_ACTIVITIES, BUNDLED_REGION_GENERATED_AT } from '@/data/bundled-activities';
import { GENERATED_AT } from '@/data/live-events';
import { LOCAL_GENERATED_AT } from '@/data/local-events';
import { useAffinities } from '@/hooks/use-affinities';
import { useAppFontStyle } from '@/hooks/use-app-fonts';
import { useDiscoveryPreferences } from '@/hooks/use-discovery-preferences';
import { useEventCatalog } from '@/hooks/use-event-catalog';
import { useInterests } from '@/hooks/use-interests';
import { GoingScope, useGoing } from '@/hooks/use-going';
import { useSelectedLocation } from '@/hooks/use-selected-location';
import { useNow } from '@/hooks/use-now';
import { useTicketSellers } from '@/hooks/use-ticket-sellers';
import { useTierMode } from '@/hooks/use-tier-mode';
import { useSky } from '@/hooks/use-sky';
import { useWeather } from '@/hooks/use-weather';
import { skyKind } from '@/lib/weather/condition';
import { currentConditions } from '@/lib/weather/nws';
import { SKY_SURFACE } from '@/lib/sky/palette';
import { sectionFeed } from '@/lib/sky/feed-section';
import { useOntoBackend } from '@/lib/backend/context';
import { escalateDuplicateRatings } from '@/lib/duplicates';
import { buildFeed, EmptyReason } from '@/lib/feed';
import {
  DEFAULT_DATE_FILTER,
  localDateKey,
  parseCustomDateRange,
  resolveDateFilterRange,
  type DateFilter,
} from '@/lib/date-filter';
import { StockFreshness } from '@/lib/stock-freshness';
import { EMPTY_FEED_LINE } from '@/lib/copy';
import { RADIUS_OPTIONS, parseRadius } from '@/lib/discovery-preferences';
import { LocationControls, markFirstRunLocationSeen } from '@/components/ui/location-controls';
import { getItem, onOntoDataErased, STORAGE_KEYS } from '@/lib/storage';
import { TrashIcon, WalkerIcon } from '@/components/ui/sort-icons';
import { SwipeCard, type SortKind } from '@/components/ui/swipe-card';
import { useDeck } from '@/hooks/use-deck';
import { passedInFeed, maybesInFeed, sortedFeed } from '@/lib/deck';
import type { FeedItem } from '@/lib/feed';
import { LocationRemedy, WidenRemedy } from '@/components/ui/empty-remedies';
import { nextRadiusWithEvents } from '@/lib/widen-radius';
import { TAB_TITLES } from '@/lib/tab-titles';

const MAX_CONTENT_WIDTH = 640;
/**
 * The closed screen is the wordmark, the tagline, and the chevron
 * (James, 2026-10-04). Sort, place, distance, search and interests live inside
 * feed options (search/interests restored by James, 2026-10-28). Mode stays
 * in Account. A fresh install looks 1 mile out, soonest first; wait for saved
 * preferences before painting cards.
 */
/** The last sort, held so the snackbar can take it back. Memory only. */
type LastSort = { item: FeedItem; kind: SortKind; home: 'feed' | 'maybes' };
// Long enough to read one line and reach Undo; short enough not to linger.
const UNDO_MS = 6000;
const EMPTY_STATE_COPY: Record<Exclude<EmptyReason, 'none'>, { title: string; hint: string }> = {
  'out-of-range': {
    title: 'Nothing in range.',
    hint: 'Open feed options and widen the distance or choose another place.',
  },
  'hidden-by-mode': {
    title: 'Nothing in this mode nearby.',
    hint: 'What is around right now lives in another tier — switch modes in Account.',
  },
  'no-interest': {
    title: 'Nothing in your interests nearby.',
    hint: 'Open feed options to change Interests, or search for an event.',
  },
  'no-match': {
    title: 'No matches for these filters.',
    hint: 'Clear the search or adjust feed options.',
  },
  'no-data': {
    title: EMPTY_FEED_LINE,
    hint: 'Try downtown.',
  },
};

export default function FeedScreen() {
  return <GoingScope><FeedScreenContent /></GoingScope>;
}

function FeedScreenContent() {
  const { radiusMi, sort, chooseRadius, chooseSort, loaded: prefsReady } = useDiscoveryPreferences();
  const { interests, toggle: toggleInterest, loaded: interestsReady } = useInterests();
  const [query, setQuery] = useState('');
  const inputFont = useAppFontStyle('500');
  const [customRadius, setCustomRadius] = useState('');
  const [showCustomRadius, setShowCustomRadius] = useState(false);
  const [radiusError, setRadiusError] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [dateError, setDateError] = useState('');
  const [seeingMaybes, setSeeingMaybes] = useState(false);
  // On first open only, the dropdown starts open so location is obvious
  // (James, 2026-10-17); once seen or closed, subsequent opens start closed.
  const [dashOpen, setDashOpen] = useState(false);
  const dashTouched = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getItem(STORAGE_KEYS.firstRunLocationSeen),
      getItem(STORAGE_KEYS.locationChoice),
      getItem(STORAGE_KEYS.legacyLocationChoice),
    ]).then(([seen, savedChoice, legacy]) => {
      if (cancelled || dashTouched.current) return;
      if (seen === null && savedChoice === null && legacy === null) {
        setDashOpen(true);
      }
    });
    const unsubscribeErase = onOntoDataErased(() => {
      dashTouched.current = false;
      setQuery('');
      setDateFilter(DEFAULT_DATE_FILTER);
      setShowCustomDates(false);
      setDateError('');
      setCustomStartDate('');
      setCustomEndDate('');
      setCustomStartTime('');
      setCustomEndTime('');
      if (!cancelled) setDashOpen(true);
    });
    return () => {
      cancelled = true;
      unsubscribeErase();
    };
  }, []);
  // Freshness is for the curious, not the default view: a tap on the
  // wordmark shows when the feed last updated.
  const [showFreshness, setShowFreshness] = useState(false);
  const [lastSort, setLastSort] = useState<LastSort | null>(null);
  useEffect(() => {
    if (!lastSort) return;
    const timer = setTimeout(() => setLastSort(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [lastSort]);

  const { catalogBackend } = useOntoBackend();
  const { city, resolved } = useSelectedLocation();
  const origin = resolved.origin;
  // Public city points only provide a neutral sky while an origin is pending.
  // No catalog or weather request runs until the selected origin is eligible.
  const location = origin ?? city.anchor;
  const catalogRegion = origin?.serviceRegion;
  const catalog = useEventCatalog(catalogBackend, BUNDLED_ACTIVITIES, catalogRegion, origin !== null);
  const now = useNow();
  const feedTimeZone = origin?.timeZone ?? city.timeZone;
  const skyPlaceId = origin ? `${origin.source}:${origin.serviceRegion}` : 'unavailable';
  // Weather for where the feed looks, asked by grid cell (lib/weather/cell.ts).
  // The strip is gone from the dashboard; the sky itself is the display.
  const weather = useWeather(location.lat, location.lng, now, origin !== null);
  const liveNow = now === null ? null : currentConditions(weather.report, now);
  const liveKind = liveNow ? skyKind(liveNow.word, liveNow.description) : null;
  const liveSkyWeather = useMemo(
    () => (liveNow && liveKind ? { placeId: skyPlaceId, observedAt: liveNow.observedAt, kind: liveKind } : null),
    [liveNow, liveKind, skyPlaceId],
  );
  const sky = useSky({
    now,
    latitude: location.lat,
    longitude: location.lng,
    timeZone: feedTimeZone,
    placeId: skyPlaceId,
    override: null,
    weather: liveSkyWeather,
  });
  const { mode } = useTierMode();
  const { joinedIds, records: goingRecords, togglePlan, observeCatalog, loaded: joinedReady, syncing, syncError } = useGoing();
  const goingSnapshots = useMemo(() => Object.values(goingRecords).map(plan => plan.event), [goingRecords]);
  const { weights: affinities, record: recordAffinity } = useAffinities();
  const deck = useDeck();
  const { shown: ticketSellersShown, loaded: ticketSellersReady } = useTicketSellers();
  // Two calendars can list one happening (lib/duplicates.ts). Every copy
  // first takes the strictest rating any source gave it; buildFeed then
  // collapses each happening to one card among what its filters kept.
  // Free and local first (James, 2026-10-07): ticket sellers are dropped after
  // that escalation unless turned on in Account. A plan marked Going stays.
  const ratedActivities = useMemo(() => escalateDuplicateRatings(catalog.activities), [catalog.activities]);
  useEffect(() => { if (joinedReady) observeCatalog(ratedActivities); }, [joinedReady, observeCatalog, ratedActivities]);
  const activities = useMemo(() => ticketSellersShown ? ratedActivities
    : ratedActivities.filter((a) => !isTicketSeller(a) || joinedIds.has(a.id)), [ratedActivities, ticketSellersShown, joinedIds]);
  // Wait for saved choices so an unfiltered feed never flashes before interests.
  const feedReady = prefsReady && interestsReady && ticketSellersReady && origin !== null
    && joinedReady;
  const activeDateRange = useMemo(
    () => resolveDateFilterRange(dateFilter, now, feedTimeZone),
    [dateFilter, now, feedTimeZone],
  );
  const clearDateFilter = () => {
    setDateFilter(DEFAULT_DATE_FILTER);
    setShowCustomDates(false);
    setDateError('');
  };

  // One input for the feed and for the widen count below, so the number on
  // "Widen to 5 mi · N events" can never drift from what the feed shows.
  const feedInput = useMemo(
    () => ({
        now,
        lat: location.lat,
        lng: location.lng,
        radiusMi,
        sort,
        mode,
        interests,
        query,
        affinities,
        goingIds: joinedIds,
        goingSnapshots,
        timeZone: feedTimeZone,
        dateFilter,
      }),
    [now, radiusMi, sort, mode, interests, query, affinities, location.lat, location.lng, joinedIds, goingSnapshots, feedTimeZone, dateFilter]
  );
  const { items: feed, emptyReason, nowCount } = useMemo(
    () => buildFeed(activities, feedInput),
    [activities, feedInput]
  );

  // What swiping has not sorted away yet. Plans you're Going to always stay.
  const unsorted = useMemo(
    () => sortedFeed(feed, deck.lists, joinedIds),
    [feed, deck.lists, joinedIds]
  );
  const savedMaybes = useMemo(() => maybesInFeed(feed, deck.lists), [feed, deck.lists]);
  const passedHere = useMemo(() => passedInFeed(feed, deck.lists), [feed, deck.lists]);
  const shown = seeingMaybes ? savedMaybes : unsorted;
  const { items: visibleFeed, labels: sectionLabels } = sectionFeed(shown, now, feedTimeZone, {
    quiet: nowCount === 0,
    groupByTime: false,
  });

  // Offline, the older of the two bundled snapshots, so freshness never overclaims.
  const bakeAt = catalog.updatedAt ?? (catalogRegion ? BUNDLED_REGION_GENERATED_AT?.[catalogRegion] : undefined)
    ?? (GENERATED_AT < LOCAL_GENERATED_AT ? GENERATED_AT : LOCAL_GENERATED_AT);
  const lastRefreshed = StockFreshness.lastRefreshedLabel(bakeAt, now);
  const tipStale = StockFreshness.tipStaleBanner(bakeAt, now);

  const toggleJoinFor = (item: FeedItem) => {
    // Committing is the strongest taste signal (join only, not unjoin).
    if (!joinedIds.has(item.id)) recordAffinity(item.category, 'join');
    togglePlan(item);
  };
  const sortCard = (item: FeedItem, kind: SortKind, home: LastSort['home'] = 'feed') => {
    if (kind === 'pass') deck.pass(item.id);
    else deck.keepMaybe(item.id);
    recordAffinity(item.category, kind);
    setLastSort({ item, kind, home });
  };
  const undoSort = () => {
    if (!lastSort) return;
    const { item, kind, home } = lastSort;
    if (kind === 'pass') {
      if (home === 'maybes') deck.returnToMaybe(item.id);
      else deck.restore([item.id]);
    } else deck.dropMaybe(item.id);
    recordAffinity(item.category, kind, -1);
    setLastSort(null);
  };
  const sortedEverything = emptyReason === 'none' && feed.length > 0 && visibleFeed.length === 0;
  // Only an out-of-range feed pays for the wider counts (#434). The count is
  // what the feed would show there: same input, minus cards already swiped.
  const widen = useMemo(
    () => (!feedReady || seeingMaybes || emptyReason !== 'out-of-range' ? null
      : nextRadiusWithEvents(radiusMi, RADIUS_OPTIONS, (mi) =>
        sortedFeed(buildFeed(activities, { ...feedInput, radiusMi: mi }).items, deck.lists, joinedIds).length)),
    [feedReady, seeingMaybes, emptyReason, radiusMi, activities, feedInput, deck.lists, joinedIds]
  );
  const noLocation = resolved.status === 'unavailable' || resolved.status === 'unsupported';

  const header = (
    <View>
      {/* First screen remains minimal; V2 options live inside the accordion. */}
      <View style={styles.header} testID="dashboard">
        <View style={styles.titleRow}>
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              setShowFreshness((v) => !v);
            }}
            testID="wordmark-button"
            accessibilityRole="button"
            accessibilityLabel="onto"
            accessibilityHint="Shows when the feed last updated.">
            <Wordmark />
          </Pressable>
          <Pressable
            onPress={() => {
              dashTouched.current = true;
              if (dashOpen) markFirstRunLocationSeen();
              setDashOpen((open) => !open);
            }}
            testID="dash-toggle"
            accessibilityRole="button"
            accessibilityLabel={dashOpen ? 'Close feed options' : 'Open feed options'}
            accessibilityHint="Choose a sort, place, distance, search or interests."
            accessibilityState={{ expanded: dashOpen }}
            hitSlop={12}
            style={styles.dashToggle}>
            <ThemedText
              type="defaultSemiBold"
              lightColor={SKY_SURFACE.secondary}
              darkColor={SKY_SURFACE.secondary}
              style={styles.toggleIndicator}>
              {dashOpen ? 'Close ▴' : 'Filters & City ▾'}
            </ThemedText>
          </Pressable>
        </View>
        <Pressable
          onPress={() => {
            dashTouched.current = true;
            if (dashOpen) markFirstRunLocationSeen();
            setDashOpen((open) => !open);
          }}
          // Tap target only: the labeled dash-toggle is the one accessible control,
          // so screen readers and label queries never meet two identical buttons.
          style={styles.taglinePressable}>
          <Muted testID="tagline">things to do near you</Muted>
        </Pressable>
        {dashOpen ? (
          <View style={styles.options} testID="feed-controls">
            <Muted>Search</Muted>
            <TextInput value={query} onChangeText={setQuery}
              accessibilityLabel="Search events" placeholder="Search events"
              placeholderTextColor={SKY_SURFACE.secondary} autoCapitalize="none"
              autoCorrect={false} returnKeyType="search"
              style={[styles.searchInput, inputFont]} />
            {query.length > 0 ? <View style={styles.chipRow}>
              <Chip size="compact" label="Clear search" selected={false} onPress={() => setQuery('')} />
            </View> : null}
            <Muted>Interests</Muted>
            <Muted>Choose categories to narrow the feed. Search looks beyond interests.</Muted>
            <View style={styles.chipRow} testID="interest-controls">
              <Chip size="compact" label="All interests" selected={interests.size === 0}
                onPress={() => interests.forEach(toggleInterest)} />
              {ALL_CATEGORIES.map((category) => <Chip key={category} size="compact"
                label={category} selected={interests.has(category)}
                onPress={() => toggleInterest(category)} />)}
            </View>
            <Muted>Sort changes order.</Muted>
            <View style={styles.chipRow}>
            <Chip size="compact" label="closest" selected={sort === 'nearest'}
              onPress={() => chooseSort('nearest')}
              accessibilityHint="Nearest events first." />
            <Chip size="compact" label="soonest" selected={sort === 'soonest'}
              onPress={() => chooseSort('soonest')}
              accessibilityHint="Events starting soonest first." />
          </View>
          <LocationControls />
          <Muted>Distance changes reach.</Muted>
          <View style={styles.chipRow} testID="radius-controls">
            {RADIUS_OPTIONS.map((mi) => <Chip key={mi} size="compact" label={`${mi} mi`} accessibilityLabel={`${mi} ${mi === 1 ? 'mile' : 'miles'}`} selected={radiusMi === mi} onPress={() => { chooseRadius(mi); setShowCustomRadius(false); setRadiusError(''); }} />)}
            <Chip size="compact" label="Custom" selected={showCustomRadius || !(RADIUS_OPTIONS as readonly number[]).includes(radiusMi)} onPress={() => { setCustomRadius(String(radiusMi)); setShowCustomRadius((value) => !value); }} />
          </View>
          {showCustomRadius ? <View style={styles.options}>
            <TextInput value={customRadius} onChangeText={setCustomRadius} keyboardType="decimal-pad" accessibilityLabel="Custom distance in miles" placeholder="1–100 miles" placeholderTextColor={SKY_SURFACE.secondary} style={[styles.searchInput, inputFont]} />
            <Chip size="compact" label="Apply distance" selected={false} onPress={() => {
              const mi = parseRadius(customRadius);
              if (mi === null) { setRadiusError('Enter a distance from 1 to 100 miles.'); return; }
              chooseRadius(mi); setRadiusError(''); setShowCustomRadius(false);
            }} />
            {radiusError ? <ThemedText accessibilityRole="alert">{radiusError}</ThemedText> : null}
          </View> : null}
          <Muted>{`Date/time changes Discover. Your saved plans live in ${TAB_TITLES.going}.`}</Muted>
          <View style={styles.chipRow} testID="date-controls">
            <Chip size="compact" label="Any time" selected={dateFilter.preset === 'any' && !showCustomDates} onPress={clearDateFilter} />
            <Chip size="compact" label="Today" selected={dateFilter.preset === 'today'} onPress={() => { setDateFilter({ preset: 'today' }); setShowCustomDates(false); setDateError(''); }} />
            <Chip size="compact" label="Tomorrow" selected={dateFilter.preset === 'tomorrow'} onPress={() => { setDateFilter({ preset: 'tomorrow' }); setShowCustomDates(false); setDateError(''); }} />
            <Chip size="compact" label="This weekend" selected={dateFilter.preset === 'weekend'} onPress={() => { setDateFilter({ preset: 'weekend' }); setShowCustomDates(false); setDateError(''); }} />
            <Chip size="compact" label="Pick dates" selected={showCustomDates || dateFilter.preset === 'custom'} onPress={() => {
              const todayKey = now !== null ? localDateKey(now, feedTimeZone) : '';
              if (!customStartDate && todayKey) setCustomStartDate(todayKey);
              setShowCustomDates((value) => !value);
              setDateError('');
            }} />
            {dateFilter.preset !== 'any' ? (
              <Chip size="compact" label="Clear dates" accessibilityLabel="Clear date filter" selected={false} onPress={clearDateFilter} />
            ) : null}
          </View>
          {showCustomDates ? (
            <View style={styles.options} testID="custom-date-inputs">
              <Muted>{`Dates and optional 24-hour times in ${feedTimeZone}. End time is exclusive; leave times blank for whole days.`}</Muted>
              <TextInput
                value={customStartDate}
                onChangeText={setCustomStartDate}
                accessibilityLabel="Start date (YYYY-MM-DD)"
                placeholder="Start date (YYYY-MM-DD)"
                placeholderTextColor={SKY_SURFACE.secondary}
                style={[styles.searchInput, inputFont]}
              />
              <TextInput
                value={customEndDate}
                onChangeText={setCustomEndDate}
                accessibilityLabel="End date (YYYY-MM-DD, optional)"
                placeholder="End date (YYYY-MM-DD, optional)"
                placeholderTextColor={SKY_SURFACE.secondary}
                style={[styles.searchInput, inputFont]}
              />
              <TextInput value={customStartTime} onChangeText={setCustomStartTime}
                accessibilityLabel="Start time (HH:MM, optional)" placeholder="Start time (HH:MM, optional)"
                placeholderTextColor={SKY_SURFACE.secondary} style={[styles.searchInput, inputFont]} />
              <TextInput value={customEndTime} onChangeText={setCustomEndTime}
                accessibilityLabel="End time (HH:MM, optional)" placeholder="End time (HH:MM, optional)"
                placeholderTextColor={SKY_SURFACE.secondary} style={[styles.searchInput, inputFont]} />
              <Chip
                size="compact"
                label="Apply dates"
                selected={false}
                onPress={() => {
                  const todayKey = now !== null ? localDateKey(now, feedTimeZone) : '1970-01-01';
                  const parsed = parseCustomDateRange(customStartDate, customEndDate, todayKey, customStartTime, customEndTime, feedTimeZone);
                  if (!parsed.ok) {
                    setDateError(parsed.error);
                    return;
                  }
                  setDateFilter({
                    preset: 'custom',
                    startDate: parsed.startDate,
                    endDate: parsed.endDate,
                    startTime: parsed.startTime,
                    endTime: parsed.endTime,
                  });
                  setDateError('');
                  setShowCustomDates(false);
                }}
              />
              {dateError ? <ThemedText accessibilityRole="alert">{dateError}</ThemedText> : null}
            </View>
          ) : null}
          </View>
        ) : null}
      </View>
      {/* Status lines live under the dashboard, not in it. */}
      <View style={[styles.statusBlock, (dashOpen || activeDateRange !== null || resolved.status === 'unavailable' || resolved.status === 'unsupported' || showFreshness || catalog.error || syncing || syncError || savedMaybes.length > 0 || seeingMaybes) ? { backgroundColor: SKY_SURFACE.card, borderRadius: 12, padding: 10 } : null]}>
        {dashOpen ? (
          <Muted testID="search-place">{origin ? `Searching ${origin.label}` : resolved.status === 'loading' ? 'Finding your location' : 'Choose a search location'} · within {radiusMi} {radiusMi === 1 ? 'mile' : 'miles'}</Muted>
        ) : null}
        {activeDateRange ? (
          <View style={styles.chipRow} testID="active-date-filter">
            <Muted>{`${origin ? `${origin.label} · ` : ''}${activeDateRange.label} · ${feedTimeZone}`}</Muted>
            <Chip size="compact" label="Clear dates" accessibilityLabel="Clear active date filter" selected={false} onPress={clearDateFilter} />
          </View>
        ) : null}
        {origin?.source === 'city' && dashOpen ? <Muted>{city.anchor.name} · approximate city point.</Muted> : null}
        {resolved.status === 'unavailable' ? <Muted accessibilityLiveRegion="polite">Your location is unavailable. Choose location or change city.</Muted> : null}
        {resolved.status === 'unsupported' ? <Muted accessibilityLiveRegion="polite">onto is not available in this area yet. Choose location or change city.</Muted> : null}
        {showFreshness && lastRefreshed ? (
          <Muted testID="discover-last-refreshed" accessibilityLabel={lastRefreshed}>
            {lastRefreshed}
          </Muted>
        ) : null}
        {showFreshness && tipStale ? <Muted>{tipStale}</Muted> : null}
        {/* Saved events show first on every launch while the fetch runs; only a
            failed fetch makes that "offline" (build 9 said so on a good launch). */}
        {catalog.source === 'cache' && catalog.error ? (
          <Muted>Offline — showing saved events.</Muted>
        ) : null}
        {catalog.error && catalog.source === 'bundled' ? (
          <Muted>
            {catalogRegion !== 'utah'
              ? 'Live updates are offline.'
              : 'Live updates are offline — showing the built-in Salt Lake City guide.'}
          </Muted>
        ) : null}
        {syncing ? <Muted>Saving your plans…</Muted> : null}
        {syncError ? <Muted>Your plan is saved here; cloud sync is offline.</Muted> : null}
        {savedMaybes.length > 0 || seeingMaybes ? (
          <View style={styles.footerRow}>
            <Chip size="compact" label={seeingMaybes ? 'Back to the feed' : `Maybes (${savedMaybes.length})`}
              selected={seeingMaybes} onPress={() => setSeeingMaybes((value) => !value)}
              accessibilityHint={seeingMaybes ? 'Returns to the events you have not sorted.' : 'Opens the events you swiped right.'} />
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <SkyAppearance.Provider value>
    <GestureHandlerRootView style={styles.container}>
      <SkyBackdrop sky={sky.sky} moon={sky.astronomy?.moon ?? null}
        seed={sky.seed} reduceMotion={sky.reduceMotion} active={sky.active} />
      <SafeAreaView edges={['top']} style={styles.statusScrim}
        pointerEvents="none" accessible={false} accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" testID="sky-status-scrim" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={feedReady ? visibleFeed : []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          ListEmptyComponent={
            !feedReady ? (noLocation ? (
              <EmptyState
                title="Where should onto look?"
                hint={resolved.status === 'unsupported' ? 'onto is not in this area yet.' : 'Your location is not available.'}>
                <LocationRemedy />
              </EmptyState>
            ) : null) : seeingMaybes && visibleFeed.length === 0 ? (
              <EmptyState title="No Maybes saved in these filters." hint="Change filters or swipe a card right to keep one." />
            ) : sortedEverything ? (
              <EmptyState
                title="That's everything here."
                hint="Every card has a yes or a no."
              />
            ) : emptyReason === 'none' ? null : (
              <EmptyState
                title={EMPTY_STATE_COPY[emptyReason].title}
                hint={
                  emptyReason === 'no-data' && catalog.error && catalog.source !== 'cloud'
                    ? 'Live updates are offline. Pull down to try again.'
                    : EMPTY_STATE_COPY[emptyReason].hint
                }>
                {emptyReason === 'out-of-range' && widen ? <WidenRemedy suggestion={widen} onWiden={chooseRadius} /> : null}
              </EmptyState>
            )
          }
          ListFooterComponent={
            feedReady && passedHere.length > 0 ? (
              <View style={styles.footerRow}>
                <Chip size="compact"
                  label={`Bring back tossed (${passedHere.length})`}
                  selected={false}
                  onPress={() => { setLastSort(null); deck.bringBack(passedHere); }}
                  accessibilityHint="Puts tossed cards back. A toss from Maybes returns to Maybes."
                />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={catalog.loading}
              onRefresh={catalog.refresh}
              tintColor={SKY_SURFACE.text}
            />
          }
          renderItem={({ item, index }) => (
            <View style={{ gap: 8 }}>
            {sectionLabels[index] && sectionLabels[index] !== sectionLabels[index - 1] ? (
              <View style={styles.sectionLabel}>
                <ThemedText type="defaultSemiBold">{sectionLabels[index]}</ThemedText>
              </View>
            ) : null}
            {joinedIds.has(item.id) || !deck.loaded ? (
              // Going is the strongest yes: a plan is not sorted by swipe.
              // Until the saved sorts have loaded, no card is a swipe target
              // (it may already be sorted away).
              <ActivityCard
                item={item}
                mode={mode}
                joined={joinedIds.has(item.id)}
                onToggleJoin={() => toggleJoinFor(item)}
                onAction={() => recordAffinity(item.category, 'action')}
                byDistance={sort === 'nearest'}
              />
            ) : (
              <SwipeCard
                key={item.id}
                item={item}
                mode={mode}
                joined={joinedIds.has(item.id)}
                onToggleJoin={() => toggleJoinFor(item)}
                onAction={() => recordAffinity(item.category, 'action')}
                byDistance={sort === 'nearest'}
                onPass={() => sortCard(item, 'pass', seeingMaybes ? 'maybes' : 'feed')}
                onMaybe={seeingMaybes ? undefined : () => sortCard(item, 'maybe', 'feed')}
                reduceMotion={sky.reduceMotion}
              />
            )}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
      {lastSort ? (
        <View style={styles.snackbar} testID="undo-snackbar" accessibilityLiveRegion="polite">
          {lastSort.kind === 'pass' ? <TrashIcon size={20} /> : <WalkerIcon size={20} />}
          <Muted numberOfLines={1} style={styles.snackText}>
            {lastSort.kind === 'pass' ? 'Tossed' : 'In Maybes'}: {lastSort.item.title}
          </Muted>
          <Pressable onPress={undoSort} accessibilityRole="button"
            accessibilityLabel={lastSort.kind === 'pass' ? 'Undo toss' : 'Undo maybe'}
            style={styles.undoButton}>
            <ThemedText type="defaultSemiBold" lightColor={SKY_SURFACE.link} darkColor={SKY_SURFACE.link}>Undo</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </GestureHandlerRootView>
    </SkyAppearance.Provider>
  );
}

const styles = StyleSheet.create({
  options: { gap: 8 },
  searchInput: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: SKY_SURFACE.border, borderRadius: 12, color: SKY_SURFACE.text },
  container: {
    flex: 1,
    backgroundColor: SKY_SURFACE.background,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
  },
  statusScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: SKY_SURFACE.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  // The masthead keeps the sky surface for its contrast floor (the day ramp
  // runs near white) but no border: it is where the app speaks, not a card.
  header: {
    gap: 8,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: SKY_SURFACE.card,
  },
  statusBlock: {
    gap: 4,
    paddingTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 4,
  },
  // Thumb zone: the one action a sort needs sits at the bottom, clear of
  // the corners (Hoober; Material's snackbar).
  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    maxWidth: MAX_CONTENT_WIDTH - 32,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SKY_SURFACE.border,
    backgroundColor: SKY_SURFACE.background,
  },
  snackText: {
    flex: 1,
  },
  undoButton: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    backgroundColor: SKY_SURFACE.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  taglinePressable: {
    paddingVertical: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dashToggle: {
    flex: 1,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  toggleIndicator: {
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
});
