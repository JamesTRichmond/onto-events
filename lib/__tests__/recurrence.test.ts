import { SEED_ACTIVITIES } from '@/data/activities';
import { FAMILY_ACTIVITIES } from '@/data/family-events';
import { ROADTRIP_ACTIVITIES } from '@/data/roadtrip-events';
import { nextOccurrence, recurrenceLabel, Recurrence } from '../recurrence';

// Legacy callers without a destination retain their local clock. These
// fixtures assert that default in any TZ; explicit zones have separate tests.
const at = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

// 2026-08-29 is a Saturday; 2026-08-28 a Friday.
const SATURDAY = { y: 2026, m: 8, d: 29 };

const market: Recurrence = {
  days: [6],
  startHour: 8,
  endHour: 14,
  seasonStart: '2026-06-06',
  seasonEnd: '2026-10-24',
};

describe('nextOccurrence', () => {
  it('returns the occurrence underway when the clock sits inside it', () => {
    const now = at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 10);
    const occurrence = nextOccurrence(market, now)!;

    expect(occurrence.underway).toBe(true);
    expect(occurrence.startsAt).toBe(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 8));
    expect(occurrence.endsAt).toBe(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 14));
  });

  it('returns today’s upcoming occurrence before it starts', () => {
    const now = at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 6);
    const occurrence = nextOccurrence(market, now)!;

    expect(occurrence.underway).toBe(false);
    expect(occurrence.startsAt).toBe(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 8));
  });

  it('rolls to next week once the day’s occurrence has ended', () => {
    const now = at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 15);
    const occurrence = nextOccurrence(market, now)!;

    expect(occurrence.startsAt).toBe(at(2026, 9, 5, 8));
  });

  it('finds the next matching weekday from any day of the week', () => {
    // Tuesday: the market is four days out, not "in 9 hours".
    const now = at(2026, 8, 25, 12);
    const occurrence = nextOccurrence(market, now)!;

    expect(occurrence.startsAt).toBe(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 8));
    expect(occurrence.underway).toBe(false);
  });

  it('is null before the season opens, not a date months away', () => {
    const nextSummer: Recurrence = {
      days: [6],
      startHour: 9,
      seasonStart: '2027-06-05',
      seasonEnd: '2027-09-25',
    };
    expect(nextOccurrence(nextSummer, at(2026, 8, 29, 9))).toBeNull();
    // It reappears once the clock reaches the window.
    expect(nextOccurrence(nextSummer, at(2027, 6, 5, 8))).not.toBeNull();
  });

  it('is null for a rule that matches no day', () => {
    expect(nextOccurrence({ days: [], startHour: 9 }, at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 6))).toBeNull();
  });

  it('is null outside the season — an ended series is finished, not far away', () => {
    expect(nextOccurrence(market, at(2026, 11, 3, 9))).toBeNull();
    expect(nextOccurrence(market, at(2026, 5, 1, 9))).toBeNull();
  });

  it('honors both season edges inclusively', () => {
    // Oct 24 2026 is the final Saturday in the window.
    expect(nextOccurrence(market, at(2026, 10, 24, 9))).not.toBeNull();
    expect(nextOccurrence(market, at(2026, 10, 25, 9))).toBeNull();
  });

  it('treats a no-end happening as underway for three hours, then rolls on', () => {
    const standup: Recurrence = { days: [6], startHour: 8 };

    expect(nextOccurrence(standup, at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 10))!.underway).toBe(true);
    expect(nextOccurrence(standup, at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 12))!.startsAt).toBe(
      at(2026, 9, 5, 8)
    );
  });

  it('carries an end past midnight into the next day', () => {
    const lateNight: Recurrence = { days: [5], startHour: 21, endHour: 1 };
    const fridayNight = at(2026, 8, 28, 23);
    const occurrence = nextOccurrence(lateNight, fridayNight)!;

    expect(occurrence.underway).toBe(true);
    expect(occurrence.endsAt).toBe(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 1));
  });

  it('finds a still-underway past-midnight occurrence when now is after midnight', () => {
    // Same Fri 9pm–Sat 1am rule, but the clock has already rolled to
    // Saturday 00:30 — the occurrence started "yesterday" and is still on.
    const lateNight: Recurrence = { days: [5], startHour: 21, endHour: 1 };
    const saturdayEarlyMorning = at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 0, 30);
    const occurrence = nextOccurrence(lateNight, saturdayEarlyMorning)!;

    expect(occurrence.underway).toBe(true);
    expect(occurrence.startsAt).toBe(at(2026, 8, 28, 21));
    expect(occurrence.endsAt).toBe(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 1));
  });

  it('supports multi-day rules', () => {
    const weekdays: Recurrence = { days: [1, 2, 3, 4, 5], startHour: 7, endHour: 8 };
    // Saturday -> next is Monday.
    expect(nextOccurrence(weekdays, at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 12))!.startsAt).toBe(
      at(2026, 8, 31, 7)
    );
  });
});

describe('recurrenceLabel', () => {
  const label = (now: number) => recurrenceLabel(nextOccurrence(market, now)!, now);

  it('says how long is left while it is underway', () => {
    expect(label(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 10))).toBe(
      'Happening now · until 2:00 PM'
    );
  });

  it('says Today before it starts on the day', () => {
    expect(label(at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 6))).toBe('Today 8:00 AM – 2:00 PM');
  });

  it('says Tomorrow the day before', () => {
    expect(label(at(2026, 8, 28, 18))).toBe('Tomorrow 8:00 AM – 2:00 PM');
  });

  it('falls back to the weekday name further out', () => {
    expect(label(at(2026, 8, 25, 12))).toBe('Sat 8:00 AM – 2:00 PM');
  });

  it('omits the range for a happening with no announced end', () => {
    const standup: Recurrence = { days: [6], startHour: 8 };
    const before = at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 6);
    const during = at(SATURDAY.y, SATURDAY.m, SATURDAY.d, 9);

    expect(recurrenceLabel(nextOccurrence(standup, before)!, before)).toBe('Today 8:00 AM');
    expect(recurrenceLabel(nextOccurrence(standup, during)!, during)).toBe('Happening now');
  });
});

/**
 * Discover resolves rules in the selected destination's timezone. Road trips
 * can cross into a different venue timezone — Wendover NV is Pacific, an hour
 * behind Salt Lake — and would need an explicit venue-zone rule instead.
 *
 * This canary fails the moment someone gives a road-trip listing a recurrence
 * rule, so the hour-off render is caught here instead of on a card. Giving one
 * a rule means giving Activity a venue timezone first.
 */
describe('road-trip timezone canary', () => {
  it('no radius-bypassing activity carries a recurrence rule', () => {
    const offenders = [...SEED_ACTIVITIES, ...FAMILY_ACTIVITIES, ...ROADTRIP_ACTIVITIES]
      .filter((a) => a.category === 'roadtrip' && a.recurrence !== undefined)
      .map((a) => a.id);

    expect(offenders).toEqual([]);
  });
});
