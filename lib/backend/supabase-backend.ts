import { getServiceRegion, regionLocalities } from '@/lib/service-region';
import type { User } from '@supabase/supabase-js';
import { readEventFacts } from '@/lib/event-facts';

import {
  BACKEND_CONTRACT_VERSION,
  BackendError,
  type CatalogEvent,
  type CatalogEventPage,
  type CatalogEventQuery,
  type CatalogFreshness,
  type CreateReportInput,
  type EventRsvp,
  normalizeEventPageSize,
  type OntoBackend,
  type SetPresenceInput,
  type SetRsvpInput,
  type RsvpHistoryItem,
  type UpdateProfileInput,
  type UserBlock,
  type UserPresence,
  type UserProfile,
  type UserReport,
  assertNonEmptyId,
  validatePresence,
  validateProfileUpdate,
  validateReport,
} from './contracts';
import { SupabaseAuthBackend, toBackendError } from './supabase-auth';
import type { OntoSupabaseClient } from './supabase-client';
import type { AccountTokenVerifier } from './account-token-verifier';

type JsonRecord = Record<string, unknown>;
type PrivateAccount = { userId: string; token: string };

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function requiredString(row: JsonRecord, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new BackendError('server', `Backend returned an invalid ${key}`);
  }
  return value;
}

function optionalString(row: JsonRecord, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function requiredBoolean(row: JsonRecord, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') {
    throw new BackendError('server', `Backend returned an invalid ${key}`);
  }
  return value;
}

function optionalNumber(row: JsonRecord, key: string): number | null {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requiredNumber(row: JsonRecord, key: string): number {
  const value = optionalNumber(row, key);
  if (value == null) {
    throw new BackendError('server', `Backend returned an invalid ${key}`);
  }
  return value;
}

export function mapCatalogFreshness(value: unknown): CatalogFreshness {
  const row = record(value);
  return {
    sourceName: requiredString(row, 'source_name'),
    completedAt: requiredString(row, 'completed_at'),
    recordCount: requiredNumber(row, 'record_count'),
    rejectedCount: requiredNumber(row, 'rejected_count'),
  };
}

export function mapCatalogEvent(value: unknown): CatalogEvent {
  const row = record(value);
  const facts = readEventFacts(record(row.provenance).eventFacts);
  return {
    ...(row.source_name === 'onto community' && typeof record(record(row.provenance).hosted).meetingInstructions === 'string' ? { hosted: { meetingInstructions: String(record(record(row.provenance).hosted).meetingInstructions).slice(0,500), newcomersWelcome: record(record(row.provenance).hosted).newcomersWelcome === true } } : {}),
    id: requiredString(row, 'id'),
    sourceName: requiredString(row, 'source_name'),
    sourceEventId: requiredString(row, 'source_event_id'),
    sourceUrl: optionalString(row, 'source_url'),
    title: requiredString(row, 'title'),
    description: optionalString(row, 'description'),
    venueName: optionalString(row, 'venue_name'),
    locality: optionalString(row, 'locality'),
    region: optionalString(row, 'region'),
    countryCode: requiredString(row, 'country_code'),
    latitude: optionalNumber(row, 'latitude'),
    longitude: optionalNumber(row, 'longitude'),
    category: requiredString(row, 'category') as CatalogEvent['category'],
    rating: requiredString(row, 'rating') as CatalogEvent['rating'],
    startsAt: requiredString(row, 'starts_at'),
    endsAt: optionalString(row, 'ends_at'),
    timezone: optionalString(row, 'timezone'),
    imageUrl: optionalString(row, 'image_url'),
    isCancelled: requiredBoolean(row, 'is_cancelled'),
    isRoadtrip: requiredBoolean(row, 'is_roadtrip'),
    ingestedAt: requiredString(row, 'ingested_at'),
    updatedAt: requiredString(row, 'updated_at'),
    ...(Object.keys(facts).length ? { eventFacts: facts } : {}),
  };
}

export function mapProfile(value: unknown): UserProfile {
  const row = record(value);
  return {
    userId: requiredString(row, 'user_id'),
    displayName: requiredString(row, 'display_name'),
    avatarUrl: optionalString(row, 'avatar_url'),
    bio: optionalString(row, 'bio'),
    homeCity: optionalString(row, 'home_city'),
    ageGateConfirmed: requiredBoolean(row, 'age_gate_confirmed'),
    isDiscoverable: requiredBoolean(row, 'is_discoverable'),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at'),
  };
}

export function mapRsvp(value: unknown): EventRsvp {
  const row = record(value);
  return {
    userId: requiredString(row, 'user_id'),
    eventId: requiredString(row, 'event_id'),
    status: requiredString(row, 'status') as EventRsvp['status'],
    shareWithConnections: requiredBoolean(row, 'share_with_connections'),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at'),
  };
}

export function mapRsvpHistoryItem(value: unknown): RsvpHistoryItem {
  const row = record(value);
  return {
    eventId: requiredString(row, 'event_id'),
    status: requiredString(row, 'status') as RsvpHistoryItem['status'],
    title: requiredString(row, 'title'),
    venueName: optionalString(row, 'venue_name'),
    startsAt: requiredString(row, 'starts_at'),
    endsAt: optionalString(row, 'ends_at'),
    sourceUrl: optionalString(row, 'source_url'),
    rsvpUpdatedAt: requiredString(row, 'rsvp_updated_at'),
  };
}

export function mapBlock(value: unknown): UserBlock {
  const row = record(value);
  return {
    blockerId: requiredString(row, 'blocker_id'),
    blockedId: requiredString(row, 'blocked_id'),
    createdAt: requiredString(row, 'created_at'),
  };
}

export function mapReport(value: unknown): UserReport {
  const row = record(value);
  return {
    id: requiredString(row, 'id'),
    reporterId: requiredString(row, 'reporter_id'),
    reportedUserId: optionalString(row, 'reported_user_id'),
    eventId: optionalString(row, 'event_id'),
    reason: requiredString(row, 'reason') as UserReport['reason'],
    details: optionalString(row, 'details'),
    evidence: record(row.evidence),
    createdAt: requiredString(row, 'created_at'),
  };
}

export function mapPresence(value: unknown): UserPresence {
  const row = record(value);
  return {
    userId: requiredString(row, 'user_id'),
    statusText: optionalString(row, 'status_text'),
    coarseArea: optionalString(row, 'coarse_area'),
    visibility: requiredString(row, 'visibility') as UserPresence['visibility'],
    expiresAt: optionalString(row, 'expires_at'),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: requiredString(row, 'updated_at'),
  };
}

function parseCursor(cursor?: string): number {
  if (cursor == null) return 0;
  if (!/^\d+$/.test(cursor)) {
    throw new BackendError('invalid-input', 'Event cursor is invalid');
  }
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) {
    throw new BackendError('invalid-input', 'Event cursor is invalid');
  }
  return offset;
}

function profileUpdateRow(input: UpdateProfileInput): JsonRecord {
  const row: JsonRecord = {};
  if (input.displayName !== undefined) row.display_name = input.displayName.trim();
  if (input.avatarUrl !== undefined) row.avatar_url = input.avatarUrl;
  if (input.bio !== undefined) row.bio = input.bio;
  if (input.homeCity !== undefined) row.home_city = input.homeCity;
  if (input.ageGateConfirmed !== undefined) {
    row.age_gate_confirmed = input.ageGateConfirmed;
  }
  if (input.isDiscoverable !== undefined) {
    row.is_discoverable = input.isDiscoverable;
  }
  return row;
}

async function requireUser(client: OntoSupabaseClient): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error) throw toBackendError(error, 'Could not verify the current account');
  if (!data.user) {
    throw new BackendError('not-authenticated', 'Sign in to use this feature');
  }
  return data.user;
}

function throwIfError(error: unknown, fallback: string): void {
  if (error) throw toBackendError(error, fallback);
}

export class SupabaseOntoBackend
  extends SupabaseAuthBackend
  implements OntoBackend
{
  readonly contractVersion = BACKEND_CONTRACT_VERSION;

  constructor(
    private readonly ontoClient: OntoSupabaseClient,
    emailRedirectTo?: string,
    private readonly expectedUserId?: string,
    private readonly verifyToken?: AccountTokenVerifier,
  ) {
    super(ontoClient, emailRedirectTo);
  }

  private async privateAccount(): Promise<PrivateAccount> {
    if (!this.expectedUserId) {
      throw new BackendError('not-authenticated', 'Sign in to use this feature');
    }
    if (!this.verifyToken) {
      throw new BackendError('server', 'Account verification is unavailable.');
    }
    const { data, error } = await this.ontoClient.auth.getSession();
    if (error) throw toBackendError(error, 'Could not verify your account');
    const session = data.session;
    if (!session || session.user.id !== this.expectedUserId || !session.access_token) {
      throw new BackendError('not-authenticated', 'Your account changed. Reopen this screen to continue.');
    }
    const token = session.access_token;
    // Verify the captured JWT rather than allowing Auth to choose a token
    // from a session that may change while verification is in flight.
    const verified = await this.verifyToken(token);
    if (verified.error) throw toBackendError(verified.error, 'Could not verify your account');
    if (verified.data.user?.id !== this.expectedUserId) {
      throw new BackendError('not-authenticated', 'Your account changed. Reopen this screen to continue.');
    }
    return { userId: this.expectedUserId, token };
  }

  private async profileForAccount(account: PrivateAccount): Promise<UserProfile | null> {
    const { data, error } = await this.ontoClient
      .from('profiles')
      .select('*')
      .eq('user_id', account.userId)
      .maybeSingle()
      .setHeader('Authorization', `Bearer ${account.token}`);
    throwIfError(error, 'Could not load your profile');
    return data ? mapProfile(data) : null;
  }

  async getMyProfile(): Promise<UserProfile | null> {
    return this.profileForAccount(await this.privateAccount());
  }

  async updateMyProfile(input: UpdateProfileInput): Promise<UserProfile> {
    validateProfileUpdate(input);
    const account = await this.privateAccount();
    const changes = profileUpdateRow(input);
    if (Object.keys(changes).length === 0) {
      const existing = await this.profileForAccount(account);
      if (!existing) throw new BackendError('not-found', 'Profile not found');
      return existing;
    }

    const { data, error } = await this.ontoClient
      .from('profiles')
      .update(changes)
      .eq('user_id', account.userId)
      .select('*')
      .single()
      .setHeader('Authorization', `Bearer ${account.token}`);
    throwIfError(error, 'Could not update your profile');
    return mapProfile(data);
  }

  async getDiscoverableProfile(userId: string): Promise<UserProfile | null> {
    const id = assertNonEmptyId(userId, 'userId');
    const { data, error } = await this.ontoClient
      .from('profiles')
      .select('*')
      .eq('user_id', id)
      .maybeSingle();
    throwIfError(error, 'Could not load that profile');
    return data ? mapProfile(data) : null;
  }

  async listEvents(query: CatalogEventQuery = {}): Promise<CatalogEventPage> {
    const limit = normalizeEventPageSize(query.limit);
    const offset = parseCursor(query.cursor);
    let request = this.ontoClient
      .from('active_events')
      .select('*')
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit);

    const region = query.serviceRegion ? getServiceRegion(query.serviceRegion) : undefined;
    if (region?.region && query.serviceRegion) {
      const b = region.bounds;
      request = request.eq('region', region.region!).eq('country_code', region.countryCode!).in('locality', regionLocalities(query.serviceRegion))
        .gte('latitude', b.latMin).lte('latitude', b.latMax).gte('longitude', b.lngMin).lte('longitude', b.lngMax);
    } else if (query.serviceRegion === 'utah') {
      request = request.gte('latitude', 36.5).lte('latitude', 44.5).gte('longitude', -115.5).lte('longitude', -108.5);
    }
    if (query.from) request = request.gte('starts_at', query.from);
    if (query.to) request = request.lte('starts_at', query.to);
    if (query.categories?.length) {
      request = request.in('category', query.categories);
    }
    if (query.ratings?.length) request = request.in('rating', query.ratings);
    if (query.locality) request = request.eq('locality', query.locality);

    const { data, error } = await request;
    throwIfError(error, 'Could not load nearby events');

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map(mapCatalogEvent),
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }

  async getCatalogFreshness(): Promise<CatalogFreshness | null> {
    const { data, error } = await this.ontoClient
      .from('catalog_sync_state')
      .select('*')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfError(error, 'Could not read catalog freshness');
    return data ? mapCatalogFreshness(data) : null;
  }

  async getEvent(eventId: string): Promise<CatalogEvent | null> {
    const id = assertNonEmptyId(eventId, 'eventId');
    const { data, error } = await this.ontoClient
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    throwIfError(error, 'Could not load that event');
    return data ? mapCatalogEvent(data) : null;
  }

  async listMyRsvps(): Promise<EventRsvp[]> {
    const account = await this.privateAccount();
    const { data, error } = await this.ontoClient
      .from('event_rsvps')
      .select('*')
      .eq('user_id', account.userId)
      .order('updated_at', { ascending: false })
      .setHeader('Authorization', `Bearer ${account.token}`);
    throwIfError(error, 'Could not load your RSVPs');
    return (data ?? []).map(mapRsvp);
  }

  async listMyRsvpHistory(): Promise<RsvpHistoryItem[]> {
    const account = await this.privateAccount();
    const { data, error } = await this.ontoClient.rpc('my_rsvp_history')
      .setHeader('Authorization', `Bearer ${account.token}`);
    throwIfError(error, 'Could not load your RSVP history');
    return (data ?? []).map(mapRsvpHistoryItem);
  }

  async setRsvp(input: SetRsvpInput): Promise<EventRsvp> {
    const account = await this.privateAccount();
    const eventId = assertNonEmptyId(input.eventId, 'eventId');
    const { data, error } = await this.ontoClient
      .from('event_rsvps')
      .upsert(
        {
          user_id: account.userId,
          event_id: eventId,
          status: input.status,
          share_with_connections: input.shareWithConnections ?? false,
        },
        { onConflict: 'user_id,event_id' },
      )
      .select('*')
      .single()
      .setHeader('Authorization', `Bearer ${account.token}`);
    throwIfError(error, 'Could not save your RSVP');
    return mapRsvp(data);
  }

  async removeRsvp(eventId: string): Promise<void> {
    const account = await this.privateAccount();
    const id = assertNonEmptyId(eventId, 'eventId');
    const { error } = await this.ontoClient
      .from('event_rsvps')
      .update({ status: 'cancelled' })
      .eq('user_id', account.userId)
      .eq('event_id', id)
      .setHeader('Authorization', `Bearer ${account.token}`);
    throwIfError(error, 'Could not remove your RSVP');
  }

  async listMyBlocks(): Promise<UserBlock[]> {
    const user = await requireUser(this.ontoClient);
    const { data, error } = await this.ontoClient
      .from('user_blocks')
      .select('*')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    throwIfError(error, 'Could not load blocked accounts');
    return (data ?? []).map(mapBlock);
  }

  async blockUser(userId: string): Promise<UserBlock> {
    const user = await requireUser(this.ontoClient);
    const blockedId = assertNonEmptyId(userId, 'userId');
    if (blockedId === user.id) {
      throw new BackendError('invalid-input', 'You cannot block your own account');
    }

    // DO NOTHING keeps repeat taps idempotent without granting UPDATE rights.
    const { error: insertError } = await this.ontoClient
      .from('user_blocks')
      .upsert(
        { blocker_id: user.id, blocked_id: blockedId },
        { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
      );
    throwIfError(insertError, 'Could not block that account');

    const { data, error: readError } = await this.ontoClient
      .from('user_blocks')
      .select('*')
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId)
      .single();
    throwIfError(readError, 'Could not load the blocked account');
    return mapBlock(data);
  }

  async unblockUser(userId: string): Promise<void> {
    const user = await requireUser(this.ontoClient);
    const blockedId = assertNonEmptyId(userId, 'userId');
    const { error } = await this.ontoClient
      .from('user_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId);
    throwIfError(error, 'Could not unblock that account');
  }

  async createReport(input: CreateReportInput): Promise<UserReport> {
    validateReport(input);
    const user = await requireUser(this.ontoClient);
    const { data, error } = await this.ontoClient
      .from('user_reports')
      .insert({
        reporter_id: user.id,
        reported_user_id: input.reportedUserId?.trim() || null,
        event_id: input.eventId?.trim() || null,
        reason: input.reason,
        details: input.details ?? null,
        evidence: input.evidence ?? {},
      })
      .select('*')
      .single();
    throwIfError(error, 'Could not submit the report');
    return mapReport(data);
  }

  async listMyReports(): Promise<UserReport[]> {
    const user = await requireUser(this.ontoClient);
    const { data, error } = await this.ontoClient
      .from('user_reports')
      .select('*')
      .eq('reporter_id', user.id)
      .order('created_at', { ascending: false });
    throwIfError(error, 'Could not load your reports');
    return (data ?? []).map(mapReport);
  }

  async getMyPresence(): Promise<UserPresence | null> {
    const user = await requireUser(this.ontoClient);
    const { data, error } = await this.ontoClient
      .from('user_presence')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    throwIfError(error, 'Could not load your presence');
    return data ? mapPresence(data) : null;
  }

  async setMyPresence(input: SetPresenceInput): Promise<UserPresence> {
    validatePresence(input);
    const user = await requireUser(this.ontoClient);
    const { data, error } = await this.ontoClient
      .from('user_presence')
      .upsert(
        {
          user_id: user.id,
          status_text: input.statusText ?? null,
          coarse_area: input.coarseArea ?? null,
          visibility: input.visibility,
          expires_at: input.expiresAt ?? null,
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();
    throwIfError(error, 'Could not update your presence');
    return mapPresence(data);
  }

  async clearMyPresence(): Promise<void> {
    const user = await requireUser(this.ontoClient);
    const { error } = await this.ontoClient
      .from('user_presence')
      .delete()
      .eq('user_id', user.id);
    throwIfError(error, 'Could not clear your presence');
  }

  async getPublicPresence(userId: string): Promise<UserPresence | null> {
    const id = assertNonEmptyId(userId, 'userId');
    const { data, error } = await this.ontoClient
      .from('user_presence')
      .select('*')
      .eq('user_id', id)
      .maybeSingle();
    throwIfError(error, 'Could not load that presence');
    return data ? mapPresence(data) : null;
  }
}
