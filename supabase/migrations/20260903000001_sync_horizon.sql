-- Migration 20260903000001: bound catalog retirement to the sync horizon.
--
-- A Ticketmaster refresh is a capped snapshot (five pages of 200, sorted by
-- date ascending), so the run only knows about listings up to the latest
-- start time it fetched. Retiring every untouched upcoming listing of the
-- source would cancel real events that simply sit past that cap. The finish
-- step now takes p_horizon, the latest starts_at fetched in this run, and
-- retires only listings that start before it; listings at the horizon wait
-- for a later run. A null horizon keeps the previous unbounded behaviour.
--
-- One function only: PostgREST cannot resolve an rpc call when a four-argument
-- overload and a five-argument overload with a default both match the same
-- named-argument set, so the original signature is dropped and replaced by a
-- single function whose final parameter defaults to null. Four-argument
-- callers (SQL or rpc) keep working through that default. Forward-only and
-- idempotent: safe to apply on top of 20260902000001..20260902000003.

drop function if exists onto.finish_catalog_sync(text, timestamptz, integer, integer);

create or replace function onto.finish_catalog_sync(
  p_source_name text,
  p_completed_at timestamptz,
  p_record_count integer,
  p_rejected_count integer,
  p_horizon timestamptz default null
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
    and coalesce(ends_at, starts_at + interval '3 hours') > p_completed_at
    and (p_horizon is null or starts_at < p_horizon);
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

revoke execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer, timestamptz)
from public, anon, authenticated;
grant execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer, timestamptz)
to service_role;
