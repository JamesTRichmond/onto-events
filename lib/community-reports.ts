import type {
  CommunityReport,
  HostedSubmission,
  OwnReview,
  PublicVenue,
} from './community';

export interface ReportedTarget {
  kind: 'host' | 'review';
  id: string;
  version: number;
  label: string;
  removalLabel: string;
  details: string;
}

/** A report identifies content; only its current approved queue version may be removed. */
export function reportedTarget(
  report: CommunityReport,
  hosts: readonly HostedSubmission[],
  reviews: readonly OwnReview[],
  venues: readonly PublicVenue[] = [],
): ReportedTarget | null {
  if (report.resolved) return null;
  const target =
    report.kind === 'host'
      ? hosts.find((host) => host.id === report.targetId)
      : report.kind === 'review'
        ? reviews.find((review) => review.id === report.targetId)
        : undefined;
  if (
    !target ||
    target.state !== 'approved' ||
    !Number.isSafeInteger(target.version) ||
    target.version < 1
  ) return null;
  if (report.kind === 'host') {
    const host = target as HostedSubmission;
    const venue = venues.find((value) => value.id === host.venueId);
    const when = (iso: string) => {
      try {
        return new Date(iso).toLocaleString('en-US', {
          timeZone: venue?.timezone ?? 'UTC',
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        });
      } catch {
        return 'Time unavailable';
      }
    };
    return {
      kind: 'host',
      id: host.id,
      version: host.version,
      label: `Reported activity: ${host.title}`,
      removalLabel: `Remove reported activity: ${host.title}`,
      details: `${venue?.name ?? 'Public venue'}\n${when(host.startsAt)} – ${when(host.endsAt)}\n${host.description}\n${host.meetingInstructions}`,
    };
  }
  const review = target as OwnReview;
  return {
    kind: 'review',
    id: review.id,
    version: review.version,
    label: 'Reported review',
    removalLabel: 'Remove reported review',
    details: `${review.score}/5 · ${review.text}`,
  };
}
