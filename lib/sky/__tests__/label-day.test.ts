import { labelDay } from '../label-day';

const slc = (iso: string) => labelDay(Date.parse(iso), 'America/Denver');

describe('labelDay', () => {
  it('keeps Friday night until exactly 04:00 Saturday in the feed place', () => {
    expect(slc('2026-09-05T09:59:59.999Z')).toEqual({ date: '2026-09-04', weekday: 'Friday' });
    expect(slc('2026-09-05T10:00:00Z')).toEqual({ date: '2026-09-05', weekday: 'Saturday' });
  });

  it.each([
    ['2026-03-08T09:59:59Z', '2026-03-07', 'Saturday'], // Spring forward: 03:59 MDT.
    ['2026-03-08T10:00:00Z', '2026-03-08', 'Sunday'],
    ['2026-11-01T07:30:00Z', '2026-10-31', 'Saturday'], // First 01:30, MDT.
    ['2026-11-01T08:30:00Z', '2026-10-31', 'Saturday'], // Repeated 01:30, MST.
    ['2026-11-01T10:59:59Z', '2026-10-31', 'Saturday'], // 03:59 MST.
    ['2026-11-01T11:00:00Z', '2026-11-01', 'Sunday'],
  ])('uses wall-clock 04:00 across DST at %s', (iso, date, weekday) => {
    expect(slc(iso)).toEqual({ date, weekday });
  });

  it('labels the feed timezone rather than the viewer timezone', () => {
    const instant = Date.parse('2026-09-05T08:00:00Z');
    expect(labelDay(instant, 'America/Denver').weekday).toBe('Friday');
    expect(labelDay(instant, 'Asia/Tokyo').weekday).toBe('Saturday');
  });

  it.each([
    ['2026-01-01T07:00:00Z', '2025-12-31', 'Wednesday'], // Midnight, not hour 24.
    ['2024-03-01T10:00:00Z', '2024-02-29', 'Thursday'], // Leap day.
    ['2026-03-01T10:00:00Z', '2026-02-28', 'Saturday'],
  ])('rolls calendar boundaries correctly at %s', (iso, date, weekday) => {
    expect(slc(iso)).toEqual({ date, weekday });
  });

  it('does not silently fall back to a device timezone or invalid clock', () => {
    expect(() => labelDay(0, '')).toThrow(RangeError);
    expect(() => labelDay(0, 'Not/AZone')).toThrow(RangeError);
    expect(() => labelDay(NaN, 'America/Denver')).toThrow(RangeError);
    expect(() => labelDay(1e20, 'America/Denver')).toThrow(RangeError);
  });
});
