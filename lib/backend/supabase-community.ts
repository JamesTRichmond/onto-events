import type { OntoSupabaseClient } from './supabase-client';
import { toBackendError } from './supabase-auth';
import { BackendError } from './contracts';
import type { AccountTokenVerifier } from './account-token-verifier';
import { validateHosting, validateReview } from '@/lib/community';
import type {
  HostingBackend,
  ReviewsBackend,
  ReviewerBackend,
  HostingInput,
  HostedSubmission,
  OwnReview,
  PublicReview,
  PublicVenue,
  ReviewInput,
  PilotState,
} from '@/lib/community';
const host = (r: any): HostedSubmission => ({
  id: r.id,
  venueId: r.venue_id,
  title: r.title,
  description: r.description,
  meetingInstructions: r.meeting_instructions,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  category: r.category,
  newcomersWelcome: r.newcomers_welcome,
  ...(r.parent_event_id ? { parentEventId: r.parent_event_id } : {}),
  state: r.state,
  version: r.version,
  reviewNote: r.review_note,
});
const ownReview = (r: any): OwnReview => ({
  id: r.id,
  eventId: r.event_id,
  score: r.score,
  text: r.body,
  state: r.state,
  version: r.version,
  reviewNote: r.review_note,
});
export class SupabaseCommunity
  implements HostingBackend, ReviewsBackend, ReviewerBackend
{
  constructor(
    private readonly client: OntoSupabaseClient,
    private readonly expectedUserId?: string,
    private readonly verifyToken?: AccountTokenVerifier,
  ) {}
  private async protectedToken(): Promise<string> {
    if (!this.expectedUserId) {
      throw new BackendError('not-authenticated', 'Sign in to use this feature.');
    }
    if (!this.verifyToken) {
      throw new BackendError('server', 'Account verification is unavailable.');
    }
    const { data, error } = await this.client.auth.getSession();
    if (error) throw toBackendError(error, 'Could not verify your account.');
    const session = data.session;
    if (!session || session.user.id !== this.expectedUserId || !session.access_token) {
      throw new BackendError('not-authenticated', 'Your account changed. Reopen this screen to continue.');
    }
    const token = session.access_token;
    // Stored session metadata is not proof of ownership. Verify this exact
    // token with Auth, rather than asking it to select a mutable current token.
    const verified = await this.verifyToken(token);
    if (verified.error) throw toBackendError(verified.error, 'Could not verify your account.');
    if (verified.data.user?.id !== this.expectedUserId) {
      throw new BackendError('not-authenticated', 'Your account changed. Reopen this screen to continue.');
    }
    return token;
  }
  private async rpc(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<any> {
    const token = await this.protectedToken();
    // PostgREST owns this request header; a later SDK session change cannot
    // replace it with another account's JWT during transport dispatch.
    const { data, error } = await this.client.rpc(name, args)
      .setHeader('Authorization', `Bearer ${token}`);
    if (error)
      throw toBackendError(
        error,
        'This action is unavailable. Please try again later.',
      );
    return data;
  }
  private async rows(table: string): Promise<any[]> {
    const token = await this.protectedToken();
    const { data, error } = await this.client.from(table).select('*')
      .setHeader('Authorization', `Bearer ${token}`);
    if (error) throw toBackendError(error, 'Could not load this content');
    return data ?? [];
  }
  async getPilotState(): Promise<PilotState> {
    const value = await this.rpc('community_pilot_state');
    return {
      hosting: value.hosting === true,
      reviews: value.reviews === true,
      reviewer: value.reviewer === true,
    };
  }
  async listVenues(): Promise<PublicVenue[]> {
    return (await this.rows('community_venues')).map((r) => ({
      id: r.id,
      name: r.name,
      locality: r.locality,
      region: r.region,
      timezone: r.timezone,
      serviceRegion: r.service_region,
    }));
  }
  async listMyHosted(): Promise<HostedSubmission[]> {
    return (await this.rpc('my_hosted_submissions')).map(host);
  }
  async saveHosted(
    input: HostingInput,
    id?: string,
    submit = false,
  ): Promise<string> {
    const h = validateHosting(input);
    return this.rpc('save_hosted_submission', {
      submission_id: id ?? null,
      payload: {
        venue_id: h.venueId,
        title: h.title,
        description: h.description,
        meeting_instructions: h.meetingInstructions,
        starts_at: h.startsAt,
        ends_at: h.endsAt,
        category: h.category,
        newcomers_welcome: h.newcomersWelcome,
        parent_event_id: h.parentEventId ?? null,
      },
      submit,
    });
  }
  async cancelHosted(id: string): Promise<void> {
    await this.rpc('cancel_hosted_submission', { submission_id: id });
  }
  async listPublicReviews(eventId: string): Promise<PublicReview[]> {
    const { data, error } = await this.client
      .from('public_event_reviews')
      .select('id,event_id,score,body')
      .eq('event_id', eventId);
    if (error) throw toBackendError(error, 'Reviews unavailable');
    return (data ?? []).map((r) => ({
      id: r.id,
      eventId: r.event_id,
      score: r.score,
      text: r.body,
    }));
  }
  async listMyReviews(): Promise<OwnReview[]> {
    return (await this.rpc('my_event_reviews')).map(ownReview);
  }
  async saveReview(input: ReviewInput): Promise<string> {
    const r = validateReview(input);
    return this.rpc('submit_event_review', {
      event_id: r.eventId,
      score: r.score,
      body: r.text,
    });
  }
  async deleteReview(id: string): Promise<void> {
    await this.rpc('delete_event_review', { review_id: id });
  }
  async reportContent(
    kind: 'host' | 'review',
    id: string,
    reason: string,
  ): Promise<void> {
    await this.rpc('report_community_content', {
      target_kind: kind,
      target_id: id,
      reason,
    });
  }
  async listPendingHosts(): Promise<HostedSubmission[]> {
    return (await this.rows('hosted_submissions')).map(host);
  }
  async listPendingReviews(): Promise<OwnReview[]> {
    return (await this.rows('event_reviews')).map(ownReview);
  }
  async listReports() {
    return (await this.rows('community_reports')).map((r) => ({
      id: r.id,
      kind: r.target_kind,
      targetId: r.target_id,
      reason: r.reason,
      resolved: r.resolved,
    }));
  }
  async resolveReport(id: string): Promise<void> {
    await this.rpc('resolve_community_report', { report_id: id });
  }
  async moderate(
    kind: 'host' | 'review',
    id: string,
    version: number,
    approve: boolean,
    note: string,
  ): Promise<void> {
    await this.rpc('moderate_community_content', {
      target_kind: kind,
      target_id: id,
      expected_version: version,
      approve,
      note,
    });
  }
}
