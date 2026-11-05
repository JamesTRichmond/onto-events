import { useCallback, useEffect, useState, useMemo } from 'react';
import { AppState } from 'react-native';
import { onPublicCatalogChanged, invalidatePublicCatalog } from '@/lib/catalog-refresh';

import type { Activity, ActivityCategory } from '@/data/activities';
import type {
  CatalogEvent,
  CatalogEventQuery,
  EventCatalogBackend,
} from '@/lib/backend/contracts';
import { regionForSpot } from '@/lib/service-region';
import {
  getItem,
  setItem,
  STORAGE_KEYS,
  STORAGE_PREFIXES,
} from '@/lib/storage';
import { matureContentEnabled } from '@/lib/tiers';
import { readEventFacts } from '@/lib/event-facts';
import { isRestrictedListing } from '@/lib/event-availability';

export type CatalogSource = 'cloud' | 'cache' | 'bundled';

type CachedCatalog = {
  items: CatalogEvent[];
  updatedAt: string | null;
};

export interface EventCatalogState {
  activities: Activity[];
  source: CatalogSource;
  updatedAt: string | null;
  loading: boolean;
  error: Error | null;
  refresh(): void;
}

function parseCache(raw: string | null): CachedCatalog | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

function whenLabel(startsAt: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 'Date to be confirmed';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function catalogEventToActivity(event: CatalogEvent): Activity | null {
  if (event.isCancelled || isRestrictedListing(event.title, event.description))
    return null;
  if (event.latitude == null || event.longitude == null) return null;
  const facts = readEventFacts(event.eventFacts);
  return {
    ...(event.sourceName === 'onto community' && event.hosted
      ? { hosted: event.hosted }
      : {}),
    id: event.id,
    title: event.title,
    category: event.category as ActivityCategory,
    venue: event.venueName ?? 'Location to be confirmed',
    area: [event.locality, event.region].filter(Boolean).join(', ') || 'Nearby',
    lat: event.latitude,
    lng: event.longitude,
    whenLabel: whenLabel(event.startsAt),
    startsInMinutes: 0,
    startsAtIso: event.startsAt,
    ...(event.endsAt ? { endsAtIso: event.endsAt } : {}),
    description:
      event.description ?? 'Details are available from the event source.',
    attendees: 0,
    rating: event.rating,
    source: 'live',
    sourceName: event.sourceName,
    sourceEventId: event.sourceEventId,
    ...(Object.keys(facts).length ? { eventFacts: facts } : {}),
    ...(facts.admission ? { admission: facts.admission.value } : {}),
    ...(event.timezone ? { timezone: event.timezone } : {}),
    ...(event.sourceUrl ? { sourceUrl: event.sourceUrl } : {}),
  };
}

function toActivities(items: CatalogEvent[], serviceRegion?: CatalogEventQuery['serviceRegion']): Activity[] {
  return items
    .map(catalogEventToActivity)
    .filter((item): item is Activity => item !== null && (!serviceRegion || regionForSpot(item) === serviceRegion));
}

function newestEventTimestamp(items: CatalogEvent[]): string | null {
  let newest: string | null = null;
  for (const item of items) {
    const candidate = item.updatedAt || item.ingestedAt;
    if (!newest || Date.parse(candidate) > Date.parse(newest))
      newest = candidate;
  }
  return newest;
}

const CATALOG_PAGE_SIZE = 200;

async function loadAllEvents(
  backend: EventCatalogBackend,
  ratings: NonNullable<CatalogEventQuery['ratings']>,
  serviceRegion?: CatalogEventQuery['serviceRegion'],
  isCurrent: () => boolean = () => true,
): Promise<CatalogEvent[]> {
  const items: CatalogEvent[] = [];
  const requestedCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    if (cursor !== null) {
      if (requestedCursors.has(cursor)) {
        throw new Error('Catalog pagination returned a repeated cursor');
      }
      requestedCursors.add(cursor);
    }

    const page = await backend.listEvents({
      ratings,
      ...(serviceRegion ? { serviceRegion } : {}),
      limit: CATALOG_PAGE_SIZE,
      ...(cursor === null ? {} : { cursor }),
    });
    if (!isCurrent()) return [];
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);

  return items;
}

export function useEventCatalog(
  backend: EventCatalogBackend | null,
  bundled: Activity[],
  serviceRegion?: CatalogEventQuery['serviceRegion'],
  enabled = true,
): EventCatalogState {
  const scopedBundled = useMemo(
    () =>
      serviceRegion
        ? bundled.filter((item) => regionForSpot(item) === serviceRegion)
        : bundled,
    [bundled, serviceRegion],
  );
  const [regionInState, setRegionInState] = useState(serviceRegion);
  const [activities, setActivities] = useState<Activity[]>(scopedBundled);
  const [source, setSource] = useState<CatalogSource>('bundled');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(backend !== null);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!backend || !enabled) return;
    const unsubscribe = onPublicCatalogChanged(() => {
      // Hide potentially withdrawn community content while revalidating it.
      setActivities(previous => previous.filter(item => item.sourceName !== 'onto community'));
      setReload(value => value + 1);
    });
    const foreground = AppState.addEventListener('change', value => {
      if (value === 'active') invalidatePublicCatalog();
    });
    return () => { unsubscribe(); foreground.remove(); };
  }, [backend, enabled]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!enabled) { setLoading(false); return; }

    (async () => {
      let cached = parseCache(
        await getItem(
          serviceRegion
            ? `${STORAGE_PREFIXES.catalogRegion}${serviceRegion}`
            : STORAGE_KEYS.catalog,
        ),
      );
      // The previous SLC/device version used a global cache. Retain its Utah
      // rows on upgrade, while never borrowing it for Vermont or Asheville.
      if (!cached && serviceRegion === 'utah') cached = parseCache(await getItem(STORAGE_KEYS.catalog));
      if (cancelled) return;

      setRegionInState(serviceRegion);
      if (cached) {
        setActivities(
          toActivities(
            cached.items.filter((item) => item.sourceName !== 'onto community'),
            serviceRegion,
          ),
        );
        setSource('cache');
        setUpdatedAt(cached.updatedAt);
      } else {
        setActivities(scopedBundled);
        setSource('bundled');
        setUpdatedAt(null);
      }

      if (!backend) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const ratings: NonNullable<CatalogEventQuery['ratings']> =
          matureContentEnabled()
            ? ['family', 'general', 'mature']
            : ['family', 'general'];
        const [items, freshness] = await Promise.all([
          loadAllEvents(backend, ratings, serviceRegion, () => !cancelled),
          // Freshness is display metadata, not a prerequisite for a usable feed.
          serviceRegion ? Promise.resolve(null) : backend.getCatalogFreshness().catch(() => null),
        ]);
        if (cancelled) return;

        if (items.length === 0) {
          // An empty remote catalog (for example before the first ingestion
          // run) must not replace the cache or bundled guide selected above
          // or its timestamp, and must not be cached, or later launches
          // would also be empty.
          return;
        }

        const cloudUpdatedAt =
          freshness?.completedAt ?? newestEventTimestamp(items);
        setActivities(toActivities(items, serviceRegion));
        setSource('cloud');
        setUpdatedAt(cloudUpdatedAt);
        await setItem(
          serviceRegion
            ? `${STORAGE_PREFIXES.catalogRegion}${serviceRegion}`
            : STORAGE_KEYS.catalog,
          JSON.stringify({
            items: items.filter((item) => item.sourceName !== 'onto community'),
            updatedAt: cloudUpdatedAt,
          }),
        );
      } catch (reason) {
        if (cancelled) return;
        setError(
          reason instanceof Error ? reason : new Error('Catalog unavailable'),
        );
        // Cached or bundled data selected above remains visible.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backend, scopedBundled, reload, serviceRegion, enabled]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  if (!enabled) return { activities: [], source: 'bundled', updatedAt: null, loading: false, error: null, refresh };

  return regionInState === serviceRegion
    ? { activities, source, updatedAt, loading, error, refresh }
    : {
        activities: scopedBundled,
        source: 'bundled',
        updatedAt: null,
        loading: true,
        error: null,
        refresh,
      };
}
