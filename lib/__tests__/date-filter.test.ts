import { Activity, SLC_ANCHOR } from '@/data/activities';
import {
  activityMatchesDateRange,
  addCalendarDays,
  calendarDaysBetween,
  localDateKey,
  parseCustomDateRange,
  resolveDateFilterRange,
} from '@/lib/date-filter';
import { buildFeed, type FeedInput } from '@/lib/feed';
import type { TierMode } from '@/lib/tiers';

// Fixed clock: Wednesday, October 7, 2026 at 22:30 EDT (2026-10-08T02:30:00Z).
// Notice that in UTC it is already Oct 8, while in America/New_York and America/Denver it is still Oct 7.
const FIXED_NOW = Date.parse('2026-10-08T02:30:00Z');

function makeActivity(overrides: Partial<Activity>): Activity {
  return {
    id: overrides.id ?? 'evt-1',
    title: overrides.title ?? 'Sample Event',
    category: 'community',
    venue: 'Main Plaza',
    area: 'Downtown',
    lat: SLC_ANCHOR.lat,
    lng: SLC_ANCHOR.lng,
    whenLabel: 'Scheduled',
    startsInMinutes: 60,
    description: 'Public community event.',
    attendees: 0,
    rating: 'general',
    source: 'live',
    timezone: 'America/New_York',
    ...overrides,
  };
}

function makeInput(overrides: Partial<FeedInput> = {}): FeedInput {
  return {
    now: FIXED_NOW,
    lat: SLC_ANCHOR.lat,
    lng: SLC_ANCHOR.lng,
    radiusMi: 15,
    sort: 'soonest',
    mode: 'everyone' as TierMode,
    interests: new Set(),
    timeZone: 'America/New_York',
    ...overrides,
  };
}

describe('date-filter helpers and buildFeed date filtering (#371)', () => {
  it('resolves local calendar dates in the destination timezone even when UTC is on the next day', () => {
    expect(localDateKey(FIXED_NOW, 'America/New_York')).toBe('2026-10-07');
    expect(localDateKey(FIXED_NOW, 'America/Denver')).toBe('2026-10-07');
    expect(localDateKey(FIXED_NOW, 'UTC')).toBe('2026-10-08');
  });

  it('resolves Today, Tomorrow, and This weekend presets relative to the destination timezone', () => {
    expect(resolveDateFilterRange({ preset: 'today' }, FIXED_NOW, 'America/New_York')).toMatchObject({
      preset: 'today',
      startDate: '2026-10-07',
      endDate: '2026-10-07',
      beyondHorizon: false,
      label: 'Today',
    });

    expect(resolveDateFilterRange({ preset: 'tomorrow' }, FIXED_NOW, 'America/New_York')).toMatchObject({
      preset: 'tomorrow',
      startDate: '2026-10-08',
      endDate: '2026-10-08',
      beyondHorizon: false,
      label: 'Tomorrow',
    });

    // Oct 7, 2026 is Wednesday -> This weekend is Friday Oct 9 through Sunday Oct 11
    expect(resolveDateFilterRange({ preset: 'weekend' }, FIXED_NOW, 'America/New_York')).toMatchObject({
      preset: 'weekend',
      startDate: '2026-10-09',
      endDate: '2026-10-11',
      beyondHorizon: false,
      label: 'This weekend',
    });
  });

  it('handles DST transitions without calendar drift across fall-back and spring-forward weekends', () => {
    // Saturday Oct 31, 2026 across Nov 1, 2026 fall-back Sunday
    const fallBackNow = Date.parse('2026-10-31T16:00:00Z');
    expect(resolveDateFilterRange({ preset: 'weekend' }, fallBackNow, 'America/New_York')).toMatchObject({
      startDate: '2026-10-31',
      endDate: '2026-11-01',
    });
    expect(addCalendarDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(calendarDaysBetween('2026-10-31', '2026-11-01')).toBe(1);

    // Saturday Mar 13, 2027 across Mar 14, 2027 spring-forward Sunday
    const springForwardNow = Date.parse('2027-03-13T16:00:00Z');
    expect(resolveDateFilterRange({ preset: 'weekend' }, springForwardNow, 'America/New_York')).toMatchObject({
      startDate: '2027-03-13',
      endDate: '2027-03-14',
    });
  });

  it('matches all-day, midnight-spanning, and multi-day events according to the destination-timezone inclusion rule', () => {
    // All-day event on 2026-10-10 in America/New_York: [2026-10-10T04:00:00Z, 2026-10-11T04:00:00Z)
    const allDaySaturday = makeActivity({
      id: 'all-day-sat',
      startsAtIso: '2026-10-10T04:00:00.000Z',
      endsAtIso: '2026-10-11T04:00:00.000Z',
    });
    expect(
      activityMatchesDateRange(allDaySaturday, { startDate: '2026-10-10', endDate: '2026-10-10' }, 'America/New_York'),
    ).toBe(true);
    // Does not bleed into Sunday Oct 11 because endMs - 1 is 23:59:59.999 EDT on Oct 10
    expect(
      activityMatchesDateRange(allDaySaturday, { startDate: '2026-10-11', endDate: '2026-10-11' }, 'America/New_York'),
    ).toBe(false);

    // Late-night concert spanning midnight: Saturday Oct 10 22:30 EDT to Sunday Oct 11 01:30 EDT
    const lateNight = makeActivity({
      id: 'late-night',
      startsAtIso: '2026-10-11T02:30:00.000Z',
      endsAtIso: '2026-10-11T05:30:00.000Z',
    });
    expect(
      activityMatchesDateRange(lateNight, { startDate: '2026-10-10', endDate: '2026-10-10' }, 'America/New_York'),
    ).toBe(true);
    expect(
      activityMatchesDateRange(lateNight, { startDate: '2026-10-11', endDate: '2026-10-11' }, 'America/New_York'),
    ).toBe(true);

    // Multi-day festival: Friday Oct 9 12:00 EDT through Sunday Oct 11 18:00 EDT
    const multiDay = makeActivity({
      id: 'festival',
      startsAtIso: '2026-10-09T16:00:00.000Z',
      endsAtIso: '2026-10-11T22:00:00.000Z',
    });
    expect(
      activityMatchesDateRange(multiDay, { startDate: '2026-10-10', endDate: '2026-10-10' }, 'America/New_York'),
    ).toBe(true);
  });

  it('filters buildFeed by custom date range while preserving Family/Everyone mode rules', () => {
    const todayEvent = makeActivity({
      id: 'today-evt',
      title: 'Wednesday Night Talk',
      rating: 'general',
      startsAtIso: '2026-10-08T03:00:00.000Z', // 23:00 EDT on Oct 7
    });
    const saturdayGeneral = makeActivity({
      id: 'sat-general',
      title: 'Riverside Arts Market',
      rating: 'general',
      startsAtIso: '2026-10-10T14:00:00.000Z', // 10:00 EDT on Oct 10
    });
    const saturdayFamily = makeActivity({
      id: 'sat-family',
      title: 'Saturday Storytime',
      rating: 'family',
      startsAtIso: '2026-10-10T15:00:00.000Z', // 11:00 EDT on Oct 10
    });
    const saturdayMature = makeActivity({
      id: 'sat-mature',
      title: 'Late Night Burlesque',
      rating: 'mature',
      startsAtIso: '2026-10-11T02:00:00.000Z', // 22:00 EDT on Oct 10
    });

    const weekendEveryone = buildFeed(
      [todayEvent, saturdayGeneral, saturdayFamily, saturdayMature],
      makeInput({
        mode: 'everyone',
        dateFilter: { preset: 'custom', startDate: '2026-10-10', endDate: '2026-10-11' },
      }),
    );
    expect(weekendEveryone.items.map((item) => item.id)).toEqual(['sat-general']);
    expect(weekendEveryone.emptyReason).toBe('none');

    const weekendFamily = buildFeed(
      [todayEvent, saturdayGeneral, saturdayFamily, saturdayMature],
      makeInput({
        mode: 'family',
        dateFilter: { preset: 'custom', startDate: '2026-10-10', endDate: '2026-10-11' },
      }),
    );
    expect(weekendFamily.items.map((item) => item.id)).toEqual(['sat-family']);
    expect(weekendFamily.emptyReason).toBe('none');
  });

  it('uses the existing no-match reason for an unmatched window, including beyond the catalog horizon', () => {
    const todayEvent = makeActivity({
      id: 'today-evt',
      title: 'Wednesday Night Talk',
      startsAtIso: '2026-10-08T03:00:00.000Z',
    });

    const noDateMatch = buildFeed(
      [todayEvent],
      makeInput({
        dateFilter: { preset: 'custom', startDate: '2026-10-20', endDate: '2026-10-21' },
      }),
    );
    expect(noDateMatch.items).toEqual([]);
    expect(noDateMatch.emptyReason).toBe('no-match');

    const beyondHorizon = buildFeed(
      [todayEvent],
      makeInput({
        dateFilter: { preset: 'custom', startDate: '2027-01-15', endDate: '2027-01-17' },
      }),
    );
    expect(beyondHorizon.items).toEqual([]);
    expect(beyondHorizon.emptyReason).toBe('no-match');
  });

  it('validates custom date inputs and rejects past or inverted ranges', () => {
    expect(parseCustomDateRange('bad-date', '', '2026-10-07')).toEqual({
      ok: false,
      error: 'Enter a valid start date as YYYY-MM-DD.',
    });
    expect(parseCustomDateRange('2026-10-12', '2026-10-10', '2026-10-07')).toEqual({
      ok: false,
      error: 'End date must be on or after the start date.',
    });
    expect(parseCustomDateRange('2026-10-01', '2026-10-05', '2026-10-07')).toEqual({
      ok: false,
      error: 'Choose today or a future date.',
    });
    expect(parseCustomDateRange('2026-10-15', '', '2026-10-07')).toEqual({
      ok: true,
      startDate: '2026-10-15',
      endDate: '2026-10-15',
    });
  });

  it('does not let saved Going fill an unmatched Discover window', () => {
    const event = makeActivity({ startsAtIso: '2026-10-08T03:00:00Z' });
    const input = makeInput({ dateFilter: { preset: 'custom', startDate: '2026-10-20', endDate: '2026-10-21' } });
    const saved = buildFeed([event], { ...input, pinnedIds: new Set([event.id]) });
    expect(saved.items).toEqual([]);
    expect(saved.emptyReason).toBe('no-match');
    const unsaved = buildFeed([event], input);
    expect(unsaved.items).toEqual([]);
    expect(unsaved.emptyReason).toBe('no-match');
    expect(buildFeed([event], { ...input, pinnedIds: new Set([event.id]), dateFilter: { preset: 'custom', startDate: '2027-01-15' } }).items).toHaveLength(0);
  });

  it('does not let Going bypass mode, radius, search, cancellation or expiry', () => {
    const event = makeActivity({ startsAtIso: '2026-10-08T03:00:00Z' });
    const input = makeInput({ pinnedIds: new Set([event.id]), dateFilter: { preset: 'tomorrow' } });
    for (const activity of [{ ...event, rating: 'mature' as const }, { ...event, lat: 30 }, { ...event, isCancelled: true }, { ...event, startsAtIso: '2026-01-01T00:00:00Z' }]) {
      expect(buildFeed([activity], input).items).toEqual([]);
    }
    expect(buildFeed([event], { ...input, query: 'not this event' }).items).toEqual([]);
  });

  it('filters exact half-open time bounds, ongoing intervals and unknown-end points in the destination timezone', () => {
    const range = resolveDateFilterRange({ preset: 'custom', startDate: '2026-10-10', startTime: '10:00', endTime: '12:00' }, FIXED_NOW, 'America/New_York')!;
    expect(range.startUtcMs).toBe(Date.parse('2026-10-10T14:00:00Z'));
    expect(range.endUtcMs).toBe(Date.parse('2026-10-10T16:00:00Z'));
    const cases: [string, string | undefined, boolean][] = [
      ['2026-10-10T14:00:00Z', undefined, true],
      ['2026-10-10T16:00:00Z', undefined, false],
      ['2026-10-10T13:00:00Z', '2026-10-10T14:00:00Z', false],
      ['2026-10-10T13:00:00Z', '2026-10-10T14:30:00Z', true],
      ['2026-10-10T13:00:00Z', undefined, false],
    ];
    for (const [startsAtIso, endsAtIso, expected] of cases) {
      expect(activityMatchesDateRange(makeActivity({ startsAtIso, endsAtIso }), range)).toBe(expected);
    }
    const events = cases.map(([startsAtIso, endsAtIso], i) => makeActivity({ id: `time-${i}`, startsAtIso, endsAtIso }));
    expect(buildFeed(events, makeInput({ dateFilter: { preset: 'custom', startDate: '2026-10-10', startTime: '10:00', endTime: '12:00' } })).items.map(a=>a.id).sort()).toEqual(['time-0','time-3']);
  });

  it('uses real DST day lengths and rejects skipped/repeated custom boundary times', () => {
    const fall = resolveDateFilterRange({ preset: 'today' }, Date.parse('2026-11-01T16:00:00Z'), 'America/New_York')!;
    const spring = resolveDateFilterRange({ preset: 'today' }, Date.parse('2027-03-14T16:00:00Z'), 'America/New_York')!;
    expect(fall.endUtcMs - fall.startUtcMs).toBe(25 * 3600000);
    expect(spring.endUtcMs - spring.startUtcMs).toBe(23 * 3600000);
    expect(parseCustomDateRange('2026-11-01', '', '2026-10-07', '01:30', '03:00', 'America/New_York').ok).toBe(false);
    expect(parseCustomDateRange('2027-03-14', '', '2027-03-01', '02:30', '04:00', 'America/New_York').ok).toBe(false);
    expect(parseCustomDateRange('2026-10-10', '', '2026-10-07', '25:00').ok).toBe(false);
    expect(parseCustomDateRange('2026-10-10', '', '2026-10-07', '12:00', '10:00').ok).toBe(false);
    const nepal = resolveDateFilterRange({ preset: 'today' }, FIXED_NOW, 'Asia/Kathmandu')!;
    expect(nepal.startUtcMs).toBe(Date.parse('2026-10-07T18:15:00Z'));
  });

  it('keeps an already applied custom window resolvable after the clock passes it', () => {
    const filter = { preset: 'custom' as const, startDate: '2026-10-10', startTime: '10:00', endTime: '12:00' };
    const before = resolveDateFilterRange(filter, FIXED_NOW, 'America/New_York')!;
    const after = resolveDateFilterRange(filter, Date.parse('2026-10-12T16:00:00Z'), 'America/New_York')!;
    expect(after.startUtcMs).toBe(before.startUtcMs);
    expect(after.endUtcMs).toBe(before.endUtcMs);
  });
});
