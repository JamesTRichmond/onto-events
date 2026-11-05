/** The city's clock — weekday, school, work, last call, sun. */

export type DayPart =
  | 'sunrise'
  | 'morning'
  | 'midday'
  | 'afterSchool'
  | 'afterWork'
  | 'golden'
  | 'sunset'
  | 'evening'
  | 'late'
  | 'anytime';

export type CityClock = {
  weekday: number;
  isWeekend: boolean;
  hour: number;
  minute: number;
  parts: DayPart[];
  label: string;
  shortLabel: string;
  sunriseAt: number | null;
  sunsetAt: number | null;
  minutesToSunset: number;
  minutesToSunrise: number;
  aroundSunrise: boolean;
  aroundSunset: boolean;
  afterLastCall: boolean;
};

const TZ = 'America/Denver';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function zonedParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const bits = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: map[bits.weekday] ?? now.getDay(),
    hour: Number(bits.hour),
    minute: Number(bits.minute),
  };
}

export function cityClock(
  now: Date,
  sunriseAt: number | null,
  sunsetAt: number | null,
  timeZone: string = TZ,
  nextSunriseAt?: number | null,
): CityClock {
  const { weekday, hour, minute } = zonedParts(now, timeZone);
  const isWeekend = weekday === 0 || weekday === 6;
  const stamp = hour * 60 + minute;
  const rise = sunriseAt === null ? null : zonedParts(new Date(sunriseAt), timeZone);
  const riseMin = rise ? rise.hour * 60 + rise.minute : null;
  const toSunset = sunsetAt === null ? Infinity : (sunsetAt - now.getTime()) / 60_000;
  const nextRise = sunriseAt !== null && sunriseAt >= now.getTime()
    ? sunriseAt : nextSunriseAt ?? (sunriseAt === null ? null : sunriseAt + 86_400_000);
  const toSunrise = nextRise === null ? Infinity : (nextRise - now.getTime()) / 60_000;
  const aroundSunrise = sunriseAt !== null && Math.abs(now.getTime() - sunriseAt) <= 50 * 60_000;
  const aroundSunset = sunsetAt !== null && Math.abs(now.getTime() - sunsetAt) <= 45 * 60_000;
  const golden = toSunset > 0 && toSunset <= 90;
  const afterLastCall = stamp >= 90 && stamp < 4 * 60; // 1:30–4:00 only
  const late = stamp >= 22 * 60 || stamp < 4 * 60;

  const parts: DayPart[] = ['anytime'];
  if (aroundSunrise) parts.push('sunrise');
  if (stamp >= (riseMin === null ? 6 * 60 : riseMin + 20) && stamp < 11 * 60 + 30) parts.push('morning');
  if (stamp >= 11 * 60 && stamp < 15 * 60) parts.push('midday');
  if (!isWeekend && stamp >= 14 * 60 + 30 && stamp < 17 * 60 + 15) parts.push('afterSchool');
  if (!isWeekend && stamp >= 16 * 60 + 45 && stamp < 19 * 60 + 15) parts.push('afterWork');
  if (isWeekend && stamp >= 16 * 60 && stamp < 19 * 60) parts.push('afterWork');
  if (golden) parts.push('golden');
  if (aroundSunset) parts.push('sunset');
  if (stamp >= 19 * 60 && stamp < 22 * 60) parts.push('evening');
  if (late) parts.push('late');

  let shortLabel = 'Now';
  if (aroundSunrise) shortLabel = 'Sunrise';
  else if (aroundSunset) shortLabel = 'Sunset';
  else if (golden) shortLabel = 'Golden hour';
  else if (afterLastCall) shortLabel = 'After last call';
  else if (late) shortLabel = 'Late';
  else if (parts.includes('afterWork')) shortLabel = 'After work';
  else if (parts.includes('afterSchool')) shortLabel = 'After school';
  else if (parts.includes('morning')) shortLabel = isWeekend ? 'Weekend morning' : 'Weekday morning';
  else if (parts.includes('midday')) shortLabel = 'Midday';
  else if (parts.includes('evening')) shortLabel = 'Evening';

  const day = WEEKDAYS[weekday];
  const who =
    !isWeekend && parts.includes('morning')
      ? 'parents at home'
      : parts.includes('afterSchool')
        ? 'school\'s out'
        : parts.includes('afterWork')
          ? 'work\'s out'
          : afterLastCall
            ? 'bars just closed'
            : aroundSunset
              ? 'the light is the point'
              : aroundSunrise
                ? 'the light is the point'
                : '';

  return {
    weekday,
    isWeekend,
    hour,
    minute,
    parts,
    label: who ? `${day} · ${shortLabel.toLowerCase()} · ${who}` : `${day} · ${shortLabel.toLowerCase()}`,
    shortLabel,
    sunriseAt,
    sunsetAt,
    minutesToSunset: toSunset,
    minutesToSunrise: toSunrise,
    aroundSunrise,
    aroundSunset,
    afterLastCall,
  };
}

export function formatSun(ms: number, timeZone: string = TZ) {
  return new Date(ms).toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
}
