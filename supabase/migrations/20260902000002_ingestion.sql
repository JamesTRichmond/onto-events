-- Migration 20260902000002: production event ingestion and public catalog freshness.

alter type onto.event_category add value if not exists 'sales';

drop policy if exists events_public_read on onto.events;
create policy events_public_read
on onto.events
for select
to anon, authenticated
using (rating <> 'mature');

grant usage on schema onto to service_role;
grant select, insert, update, delete on onto.events to service_role;

create table if not exists onto.catalog_sync_state (
  source_name text primary key,
  completed_at timestamptz not null,
  record_count integer not null,
  rejected_count integer not null default 0,
  constraint catalog_sync_state_source_length
    check (char_length(source_name) between 1 and 80),
  constraint catalog_sync_state_counts_nonnegative
    check (record_count >= 0 and rejected_count >= 0)
);

alter table onto.catalog_sync_state enable row level security;

drop policy if exists catalog_sync_state_public_read
on onto.catalog_sync_state;
create policy catalog_sync_state_public_read
on onto.catalog_sync_state
for select
to anon, authenticated
using (true);

grant select on onto.catalog_sync_state to anon, authenticated;
grant select, insert, update, delete on onto.catalog_sync_state to service_role;

-- Finalize a successful source refresh: listings absent from the new complete
-- response disappear immediately, while a failed/partial refresh never retires
-- the last good catalog because this RPC is called only after all upserts pass.
create or replace function onto.finish_catalog_sync(
  p_source_name text,
  p_completed_at timestamptz,
  p_record_count integer,
  p_rejected_count integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  retired_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if nullif(trim(p_source_name), '') is null
     or p_completed_at is null
     or p_record_count < 0
     or p_rejected_count < 0 then
    raise exception 'invalid catalog sync summary' using errcode = '22023';
  end if;

  update onto.events
  set is_cancelled = true,
      updated_at = p_completed_at
  where source_name = p_source_name
    and is_cancelled = false
    and ingested_at < p_completed_at
    and coalesce(ends_at, starts_at + interval '3 hours') > p_completed_at;
  get diagnostics retired_count = row_count;

  insert into onto.catalog_sync_state (
    source_name,
    completed_at,
    record_count,
    rejected_count
  ) values (
    p_source_name,
    p_completed_at,
    p_record_count,
    p_rejected_count
  )
  on conflict (source_name) do update
  set completed_at = excluded.completed_at,
      record_count = excluded.record_count,
      rejected_count = excluded.rejected_count;

  return retired_count;
end;
$$;

revoke execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer)
from public, anon, authenticated;
grant execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer)
to service_role;
