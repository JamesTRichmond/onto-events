import { localSunTimes } from '@/lib/sky/astronomy';
import type { LocationOrigin } from '@/lib/location-choice';
import type { PlaceSky } from '@/lib/spot-feed';
import type { WeatherNow } from '@/lib/weather/nws';
import type { PlaceWeatherKind } from '@/data/spots';

const CONDITIONS: Partial<Record<WeatherNow['word'], PlaceWeatherKind>> = {
  Clear: 'clear', Clouds: 'cloud', Rain: 'rain', Drizzle: 'drizzle',
  Thunderstorm: 'thunder', Snow: 'snow', Fog: 'fog', Mist: 'fog',
};

/** Match the decorative sky's one-hour weather expiry; never manufacture a clear sky. */
export function placeSky(now: number, origin: LocationOrigin, observation: WeatherNow | null): PlaceSky {
  const fresh = observation && now - observation.observedAt >= -5 * 60_000
    && now - observation.observedAt <= 60 * 60_000 ? observation : null;
  return {
    ...localSunTimes(now, { latitude: origin.lat, longitude: origin.lng }, origin.timeZone),
    kind: fresh ? fresh.word === 'Clouds' && /overcast|mostly cloudy/i.test(fresh.description)
      ? 'overcast' : CONDITIONS[fresh.word] ?? null : null,
    temperatureF: fresh?.tempF ?? null,
    windMph: fresh?.windMph ?? null,
  };
}
