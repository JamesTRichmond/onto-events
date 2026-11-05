import {
  validateHosting,
  validateReview,
  arrivalPromptEligible,
} from '../community';
const valid = {
  title: 'Board games',
  description: 'A public meetup',
  venueId: 'public-library',
  meetingInstructions: 'Meet at the public entrance',
  startsAt: '2026-10-20T19:00:00-04:00',
  endsAt: '2026-10-20T21:00:00-04:00',
  category: 'games' as const,
  newcomersWelcome: true,
};
test('requires real future bounded occurrence times and public venues', () => {
  expect(validateHosting(valid, 0)).toEqual(valid);
  expect(() =>
    validateHosting({ ...valid, startsAt: '2026-10-20T19:00:00' }, 0),
  ).toThrow();
  expect(() =>
    validateHosting({ ...valid, endsAt: valid.startsAt }, 0),
  ).toThrow();
  expect(() => validateHosting({ ...valid, venueId: '' }, 0)).toThrow();
});
test('rejects private and adult host copy', () => {
  expect(() =>
    validateHosting({ ...valid, title: 'Private home games' }, 0),
  ).toThrow();
  expect(() =>
    validateHosting({ ...valid, category: 'nightlife' }, 0),
  ).toThrow();
});
test('reviews need a bounded score and explicit text', () => {
  expect(
    validateReview({ eventId: 'e', score: 4, text: 'Helpful' }).score,
  ).toBe(4);
  expect(() =>
    validateReview({ eventId: 'e', score: NaN, text: 'x' }),
  ).toThrow();
});
test('arrival needs a saved plan and a bounded event window, never device position', () => {
  const event = {
    startsAt: '2026-10-10T19:00:00Z',
    endsAt: '2026-10-10T21:00:00Z',
  };
  expect(
    arrivalPromptEligible(event, true, Date.parse('2026-10-10T19:00:00Z')),
  ).toBe(true);
  expect(arrivalPromptEligible(event, false, Date.parse(event.startsAt))).toBe(
    false,
  );
  expect(
    arrivalPromptEligible(event, true, Date.parse('2026-10-11T19:00:00Z')),
  ).toBe(false);
});
