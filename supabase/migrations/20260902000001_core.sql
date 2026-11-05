-- onto production backend foundation
-- Migration 20260902000001: canonical catalog, profiles, RSVP state, blocks, reports.
--
-- Principles:
--   1. Discovery remains readable without an account.
--   2. Social state is private by default.
--   3. A block takes effect before any social read/write.
--   4. Exact user location is never stored in this schema.
--   5. Client-writeable rows are always owner-scoped by RLS.
--   6. Service-role ingestion may upsert public event supply.

create extension if not exists pgcrypto;

create schema if not exists onto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

do $$ begin
  create type onto.event_rating as enum ('family', 'general', 'mature');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type onto.event_category as enum (
    'community',
    'fitness',
    'food',
    'sales',
    'games',
    'hiking',
    'music',
    'nightlife',
    'outdoors',
    'roadtrip',
    'sports',
    'arts',
    'learning',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type onto.rsvp_status as enum ('going', 'interested', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type onto.report_reason as enum (
    'harassment',
    'spam',
    'impersonation',
    'unsafe_behavior',
    'sexual_content',
    'hate_or_abuse',
    'minor_safety',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type onto.presence_visibility as enum ('private', 'connections', 'public');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------------

create or replace function onto.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function onto.current_user_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists onto.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  home_city text,
  age_gate_confirmed boolean not null default false,
  is_discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_display_name_length check (char_length(display_name) between 1 and 60),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 500),
  constraint profiles_home_city_length check (home_city is null or char_length(home_city) <= 120),
  constraint profiles_avatar_https check (avatar_url is null or avatar_url ~ '^https://')
);

create index if not exists profiles_discoverable_idx
  on onto.profiles (is_discoverable)
  where is_discoverable = true;

create trigger profiles_touch_updated_at
before update on onto.profiles
for each row execute function onto.touch_updated_at();

alter table onto.profiles enable row level security;

create policy profiles_read_self
on onto.profiles
for select
to authenticated
using (user_id = auth.uid());

create policy profiles_insert_self
on onto.profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy profiles_update_self
on onto.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy profiles_delete_self
on onto.profiles
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Canonical public event catalog
-- ---------------------------------------------------------------------------

create table if not exists onto.events (
  id text primary key,
  source_name text not null,
  source_event_id text not null,
  source_url text,
  title text not null,
  description text,
  venue_name text,
  locality text,
  region text,
  country_code text not null default 'US',
  latitude double precision,
  longitude double precision,
  category onto.event_category not null default 'other',
  rating onto.event_rating not null default 'general',
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text,
  image_url text,
  is_cancelled boolean not null default false,
  is_roadtrip boolean not null default false,
  provenance jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_id_length check (char_length(id) between 3 and 200),
  constraint events_source_name_length check (char_length(source_name) between 1 and 80),
  constraint events_source_event_id_length check (char_length(source_event_id) between 1 and 200),
  constraint events_title_length check (char_length(title) between 1 and 240),
  constraint events_description_length check (description is null or char_length(description) <= 8000),
  constraint events_source_url_https check (source_url is null or source_url ~ '^https://'),
  constraint events_image_url_https check (image_url is null or image_url ~ '^https://'),
  constraint events_coordinates_pair check (
    (latitude is null and longitude is null)
    or
    (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  constraint events_end_after_start check (ends_at is null or ends_at >= starts_at),
  constraint events_country_code_shape check (country_code ~ '^[A-Z]{2}$')
);

create unique index if not exists events_source_identity_uq
  on onto.events (source_name, source_event_id);

create index if not exists events_starts_at_idx
  on onto.events (starts_at);

create index if not exists events_rating_starts_idx
  on onto.events (rating, starts_at);

create index if not exists events_category_starts_idx
  on onto.events (category, starts_at);

create index if not exists events_locality_starts_idx
  on onto.events (locality, starts_at);

create index if not exists events_active_idx
  on onto.events (starts_at)
  where is_cancelled = false;

create trigger events_touch_updated_at
before update on onto.events
for each row execute function onto.touch_updated_at();

alter table onto.events enable row level security;

-- Discovery stays free and accountless while mature supply remains unavailable
-- to v1 clients. Trusted service-role ingestion bypasses RLS.
create policy events_public_read
on onto.events
for select
to anon, authenticated
using (rating <> 'mature');

-- No authenticated-client mutation policies on events. Ingestion runs through
-- service role / trusted server execution only.

-- ---------------------------------------------------------------------------
-- RSVP state
-- ---------------------------------------------------------------------------

create table if not exists onto.event_rsvps (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null references onto.events(id) on delete cascade,
  status onto.rsvp_status not null default 'going',
  share_with_connections boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists event_rsvps_event_status_idx
  on onto.event_rsvps (event_id, status);

create index if not exists event_rsvps_user_status_idx
  on onto.event_rsvps (user_id, status);

create trigger event_rsvps_touch_updated_at
before update on onto.event_rsvps
for each row execute function onto.touch_updated_at();

alter table onto.event_rsvps enable row level security;

create policy event_rsvps_read_self
on onto.event_rsvps
for select
to authenticated
using (user_id = auth.uid());

create policy event_rsvps_insert_self
on onto.event_rsvps
for insert
to authenticated
with check (user_id = auth.uid());

create policy event_rsvps_update_self
on onto.event_rsvps
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy event_rsvps_delete_self
on onto.event_rsvps
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Blocking: safety primitive that every future social policy must consult.
-- ---------------------------------------------------------------------------

create table if not exists onto.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),

  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on onto.user_blocks (blocked_id, blocker_id);

alter table onto.user_blocks enable row level security;

create policy user_blocks_read_own
on onto.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

create policy user_blocks_insert_own
on onto.user_blocks
for insert
to authenticated
with check (blocker_id = auth.uid());

create policy user_blocks_delete_own
on onto.user_blocks
for delete
to authenticated
using (blocker_id = auth.uid());

-- Keep block semantics centralized. A block in either direction makes the
-- pair socially invisible to one another.
create or replace function onto.users_are_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and (a = auth.uid() or b = auth.uid())
    and exists (
      select 1
      from onto.user_blocks ub
      where (ub.blocker_id = a and ub.blocked_id = b)
         or (ub.blocker_id = b and ub.blocked_id = a)
    );
$$;

revoke all on function onto.users_are_blocked(uuid, uuid) from public;
grant execute on function onto.users_are_blocked(uuid, uuid) to authenticated;

-- This policy depends on the block helper, so define it only after the helper
-- and its backing table exist.
create policy profiles_read_discoverable
on onto.profiles
for select
to authenticated
using (
  is_discoverable = true
  and user_id <> auth.uid()
  and not onto.users_are_blocked(auth.uid(), user_id)
);

-- ---------------------------------------------------------------------------
-- Safety reports. Reporters can create and view their own reports, but cannot
-- mutate them after submission. Moderation uses trusted server credentials.
-- ---------------------------------------------------------------------------

create table if not exists onto.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  event_id text references onto.events(id) on delete set null,
  reason onto.report_reason not null,
  details text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint user_reports_not_self check (
    reported_user_id is null or reporter_id <> reported_user_id
  ),
  constraint user_reports_details_length check (
    details is null or char_length(details) <= 4000
  )
);

alter table onto.user_reports
  drop constraint if exists user_reports_target_present;

create or replace function onto.require_report_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.reported_user_id is null and new.event_id is null then
    raise exception 'A report needs a user or event target'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists user_reports_require_target on onto.user_reports;
create trigger user_reports_require_target
before insert on onto.user_reports
for each row execute function onto.require_report_target();

create index if not exists user_reports_reporter_idx
  on onto.user_reports (reporter_id, created_at desc);

create index if not exists user_reports_reported_user_idx
  on onto.user_reports (reported_user_id, created_at desc)
  where reported_user_id is not null;

alter table onto.user_reports enable row level security;

create policy user_reports_read_own
on onto.user_reports
for select
to authenticated
using (reporter_id = auth.uid());

create policy user_reports_insert_own
on onto.user_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Coarse presence / availability. No exact coordinates. This is intentionally
-- status-oriented: "open to suggestions", not a live people-tracking system.
-- ---------------------------------------------------------------------------

create table if not exists onto.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status_text text,
  coarse_area text,
  visibility onto.presence_visibility not null default 'private',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_presence_status_length check (
    status_text is null or char_length(status_text) <= 160
  ),
  constraint user_presence_area_length check (
    coarse_area is null or char_length(coarse_area) <= 120
  ),
  constraint user_presence_expiry_future check (
    expires_at is null or expires_at >= created_at
  )
);

create index if not exists user_presence_public_idx
  on onto.user_presence (visibility, expires_at)
  where visibility <> 'private';

create trigger user_presence_touch_updated_at
before update on onto.user_presence
for each row execute function onto.touch_updated_at();

alter table onto.user_presence enable row level security;

create policy user_presence_read_self
on onto.user_presence
for select
to authenticated
using (user_id = auth.uid());

create policy user_presence_read_public
on onto.user_presence
for select
to authenticated
using (
  visibility = 'public'
  and user_id <> auth.uid()
  and (expires_at is null or expires_at > now())
  and not onto.users_are_blocked(auth.uid(), user_id)
);

create policy user_presence_insert_self
on onto.user_presence
for insert
to authenticated
with check (user_id = auth.uid());

create policy user_presence_update_self
on onto.user_presence
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_presence_delete_self
on onto.user_presence
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------

create or replace view onto.active_events
with (security_invoker = true)
as
select
  e.*
from onto.events e
where e.is_cancelled = false
  and coalesce(e.ends_at, e.starts_at + interval '3 hours') > now();

create or replace function onto.my_rsvp_history()
returns table (
  event_id text,
  status onto.rsvp_status,
  title text,
  venue_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  source_url text,
  rsvp_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.event_id,
    r.status,
    e.title,
    e.venue_name,
    e.starts_at,
    e.ends_at,
    e.source_url,
    r.updated_at as rsvp_updated_at
  from onto.event_rsvps r
  join onto.events e on e.id = r.event_id
  where r.user_id = auth.uid()
  order by r.updated_at desc;
$$;

revoke execute on function onto.my_rsvp_history() from public, anon;

-- ---------------------------------------------------------------------------
-- In-app account deletion. This security-definer function is deliberately
-- narrow: an authenticated user can delete only the auth row for auth.uid().
-- Cascading foreign keys remove owned profile, RSVP, block, and presence data.
-- ---------------------------------------------------------------------------

create or replace function onto.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := (select auth.uid());
begin
  if requester is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  delete from auth.users where id = requester;
  if not found then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  return true;
end;
$$;

revoke execute on function onto.delete_my_account() from public;
revoke execute on function onto.delete_my_account() from anon;
grant execute on function onto.delete_my_account() to authenticated;

grant usage on schema onto to anon, authenticated;
grant select on onto.events to anon, authenticated;
grant select on onto.active_events to anon, authenticated;
grant select, insert, update, delete on onto.profiles to authenticated;
grant select, insert, update, delete on onto.event_rsvps to authenticated;
grant select, insert, delete on onto.user_blocks to authenticated;
grant select, insert on onto.user_reports to authenticated;
grant select, insert, update, delete on onto.user_presence to authenticated;
grant execute on function onto.my_rsvp_history() to authenticated;

-- ---------------------------------------------------------------------------
-- Automatic profile bootstrap.
-- ---------------------------------------------------------------------------

create or replace function onto.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
begin
  candidate_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'onto user'
  );

  insert into onto.profiles (user_id, display_name)
  values (new.id, left(candidate_name, 60))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function onto.handle_new_auth_user() from public;

-- Supabase owns auth.users. Re-create safely if migration is replayed.
drop trigger if exists onto_auth_user_created on auth.users;
create trigger onto_auth_user_created
after insert on auth.users
for each row execute function onto.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Minimal integrity assertions available to CI/migration smoke tests.
-- ---------------------------------------------------------------------------

create or replace function onto.backend_contract_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select 1;
$$;

grant execute on function onto.backend_contract_version() to anon, authenticated;
