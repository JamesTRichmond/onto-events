import type { Activity } from '@/data/activities';
import { feedSection } from '../feed-section';

const item = (startsAtIso?: string) => ({ startsAtIso, startsInMinutes: 0 }) as Activity;
const zone = 'America/Denver';

// Monday 14:10 MDT; the event is at 17:30 the same label-day.
const quietAfternoon = Date.parse('2026-08-31T20:10:00Z');
const laterToday = '2026-08-31T23:30:00Z';

it('admits a quiet afternoon in the heading, in the night-owl voice', () => {
  expect(feedSection(item(laterToday), quietAfternoon, zone, true)).toBe('things to do • scroll');
  expect(feedSection(item(laterToday), quietAfternoon, zone, false)).toBe('things to do • scroll');
  expect(feedSection(item(laterToday), quietAfternoon, zone)).toBe('things to do • scroll');
});

it('changes only the label-day heading: other headings are unaffected by quiet', () => {
  expect(feedSection(item('2026-09-05T02:00:00Z'), quietAfternoon, zone, true)).toBe('onto activities coming up');
  expect(feedSection(item(), quietAfternoon, zone, true)).toBe('Places to explore');
  expect(feedSection({ ...item(), source: 'live' } as Activity, quietAfternoon, zone, true)).toBe('Check event times');
  expect(feedSection(item(laterToday), null, zone, true)).toBeNull();
});

it('never mislabels something already underway', () => {
  // quiet is the caller's claim; an underway item contradicts it and wins.
  expect(feedSection(item('2026-08-31T20:00:00Z'), quietAfternoon, zone, true)).toBe('onto activities happening now');
});
