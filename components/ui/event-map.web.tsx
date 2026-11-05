import { MapFallback } from '@/components/ui/map-fallback';

import type { EventMapProps } from './event-map';

/** No inline map on the web app yet; Directions in the same sheet is the map. */
export function EventMap({ title }: EventMapProps) {
  return <MapFallback title={title} testID="event-map" />;
}
