import { currentConditions, upcomingHours, type HourForecast, type WeatherNow, type WeatherReport } from './nws';

/** "61°", or an honest dash when NWS did not report one. */
export const degrees = (value: number | null) => (value === null ? '—' : `${value}°`);

export function windLabel(now: Pick<WeatherNow, 'windMph' | 'windFrom'>): string | null {
  if (now.windMph === null) return null;
  if (now.windMph < 1) return 'Calm';
  return `Wind ${now.windMph} mph${now.windFrom ? ` ${now.windFrom}` : ''}`;
}

/** The expanded line: only what NWS reported, and "feels like" only when it differs. */
export function detailsLine(now: WeatherNow): string {
  const parts: string[] = [];
  if (now.feelsF !== null && now.tempF !== null && Math.abs(now.feelsF - now.tempF) >= 2) {
    parts.push(`Feels like ${now.feelsF}°`);
  }
  if (now.humidityPct !== null) parts.push(`Humidity ${now.humidityPct}%`);
  if (now.gustMph !== null && now.windMph !== null && now.gustMph > now.windMph) parts.push(`Gusts ${now.gustMph} mph`);
  return parts.join(' · ');
}

/**
 * The hour by the clock, even the one under way: a forecast "Now 68°" beside
 * an observed 63° reads as a contradiction, "2 PM 68°" does not.
 */
export function hourLabel(startsAt: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone }).format(startsAt).replace(':00', '');
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(startsAt);
  }
}

export function clockLabel(at: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(at);
  }
}

export type WeatherSummary = {
  temp: string;
  /** NWS's own words ("Mostly Cloudy"), or the forecast's when no fresh observation. */
  text: string;
  sub: string | null;
  source: 'observed' | 'forecast';
  now: WeatherNow | null;
  hours: HourForecast[];
};

/**
 * What the strip says. A fresh observation first; failing that, the forecast
 * for this hour, labelled as a forecast; failing both, nothing — the strip
 * stays quiet rather than show weather it does not have.
 */
export function weatherSummary(report: WeatherReport | null, nowMs: number, hourCount = 8): WeatherSummary | null {
  const current = currentConditions(report, nowMs);
  const hours = upcomingHours(report, nowMs, hourCount);
  const place = report?.place ?? null;
  if (current) {
    const wind = windLabel(current);
    return {
      temp: degrees(current.tempF),
      text: current.description || 'Conditions not reported',
      sub: [wind, place ? `near ${place}` : null].filter(Boolean).join(' · ') || null,
      source: 'observed',
      now: current,
      hours,
    };
  }
  const hour = hours[0];
  if (!hour) return null;
  return {
    temp: degrees(hour.tempF),
    text: hour.description || 'Forecast',
    sub: ['Forecast', place ? `near ${place}` : null].filter(Boolean).join(' · '),
    source: 'forecast',
    now: null,
    hours,
  };
}
