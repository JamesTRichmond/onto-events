import { venueTimeIso } from '../venue-time';
test('uses Eastern time rather than the viewer clock', () =>
  expect(venueTimeIso('2026-10-10', '19:00', 'America/New_York')).toBe(
    '2026-10-10T23:00:00.000Z',
  ));
test('rejects missing and repeated DST clock times', () => {
  expect(() =>
    venueTimeIso('2026-03-08', '02:30', 'America/New_York'),
  ).toThrow();
  expect(() =>
    venueTimeIso('2026-11-01', '01:30', 'America/New_York'),
  ).toThrow();
});
test('rejects impossible dates', () =>
  expect(() =>
    venueTimeIso('2026-02-30', '15:00', 'America/New_York'),
  ).toThrow());
