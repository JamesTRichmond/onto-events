/**
 * Recurrence rules for seed items — the Saturday-truth fix (BACKLOG §2).
 *
 * Real recurring happenings keep real schedules. The Downtown Farmers Market
 * runs Saturdays 8am–2pm through Oct 24; freezing that as
 * `startsInMinutes: 540` makes the card lie on every day except the one it
 * was authored on — it claims "starts in 9 hours" on a Tuesday, and claims
 * the same thing at 10am on Saturday while the market is actually underway.
 * A rule is evaluated against the destination's civil clock instead.
 *
 * Discover supplies the selected location's IANA timezone. Legacy callers
 * without a destination retain their local clock. Intl and the date-window
 * helpers resolve civil dates without a bundled timezone database.
 */

import { addCalendarDays, calendarDaysBetween, localDateKey, localInstants, localWeekdayIndex } from '@/lib/date-filter';

export type Recurrence = {
  /** Days it runs, 0 = Sunday … 6 = Saturday. */
  days: readonly number[];
  /** Local start time on a 24h clock. */
  startHour: number;
  startMinute?: number;
  /** Local end time. Omit for happenings with no announced end. */
  endHour?: number;
  endMinute?: number;
  /** Inclusive season window as local YYYY-MM-DD. Omit for year-round. */
  seasonStart?: string;
  seasonEnd?: string;
};

export type Occurrence = {
  /** Epoch ms when this occurrence starts. */
  startsAt: number;
  /** Epoch ms when it ends, or null when no end is announced. */
  endsAt: number | null;
  /** True while the clock sits inside the occurrence. */
  underway: boolean;
};

/**
 * How long a no-announced-end happening still counts as underway. Matches the
 * feed's expiry for live events so both kinds of card age out the same way.
 */
const NO_END_GRACE_MS = 3 * 60 * 60 * 1000;

/** Days to look ahead before calling a rule spent (a week covers every weekly rule). */
const SEARCH_DAYS = 8;

function wallTime(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The underway or next occurrence in the destination's timezone. Normal
 * browsing looks a week ahead; a selected window supplies its exclusive end.
 * The season bounds remain inclusive local dates in either case.
 */
export function nextOccurrence(
  rule: Recurrence,
  now: number,
  options: { timeZone?: string; endUtcMs?: number } = {},
): Occurrence | null {
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = localDateKey(now, timeZone);
  let firstDate = addCalendarDays(today, -1);
  let lastDate = options.endUtcMs === undefined
    ? addCalendarDays(today, SEARCH_DAYS - 1)
    : localDateKey(options.endUtcMs - 1, timeZone);
  // Jump to the season opening, even when it is weeks into a custom range.
  if (rule.seasonStart && rule.seasonStart > firstDate) firstDate = rule.seasonStart;
  if (rule.seasonEnd && rule.seasonEnd < lastDate) lastDate = rule.seasonEnd;
  if (!rule.days.some(day => Number.isInteger(day) && day >= 0 && day <= 6)) return null;

  const startTime = wallTime(rule.startHour, rule.startMinute);
  const endTime = rule.endHour === undefined ? null : wallTime(rule.endHour, rule.endMinute);

  // Start at -1: an occurrence that began yesterday and runs past midnight
  // (e.g. Fri 9pm–Sat 1am) is still "underway" for a clock just after
  // midnight, so the scan has to look one day back before it looks forward.
  for (let day = firstDate; day <= lastDate; day = addCalendarDays(day, 1)) {
    if (!rule.days.includes(localWeekdayIndex(day))) continue;
    // Skip a nonexistent DST wall time; on a repeated clock use its first
    // occurrence, rather than silently moving the publisher's schedule.
    const startsAt = localInstants(day, startTime, timeZone)[0];
    if (startsAt === undefined) continue;
    if (options.endUtcMs !== undefined && startsAt >= options.endUtcMs) return null;

    let endsAt: number | null = null;
    if (endTime !== null) {
      // Advance the civil date, not 24 elapsed hours: DST nights can be
      // shorter or longer while the published start/end clocks stay put.
      const endDate = endTime <= startTime ? addCalendarDays(day, 1) : day;
      const end = localInstants(endDate, endTime, timeZone)[0];
      if (end === undefined) continue;
      endsAt = end;
    }

    const over = endsAt !== null ? now > endsAt : now > startsAt + NO_END_GRACE_MS;
    if (over) continue;

    return { startsAt, endsAt, underway: now >= startsAt };
  }

  return null;
}

function timeLabel(epochMs: number, timeZone: string): string {
  return new Date(epochMs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

/**
 * Honest label ladder, most useful first: underway beats today, today beats a
 * weekday name. "Happening now · until 2:00 PM" tells a viewer the one thing
 * a frozen "Sat 8:00 AM – 2:00 PM" never could — that there is still time.
 */
export function recurrenceLabel(
  occurrence: Occurrence,
  now: number,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const { startsAt, endsAt, underway } = occurrence;
  const range = endsAt !== null ? ` – ${timeLabel(endsAt, timeZone)}` : '';

  // Recurrence search can be anchored in a future window, but "now" is the
  // actual app clock, not that window's start.
  if (underway && startsAt <= now) {
    return endsAt !== null ? `Happening now · until ${timeLabel(endsAt, timeZone)}` : 'Happening now';
  }

  const start = new Date(startsAt);
  const daysOut = calendarDaysBetween(localDateKey(now, timeZone), localDateKey(startsAt, timeZone));

  if (daysOut === 0) return `Today ${timeLabel(startsAt, timeZone)}${range}`;
  if (daysOut === 1) return `Tomorrow ${timeLabel(startsAt, timeZone)}${range}`;

  const weekday = start.toLocaleDateString('en-US', { weekday: 'short', timeZone });
  return `${weekday} ${timeLabel(startsAt, timeZone)}${range}`;
}
