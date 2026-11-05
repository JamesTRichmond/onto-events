// onto backend domain contracts.
//
// This module contains no transport implementation and no Supabase import.
// App code depends on these interfaces; the concrete provider can change
// without leaking database mechanics into screens or hooks.

export type EventRating = 'family' | 'general' | 'mature';

export type EventCategory =
  | 'community'
  | 'fitness'
  | 'food'
  | 'sales'
  | 'games'
  | 'hiking'
  | 'music'
  | 'nightlife'
  | 'outdoors'
  | 'roadtrip'
  | 'sports'
  | 'arts'
  | 'learning'
  | 'other';

export type RsvpStatus = 'going' | 'interested' | 'cancelled';

export type ReportReason =
  | 'harassment'
  | 'spam'
  | 'impersonation'
  | 'unsafe_behavior'
  | 'sexual_content'
  | 'hate_or_abuse'
  | 'minor_safety'
  | 'other';

export type PresenceVisibility = 'private' | 'connections' | 'public';

export interface AuthSession {
  userId: string;
  accessToken: string;
  expiresAt: string | null;
}

export interface AuthUser {
  id: string;
  email: string | null;
  createdAt: string;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  homeCity: string | null;
  ageGateConfirmed: boolean;
  isDiscoverable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  homeCity?: string | null;
  ageGateConfirmed?: boolean;
  isDiscoverable?: boolean;
}

export interface CatalogEvent {
  hosted?: { meetingInstructions: string; newcomersWelcome: boolean };
  id: string;
  sourceName: string;
  sourceEventId: string;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  venueName: string | null;
  locality: string | null;
  region: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  category: EventCategory;
  rating: EventRating;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  imageUrl: string | null;
  isCancelled: boolean;
  isRoadtrip: boolean;
  ingestedAt: string;
  updatedAt: string;
  eventFacts?: import('@/lib/event-facts').EventFacts;
}

export interface CatalogFreshness {
  sourceName: string;
  completedAt: string;
  recordCount: number;
  rejectedCount: number;
}

export interface CatalogEventQuery {
  serviceRegion?: import('@/lib/service-region').ServiceRegionId;
  from?: string;
  to?: string;
  categories?: EventCategory[];
  ratings?: EventRating[];
  locality?: string;
  limit?: number;
  cursor?: string;
}

export interface CatalogEventPage {
  items: CatalogEvent[];
  nextCursor: string | null;
}

export interface EventRsvp {
  userId: string;
  eventId: string;
  status: RsvpStatus;
  shareWithConnections: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SetRsvpInput {
  eventId: string;
  status: RsvpStatus;
  shareWithConnections?: boolean;
}

export interface RsvpHistoryItem {
  eventId: string;
  status: RsvpStatus;
  title: string;
  venueName: string | null;
  startsAt: string;
  endsAt: string | null;
  sourceUrl: string | null;
  rsvpUpdatedAt: string;
}

export interface UserBlock {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface UserReport {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  eventId: string | null;
  reason: ReportReason;
  details: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
}

export interface CreateReportInput {
  reportedUserId?: string;
  eventId?: string;
  reason: ReportReason;
  details?: string;
  evidence?: Record<string, unknown>;
}

export interface UserPresence {
  userId: string;
  statusText: string | null;
  coarseArea: string | null;
  visibility: PresenceVisibility;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetPresenceInput {
  statusText?: string | null;
  coarseArea?: string | null;
  visibility: PresenceVisibility;
  expiresAt?: string | null;
}

export type AuthState =
  | { kind: 'signed-out' }
  | { kind: 'loading' }
  | { kind: 'signed-in'; user: AuthUser; session: AuthSession };

export type BackendErrorCode =
  | 'not-authenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'invalid-input'
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'unknown';

export class BackendError extends Error {
  readonly code: BackendErrorCode;
  readonly causeValue: unknown;

  constructor(code: BackendErrorCode, message: string, causeValue?: unknown) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    this.causeValue = causeValue;
  }
}

export interface AuthBackend {
  signInWithApple?(input: { token: string; nonce: string; authorizationCode?: string }): Promise<void>;
  getState(): Promise<AuthState>;
  /** Sends a short-lived email OTP; it never creates a password. */
  signInWithEmail(email: string): Promise<void>;
  verifyEmailOtp(email: string, token: string): Promise<void>;
  signOut(): Promise<void>;
  /** Deletes only the account the person confirmed, even if the session changes. */
  deleteAccount(expectedUserId: string): Promise<void>;
  onStateChange(listener: (state: AuthState) => void): () => void;
}

export interface ProfileBackend {
  getMyProfile(): Promise<UserProfile | null>;
  updateMyProfile(input: UpdateProfileInput): Promise<UserProfile>;
  getDiscoverableProfile(userId: string): Promise<UserProfile | null>;
}

export interface EventCatalogBackend {
  listEvents(query?: CatalogEventQuery): Promise<CatalogEventPage>;
  getEvent(eventId: string): Promise<CatalogEvent | null>;
  getCatalogFreshness(): Promise<CatalogFreshness | null>;
}

export interface RsvpBackend {
  listMyRsvps(): Promise<EventRsvp[]>;
  listMyRsvpHistory(): Promise<RsvpHistoryItem[]>;
  setRsvp(input: SetRsvpInput): Promise<EventRsvp>;
  removeRsvp(eventId: string): Promise<void>;
}

/** Protected community ports bind to the identity displayed by the app. */
export interface AccountCommunityBackends {
  readonly hosting?: import('@/lib/community').HostingBackend;
  readonly reviews?: import('@/lib/community').ReviewsBackend;
  readonly reviewer?: import('@/lib/community').ReviewerBackend;
}

/** Private profile and plan ports bind to the identity displayed by the app. */
export interface AccountPrivateBackends {
  readonly profile?: Pick<ProfileBackend, 'getMyProfile' | 'updateMyProfile'>;
  readonly rsvp?: RsvpBackend;
}

/** Account-scoped capabilities must share the same authenticated identity. */
export interface AccountModule extends AccountCommunityBackends, AccountPrivateBackends {
  /** Production transports create stable protected ports for this owner. */
  readonly communityForAccount?: (ownerId: string) => AccountCommunityBackends;
  readonly privateForAccount?: (ownerId: string) => AccountPrivateBackends;
  readonly auth: AuthBackend;
  /** Starts optional transport listeners; returns their cleanup function. */
  readonly start?: () => () => void;
}

/** Omitted modules are off. Discovery and local plans need neither module. */
export interface BackendModules {
  readonly publicReviews?: import('@/lib/community').PublicReviewsBackend;
  readonly catalog?: EventCatalogBackend;
  readonly account?: AccountModule;
}

export interface SafetyBackend {
  listMyBlocks(): Promise<UserBlock[]>;
  blockUser(userId: string): Promise<UserBlock>;
  unblockUser(userId: string): Promise<void>;
  createReport(input: CreateReportInput): Promise<UserReport>;
  listMyReports(): Promise<UserReport[]>;
}

export interface PresenceBackend {
  getMyPresence(): Promise<UserPresence | null>;
  setMyPresence(input: SetPresenceInput): Promise<UserPresence>;
  clearMyPresence(): Promise<void>;
  getPublicPresence(userId: string): Promise<UserPresence | null>;
}

export interface OntoBackend
  extends AuthBackend,
    ProfileBackend,
    EventCatalogBackend,
    RsvpBackend,
    SafetyBackend,
    PresenceBackend {
  readonly contractVersion: 1;
}

export const BACKEND_CONTRACT_VERSION = 1 as const;

export const DEFAULT_EVENT_PAGE_SIZE = 50;
export const MAX_EVENT_PAGE_SIZE = 200;
export const MAX_PROFILE_NAME_LENGTH = 60;
export const MAX_PROFILE_BIO_LENGTH = 500;
export const MAX_HOME_CITY_LENGTH = 120;
export const MAX_STATUS_TEXT_LENGTH = 160;
export const MAX_COARSE_AREA_LENGTH = 120;
export const MAX_REPORT_DETAILS_LENGTH = 4000;

export function normalizeEventPageSize(value?: number): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_EVENT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_EVENT_PAGE_SIZE, Math.floor(value)));
}

export function assertNonEmptyId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BackendError('invalid-input', `${field} is required`);
  }
  return normalized;
}

export function validateProfileUpdate(input: UpdateProfileInput): UpdateProfileInput {
  if (input.displayName != null) {
    const name = input.displayName.trim();
    if (!name || name.length > MAX_PROFILE_NAME_LENGTH) {
      throw new BackendError(
        'invalid-input',
        `displayName must be 1-${MAX_PROFILE_NAME_LENGTH} characters`,
      );
    }
  }

  if (input.bio != null && input.bio.length > MAX_PROFILE_BIO_LENGTH) {
    throw new BackendError(
      'invalid-input',
      `bio must be at most ${MAX_PROFILE_BIO_LENGTH} characters`,
    );
  }

  if (input.homeCity != null && input.homeCity.length > MAX_HOME_CITY_LENGTH) {
    throw new BackendError(
      'invalid-input',
      `homeCity must be at most ${MAX_HOME_CITY_LENGTH} characters`,
    );
  }

  if (input.avatarUrl != null && !input.avatarUrl.startsWith('https://')) {
    throw new BackendError('invalid-input', 'avatarUrl must use https');
  }

  return input;
}

export function validateReport(input: CreateReportInput): CreateReportInput {
  const hasUserTarget = Boolean(input.reportedUserId?.trim());
  const hasEventTarget = Boolean(input.eventId?.trim());

  if (!hasUserTarget && !hasEventTarget) {
    throw new BackendError('invalid-input', 'a report needs a user or event target');
  }

  if (input.details != null && input.details.length > MAX_REPORT_DETAILS_LENGTH) {
    throw new BackendError(
      'invalid-input',
      `report details must be at most ${MAX_REPORT_DETAILS_LENGTH} characters`,
    );
  }

  return input;
}

export function validatePresence(input: SetPresenceInput): SetPresenceInput {
  if (input.statusText != null && input.statusText.length > MAX_STATUS_TEXT_LENGTH) {
    throw new BackendError(
      'invalid-input',
      `statusText must be at most ${MAX_STATUS_TEXT_LENGTH} characters`,
    );
  }

  if (input.coarseArea != null && input.coarseArea.length > MAX_COARSE_AREA_LENGTH) {
    throw new BackendError(
      'invalid-input',
      `coarseArea must be at most ${MAX_COARSE_AREA_LENGTH} characters`,
    );
  }

  if (input.expiresAt != null) {
    const parsed = Date.parse(input.expiresAt);
    if (!Number.isFinite(parsed)) {
      throw new BackendError('invalid-input', 'expiresAt must be an ISO date');
    }
  }

  return input;
}
