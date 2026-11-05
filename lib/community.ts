import type { EventCategory, CatalogEvent } from '@/lib/backend/contracts';
import type { ServiceRegionId } from './service-region';
import { isRestrictedListing } from './event-availability';
export type SubmissionState =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';
export interface PublicVenue {
  id: string;
  name: string;
  locality: string;
  region: string;
  timezone: string;
  serviceRegion: ServiceRegionId;
}
export interface HostingInput {
  venueId: string;
  title: string;
  description: string;
  meetingInstructions: string;
  startsAt: string;
  endsAt: string;
  category: EventCategory;
  newcomersWelcome: boolean;
  parentEventId?: string;
}
export interface HostedSubmission extends HostingInput {
  id: string;
  state: SubmissionState;
  version: number;
  reviewNote: string | null;
}
export interface ReviewInput {
  eventId: string;
  score: number;
  text: string;
}
export interface PublicReview extends ReviewInput {
  id: string;
}
export interface OwnReview extends PublicReview {
  state: SubmissionState;
  version: number;
  reviewNote: string | null;
}
export interface PilotState {
  hosting: boolean;
  reviews: boolean;
  reviewer: boolean;
}
export interface CommunityReport {
  id: string;
  kind: string;
  targetId: string;
  reason: string;
  resolved: boolean;
}
export interface HostingBackend {
  getPilotState(): Promise<PilotState>;
  listVenues(): Promise<PublicVenue[]>;
  listMyHosted(): Promise<HostedSubmission[]>;
  saveHosted(
    input: HostingInput,
    id?: string,
    submit?: boolean,
  ): Promise<string>;
  cancelHosted(id: string): Promise<void>;
}
export interface ReviewsBackend {
  listPublicReviews(eventId: string): Promise<PublicReview[]>;
  listMyReviews(): Promise<OwnReview[]>;
  saveReview(input: ReviewInput): Promise<string>;
  deleteReview(id: string): Promise<void>;
  reportContent(
    kind: 'host' | 'review',
    id: string,
    reason: string,
  ): Promise<void>;
}
export type PublicReviewsBackend = Pick<ReviewsBackend, 'listPublicReviews'>;
export interface ReviewerBackend {
  listPendingHosts(): Promise<HostedSubmission[]>;
  listPendingReviews(): Promise<OwnReview[]>;
  listReports(): Promise<CommunityReport[]>;
  resolveReport(id: string): Promise<void>;
  moderate(
    kind: 'host' | 'review',
    id: string,
    version: number,
    approve: boolean,
    note: string,
  ): Promise<void>;
}
export function validateHosting(
  input: HostingInput,
  now = Date.now(),
): HostingInput {
  if (
    !input.venueId ||
    !input.title.trim() ||
    input.title.length > 240 ||
    !input.description.trim() ||
    input.description.length > 4000 ||
    !input.meetingInstructions.trim() ||
    input.meetingInstructions.length > 500
  )
    throw new Error(
      'Add a public venue, title, description and meeting instructions.',
    );
  const start = Date.parse(input.startsAt),
    end = Date.parse(input.endsAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start <= now ||
    end <= start ||
    end - start > 24 * 60 * 60 * 1000
  )
    throw new Error(
      'Choose explicit future start and end times, no more than one day apart.',
    );
  if (
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(input.startsAt) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(input.endsAt)
  )
    throw new Error('Include the timezone offset in both times.');
  if (
    ['nightlife', 'roadtrip'].includes(input.category) ||
    /(?:\b(?:21|18)\+|\b(?:adults? only|private home|my house|home address)\b)/i.test(
      `${input.title} ${input.description} ${input.meetingInstructions}`,
    ) ||
    isRestrictedListing(input.title, input.description)
  )
    throw new Error('This pilot accepts public Everyone activities only.');
  return {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    meetingInstructions: input.meetingInstructions.trim(),
  };
}
export function validateReview(input: ReviewInput): ReviewInput {
  if (
    !input.eventId ||
    !Number.isInteger(input.score) ||
    input.score < 1 ||
    input.score > 5 ||
    !input.text.trim() ||
    input.text.length > 1000
  )
    throw new Error('Choose 1–5 and write a review of up to 1,000 characters.');
  return { ...input, text: input.text.trim() };
}
export type ArrivalAnswer = 'easy' | 'hard' | 'skipped';
export function arrivalPromptEligible(
  event: Pick<CatalogEvent, 'startsAt' | 'endsAt'>,
  joined: boolean,
  now: number,
): boolean {
  const start = Date.parse(event.startsAt),
    end = Date.parse(event.endsAt ?? event.startsAt) + 2 * 60 * 60 * 1000;
  return (
    joined &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    now >= start - 30 * 60 * 1000 &&
    now <= end
  );
}
