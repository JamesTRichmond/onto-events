import { reportedTarget } from '../community-reports';
import type { CommunityReport, HostedSubmission, OwnReview, PublicVenue } from '../community';

const host = { id: 'same-id', state: 'approved', version: 3, title: 'Public games', description: 'Library games', meetingInstructions: 'Public desk', startsAt: '2099-01-01T18:00:00Z', endsAt: '2099-01-01T20:00:00Z' } as HostedSubmission;
const review: OwnReview = { id: 'same-id', state: 'approved', version: 7, eventId: 'event', score: 4, text: 'Clear public meeting point', reviewNote: null };
const report: CommunityReport = { id: 'report', kind: 'host', targetId: 'same-id', reason: 'Accuracy', resolved: false };

it('resolves an exact ID and content kind, even when titles or IDs overlap', () => {
  expect(reportedTarget(report, [{ ...host, id: 'other-id', version: 9 }, host], [review])).toMatchObject({ kind: 'host', id: 'same-id', version: 3 });
  expect(reportedTarget({ ...report, kind: 'review' }, [host], [review])).toMatchObject({ kind: 'review', id: 'same-id', version: 7 });
});

it('never guesses a missing target from a similar title or another content kind', () => {
  expect(reportedTarget({ ...report, targetId: 'missing' }, [host], [review])).toBeNull();
  expect(reportedTarget({ ...report, kind: 'unexpected' }, [host], [review])).toBeNull();
  expect(reportedTarget(report, [], [review])).toBeNull();
});

it('excludes resolved reports and content that is no longer approved', () => {
  expect(reportedTarget({ ...report, resolved: true }, [host], [review])).toBeNull();
  expect(reportedTarget(report, [{ ...host, state: 'pending' }], [review])).toBeNull();
  expect(reportedTarget({ ...report, kind: 'review' }, [host], [{ ...review, state: 'rejected' }])).toBeNull();
});

it.each([0, NaN, 1.5])('does not produce a removal target with invalid version %s', (version) => {
  expect(reportedTarget(report, [{ ...host, version }], [review])).toBeNull();
});

it.each([
  ['America/New_York', '1:00 PM'], ['America/Denver', '11:00 AM'],
])('shows the public venue and its local time in %s', (timezone, localTime) => {
  const venue: PublicVenue = { id: 'library', name: 'Public Library', locality: 'City', region: 'VT', timezone, serviceRegion: 'vermont-corridor' };
  const value = reportedTarget(report, [{ ...host, venueId: venue.id, startsAt: '2026-11-10T18:00:00Z' }], [], [venue]);
  expect(value?.details).toContain('Public Library');
  expect(value?.details).toContain(localTime);
  expect(value?.details).not.toContain('2026-11-10T18:00:00Z');
});
