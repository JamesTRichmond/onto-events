import { type Activity, SLC_ANCHOR } from '@/data/activities';
import { buildFeed, type FeedInput } from '@/lib/feed';
import { nextOccurrence } from '@/lib/recurrence';
import { feedSection } from '@/lib/sky/feed-section';

const series: Activity = {
  id: 'weekly-market',
  title: 'Weekly market',
  category: 'community',
  venue: 'Public plaza',
  area: 'Downtown',
  ...SLC_ANCHOR,
  whenLabel: 'Publisher schedule',
  startsInMinutes: 0,
  description: 'A weekly community market.',
  attendees: 0,
  rating: 'general',
  source: 'seed',
  recurrence: { days: [6], startHour: 23, startMinute: 30, endHour: 1 },
};

const input = (overrides: Partial<FeedInput> = {}): FeedInput => ({
  now: Date.parse('2026-10-01T12:00:00Z'),
  ...SLC_ANCHOR,
  radiusMi: 15,
  sort: 'soonest',
  mode: 'everyone',
  interests: new Set(),
  timeZone: 'America/New_York',
  dateFilter: { preset: 'custom', startDate: '2026-10-10', endDate: '2026-10-10' },
  ...overrides,
});

describe('Discover recurrence windows', () => {
  it.each([
    ['America/Los_Angeles', '2026-10-11T06:30:00.000Z', '2026-10-11T08:00:00.000Z'],
    ['Pacific/Auckland', '2026-10-10T10:30:00.000Z', '2026-10-10T12:00:00.000Z'],
  ])('keeps a late Saturday in %s on Saturday regardless of browser timezone', (timeZone, startsAtIso, endsAtIso) => {
    const result = buildFeed([series], input({ timeZone }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: series.id, startsAtIso, endsAtIso, whenLabel: 'Sat 11:30 PM – 1:00 AM',
    });
    expect(result.emptyReason).toBe('none');
  });

  it('uses the destination weekday and clock without an active date window too', () => {
    // Sunday in UTC, still Saturday in California.
    const result = buildFeed([series], input({
      now: Date.parse('2026-10-11T06:00:00Z'),
      timeZone: 'America/Los_Angeles', dateFilter: { preset: 'any' },
    }));
    expect(result.items[0]).toMatchObject({
      startsAtIso: '2026-10-11T06:30:00.000Z',
      startsInMinutes: 30,
      whenLabel: 'Today 11:30 PM – 1:00 AM',
    });
    expect(feedSection(series, Date.parse('2026-10-11T06:00:00Z'), 'America/Los_Angeles')).toBe('things to do • scroll');
  });

  it('retains a destination-local overnight overlap without calling a future event underway', () => {
    const result = buildFeed([series], input({
      timeZone: 'America/Los_Angeles',
      dateFilter: { preset: 'custom', startDate: '2026-10-11', endDate: '2026-10-11', endTime: '01:00' },
    }));
    expect(result.items[0]).toMatchObject({
      startsAtIso: '2026-10-11T06:30:00.000Z',
      endsAtIso: '2026-10-11T08:00:00.000Z',
      whenLabel: 'Sat 11:30 PM – 1:00 AM',
    });
  });

  it.each([
    ['spring forward', '2026-03-01', '2026-03-07', '2026-03-08T04:00:00.000Z', '2026-03-08T07:00:00.000Z'],
    ['fall back', '2026-10-25', '2026-10-31', '2026-11-01T03:00:00.000Z', '2026-11-01T08:00:00.000Z'],
  ])('resolves each overnight wall time across %s in the destination', (_name, today, date, startsAtIso, endsAtIso) => {
    const result = buildFeed([{ ...series, recurrence: { days: [6], startHour: 23, endHour: 3 } }], input({
      now: Date.parse(`${today}T12:00:00Z`),
      dateFilter: { preset: 'custom', startDate: date, endDate: date },
    }));
    expect(result.items[0]).toMatchObject({ startsAtIso, endsAtIso, whenLabel: 'Sat 11:00 PM – 3:00 AM' });
  });

  const winterSeries = {
    ...series,
    recurrence: {
      days: [0], startHour: 9, endHour: 11,
      seasonStart: '2026-11-01', seasonEnd: '2026-11-29',
    },
  };

  it('finds a season opening more than eight days into the selected range', () => {
    const result = buildFeed([winterSeries], input({
      dateFilter: { preset: 'custom', startDate: '2026-10-01', endDate: '2026-11-30' },
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      startsAtIso: '2026-11-01T14:00:00.000Z', endsAtIso: '2026-11-01T16:00:00.000Z',
      whenLabel: 'Sun 9:00 AM – 11:00 AM',
    });
    expect(result.emptyReason).toBe('none');
    // Sectioning must keep the occurrence selected for this window.
    expect(feedSection(result.items[0], input().now, 'America/New_York')).toBe('onto activities coming up');
  });

  it('keeps normal browsing bounded when a season is months away', () => {
    const result = buildFeed([winterSeries], input({ dateFilter: { preset: 'any' } }));
    expect(result.items).toEqual([]);
    expect(result.emptyReason).toBe('no-data');
  });

  it.each([
    ['before opening', '2026-10-01', '2026-10-31', undefined],
    ['at the exclusive end', '2026-10-01', '2026-11-01', '09:00'],
    ['after season close', '2026-11-30', '2026-12-01', undefined],
  ])('does not put a series in a range %s', (_name, startDate, endDate, endTime) => {
    expect(buildFeed([winterSeries], input({
      dateFilter: { preset: 'custom', startDate, endDate, endTime },
    })).items).toEqual([]);
  });

  it('includes an opening on the final selected day when it starts before the end time', () => {
    const result = buildFeed([winterSeries], input({
      dateFilter: { preset: 'custom', startDate: '2026-10-01', endDate: '2026-11-01', endTime: '09:01' },
    }));
    expect(result.items.map(item => item.startsAtIso)).toEqual(['2026-11-01T14:00:00.000Z']);
  });

  it('respects the season end while searching a long range', () => {
    const shortSeason = { ...winterSeries, recurrence: { ...winterSeries.recurrence, seasonStart: '2026-11-02', seasonEnd: '2026-11-03' } };
    expect(buildFeed([shortSeason], input({
      dateFilter: { preset: 'custom', startDate: '2026-10-01', endDate: '2026-11-30' },
    })).items).toEqual([]);
  });

  it('keeps Going, search, interests, mode and distance filtering on a future season', () => {
    const selected = input({ dateFilter: { preset: 'custom', startDate: '2026-10-01', endDate: '2026-11-30' } });
    expect(buildFeed([winterSeries], selected).items).toHaveLength(1);
    for (const filter of [
      { goingIds: new Set([series.id]) },
      { query: 'no such activity' },
      { interests: new Set(['music']) },
      { mode: 'family' as const },
      { lat: 0, lng: 0 },
    ]) {
      expect(buildFeed([winterSeries], { ...selected, ...filter }).items).toEqual([]);
    }
  });
});

describe('destination recurrence clock changes', () => {
  it('skips a nonexistent spring-forward time and finds the next real occurrence within the window', () => {
    const occurrence = nextOccurrence(
      { days: [0], startHour: 2, startMinute: 30 },
      Date.parse('2026-03-08T05:00:00Z'),
      { timeZone: 'America/New_York', endUtcMs: Date.parse('2026-03-16T04:00:00Z') },
    );
    expect(occurrence).toEqual({
      startsAt: Date.parse('2026-03-15T06:30:00Z'), endsAt: null, underway: false,
    });
  });

  it('uses the first instant of a repeated fall-back clock and does not invent an end', () => {
    const occurrence = nextOccurrence(
      { days: [0], startHour: 1, startMinute: 30 },
      Date.parse('2026-11-01T04:00:00Z'),
      { timeZone: 'America/New_York', endUtcMs: Date.parse('2026-11-02T05:00:00Z') },
    );
    expect(occurrence).toEqual({
      startsAt: Date.parse('2026-11-01T05:30:00Z'), endsAt: null, underway: false,
    });
  });
});
