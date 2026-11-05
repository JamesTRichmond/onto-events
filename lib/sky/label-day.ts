export type FeedDay = { date: string; weekday: string };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The feed's night belongs to its previous civil date until 04:00 in its place. */
export function labelDay(timestampMs: number, timeZone: string): FeedDay {
  if (!Number.isFinite(timestampMs) || !timeZone) {
    throw new RangeError('A feed day requires an explicit instant and IANA timezone.');
  }
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(timestampMs);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  // Subtract a calendar date AFTER resolving wall time, not four elapsed hours:
  // daylight-saving transitions make those operations different.
  const date = new Date(`${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T12:00:00Z`);
  if (Number(part('hour')) < 4) date.setUTCDate(date.getUTCDate() - 1);
  return { date: date.toISOString().slice(0, 10), weekday: WEEKDAYS[date.getUTCDay()] };
}
