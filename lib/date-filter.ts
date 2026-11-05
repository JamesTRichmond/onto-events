import type { Activity } from '@/data/activities';

/** Established ICS sync window policy: onto indexes events up to 60 days ahead. */
export const MAX_EVENT_HORIZON_DAYS = 60;

export type DateFilterPreset = 'any' | 'today' | 'tomorrow' | 'weekend' | 'custom';

export type DateFilter = Readonly<{
  preset: DateFilterPreset;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}>;

export type ResolvedDateRange = Readonly<{
  preset: Exclude<DateFilterPreset, 'any'>;
  startDate: string;
  endDate: string;
  startUtcMs: number;
  endUtcMs: number;
  beyondHorizon: boolean;
  label: string;
}>;

const DAY_MS = 86_400_000;
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DEFAULT_DATE_FILTER: DateFilter = { preset: 'any' };

function parseDateKeyUtcMs(dateKey: string): number | null {
  const match = DATE_KEY_RE.exec(dateKey.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

export function isValidDateKey(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  return parseDateKeyUtcMs(value) !== null;
}

export function localDateKey(timestampMs: number, timeZone = 'America/Denver'): string {
  const formatWithZone = (zone: string) => {
    const parts: Record<string, string> = {};
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    for (const part of formatter.formatToParts(new Date(timestampMs))) {
      if (part.type !== 'literal') {
        parts[part.type] = part.value;
      }
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  try {
    return formatWithZone(timeZone || 'America/Denver');
  } catch {
    return formatWithZone('UTC');
  }
}

export function addCalendarDays(dateKey: string, deltaDays: number): string {
  const baseMs = parseDateKeyUtcMs(dateKey);
  if (baseMs === null) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  const shifted = new Date(baseMs + deltaDays * DAY_MS);
  const year = String(shifted.getUTCFullYear()).padStart(4, '0');
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calendarDaysBetween(startDateKey: string, endDateKey: string): number {
  const startMs = parseDateKeyUtcMs(startDateKey);
  const endMs = parseDateKeyUtcMs(endDateKey);
  if (startMs === null || endMs === null) {
    throw new Error(`Invalid date keys: ${startDateKey} .. ${endDateKey}`);
  }
  return Math.round((endMs - startMs) / DAY_MS);
}

export function localWeekdayIndex(dateKey: string): number {
  const ms = parseDateKeyUtcMs(dateKey);
  if (ms === null) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return new Date(ms).getUTCDay();
}

/** Resolve a destination wall time without silently shifting DST gaps/folds. */
export function localInstants(date: string, time: string, timeZone: string): number[] {
  const naive = Date.parse(`${date}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = (ms: number) => Object.fromEntries(formatter.formatToParts(ms)
    .filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const offsets = new Set([-DAY_MS, 0, DAY_MS].map(delta => {
    const probe = naive + delta;
    const p = parts(probe);
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - probe;
  }));
  return [...offsets].map(offset => naive - offset).filter(ms => {
    const p = parts(ms);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === `${date}T${time}`;
  }).sort((a,b) => a-b);
}

export function startOfLocalDateUtcMs(dateKey: string, timeZone = 'America/Denver'): number {
  // Midnight can be skipped in a DST transition: use the first real minute.
  for (let minute = 0; minute < 1440; minute++) {
    const time = `${String(Math.floor(minute / 60)).padStart(2,'0')}:${String(minute % 60).padStart(2,'0')}`;
    const matches = localInstants(dateKey, time, timeZone);
    if (matches.length) return matches[0];
  }
  throw new Error(`No local date ${dateKey} in ${timeZone}`);
}

export function parseCustomDateRange(
  rawStart: string,
  rawEnd: string,
  todayKey: string,
  rawStartTime = '',
  rawEndTime = '',
  timeZone = 'America/Denver',
): { ok: true; startDate: string; endDate: string; startTime?: string; endTime?: string } | { ok: false; error: string } {
  const start = rawStart.trim();
  const end = rawEnd.trim() || start;
  if (!isValidDateKey(start)) {
    return { ok: false, error: 'Enter a valid start date as YYYY-MM-DD.' };
  }
  if (!isValidDateKey(end)) {
    return { ok: false, error: 'Enter a valid end date as YYYY-MM-DD.' };
  }
  if (calendarDaysBetween(start, end) < 0) {
    return { ok: false, error: 'End date must be on or after the start date.' };
  }
  if (calendarDaysBetween(todayKey, end) < 0) {
    return { ok: false, error: 'Choose today or a future date.' };
  }
  const startTime = rawStartTime.trim();
  const endTime = rawEndTime.trim();
  for (const [name, date, time] of [['Start', start, startTime], ['End', end, endTime]]) {
    if (!time) continue;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: `${name} time must be HH:MM (24-hour).` };
    const matches = localInstants(date, time, timeZone);
    if (matches.length !== 1) return { ok: false, error: `${name} time is skipped or repeated by a clock change in ${timeZone}. Choose another time.` };
  }
  if (`${start}T${startTime || '00:00'}` >= `${endTime ? end : addCalendarDays(end, 1)}T${endTime || '00:00'}`) {
    return { ok: false, error: 'End must be after start.' };
  }
  return { ok: true, startDate: start, endDate: end,
    ...(startTime ? { startTime } : {}), ...(endTime ? { endTime } : {}) };

}

export function resolveDateFilterRange(
  filter: DateFilter | undefined,
  now: number | null,
  timeZone = 'America/Denver',
): ResolvedDateRange | null {
  if (!filter || filter.preset === 'any' || now === null) {
    return null;
  }
  const todayKey = localDateKey(now, timeZone);
  let startDate = todayKey;
  let endDate = todayKey;
  let label = 'Today';

  if (filter.preset === 'today') {
    startDate = todayKey;
    endDate = todayKey;
    label = 'Today';
  } else if (filter.preset === 'tomorrow') {
    startDate = addCalendarDays(todayKey, 1);
    endDate = startDate;
    label = 'Tomorrow';
  } else if (filter.preset === 'weekend') {
    const dow = localWeekdayIndex(todayKey);
    if (dow === 5) {
      startDate = todayKey;
      endDate = addCalendarDays(todayKey, 2);
    } else if (dow === 6) {
      startDate = todayKey;
      endDate = addCalendarDays(todayKey, 1);
    } else if (dow === 0) {
      startDate = todayKey;
      endDate = todayKey;
    } else {
      startDate = addCalendarDays(todayKey, 5 - dow);
      endDate = addCalendarDays(todayKey, 7 - dow);
    }
    label = 'This weekend';
  } else if (filter.preset === 'custom') {
    if (!isValidDateKey(filter.startDate)) return null;
    startDate = filter.startDate.trim();
    endDate = isValidDateKey(filter.endDate) ? filter.endDate.trim() : startDate;
    if (calendarDaysBetween(startDate, endDate) < 0) return null;
    label = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
  }

  const startTime = filter.preset === 'custom' ? filter.startTime : undefined;
  const endTime = filter.preset === 'custom' ? filter.endTime : undefined;
  const parsed = parseCustomDateRange(startDate, endDate, startDate, startTime, endTime, timeZone);
  if (!parsed.ok) return null;
  const startUtcMs = parsed.startTime ? localInstants(startDate, parsed.startTime, timeZone)[0] : startOfLocalDateUtcMs(startDate, timeZone);
  const endUtcMs = parsed.endTime ? localInstants(endDate, parsed.endTime, timeZone)[0] : startOfLocalDateUtcMs(addCalendarDays(endDate, 1), timeZone);
  if (startTime || endTime) label += ` · ${startTime || '00:00'} to ${endTime || 'end of day'}`;
  const startOffset = calendarDaysBetween(todayKey, startDate);
  const endOffset = calendarDaysBetween(todayKey, endDate);
  const beyondHorizon =
    startOffset > MAX_EVENT_HORIZON_DAYS || endOffset > MAX_EVENT_HORIZON_DAYS;

  return {
    preset: filter.preset,
    startDate,
    endDate,
    startUtcMs,
    endUtcMs,
    beyondHorizon,
    label,
  };
}

/**
 * Date-range inclusion rule (destination timezone):
 * - Every candidate event is projected into the destination's IANA timezone
 *   (falling back to the event's own timezone, then America/Denver).
 * - An event with `startsAtIso` and optional `endsAtIso` covers the inclusive
 *   local calendar date interval `[eventStartDate, eventEndDate]`, where
 *   `eventEndDate` uses `endMs - 1` when `endMs > startMs` so an all-day or
 *   midnight-ending event (`[2026-10-10T00:00, 2026-10-11T00:00)`) stays on
 *   `2026-10-10` while late-night events crossing midnight (`22:00` to `01:30`)
 *   and multi-day events match every overlapped local calendar date.
 */
export function activityMatchesDateRange(
  activity: Pick<Activity, 'startsAtIso' | 'endsAtIso' | 'timezone'>,
  range: Pick<ResolvedDateRange, 'startDate' | 'endDate'> & Partial<Pick<ResolvedDateRange, 'startUtcMs' | 'endUtcMs'>>,
  destinationTimeZone?: string,
): boolean {
  if (!activity.startsAtIso) return false;
  const startMs = Date.parse(activity.startsAtIso);
  if (!Number.isFinite(startMs)) return false;

  if (range.startUtcMs !== undefined && range.endUtcMs !== undefined) {
    const end = activity.endsAtIso ? Date.parse(activity.endsAtIso) : NaN;
    // Unknown end is a point in time; do not invent a duration.
    return startMs < range.endUtcMs && (Number.isFinite(end) && end > startMs ? end > range.startUtcMs : startMs >= range.startUtcMs);
  }
  const zone = destinationTimeZone || activity.timezone || 'America/Denver';
  const eventStartDate = localDateKey(startMs, zone);
  let eventEndDate = eventStartDate;

  if (activity.endsAtIso) {
    const endMs = Date.parse(activity.endsAtIso);
    if (Number.isFinite(endMs) && endMs > startMs) {
      eventEndDate = localDateKey(endMs - 1, zone);
    }
  }

  return eventStartDate <= range.endDate && eventEndDate >= range.startDate;
}
