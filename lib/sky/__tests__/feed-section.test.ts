import type { Activity } from '@/data/activities';
import { feedSection } from '../feed-section';

const item = (startsAtIso?: string) => ({ startsAtIso, startsInMinutes: 0 }) as Activity;
const zone = 'America/Denver';

it('labels a 03:59 Saturday event as Friday night, but not a 04:00 event', () => {
  const fridayNight = Date.parse('2026-09-05T08:00:00Z'); // Saturday 02:00 MDT
  expect(feedSection(item('2026-09-05T09:59:00Z'), fridayNight, zone)).toBe('things to do • scroll');
  expect(feedSection(item('2026-09-05T10:00:00Z'), fridayNight, zone)).toBe('onto activities coming up');
});

it('uses the actual start instant, not a rounded offset, at the rollover', () => {
  const now = Date.parse('2026-09-05T09:59:50Z');
  expect(feedSection(item('2026-09-05T10:00:01Z'), now, zone)).toBe('onto activities coming up');
  expect(feedSection(item('2026-09-05T09:59:55Z'), now, zone)).toBe('things to do • scroll');
});

it('has no export-time label or invented time for an undated guide', () => {
  expect(feedSection(item('2026-09-06T12:00:00Z'), null, zone)).toBeNull();
  expect(feedSection(item(), Date.parse('2026-09-06T12:00:00Z'), zone)).toBe('Places to explore');
  expect(feedSection(item('not a date'), Date.parse('2026-09-06T12:00:00Z'), zone)).toBe('Places to explore');
});

it('separates an undated guide from the dated heading before it', () => {
  const now = Date.parse('2026-09-06T12:00:00Z');
  const labels = [item('2026-09-07T12:00:00Z'), item(),
    { ...item(), source: 'live' } as Activity].map((entry) => feedSection(entry, now, zone));
  expect(labels).toEqual(['onto activities coming up', 'Places to explore', 'Check event times']);
});

it('labels a freshness-filtered event already underway honestly', () => {
  expect(feedSection(item('2026-09-06T12:00:00Z'), Date.parse('2026-09-06T12:30:00Z'), zone)).toBe('onto activities happening now');
});
