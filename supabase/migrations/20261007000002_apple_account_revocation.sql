-- Apple refresh credentials exist only as encrypted server-held deletion material.
create table onto.apple_provider_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_token jsonb not null,
  updated_at timestamptz not null default now()
);
alter table onto.apple_provider_tokens enable row level security;
revoke all on onto.apple_provider_tokens from anon, authenticated;
grant all on onto.apple_provider_tokens to service_role;

-- The authenticated database RPC cannot bypass provider revocation.
create or replace function onto.delete_my_account() returns boolean
language plpgsql security definer set search_path = '' as $$
declare requester uuid := auth.uid();
begin
  if requester is null then raise insufficient_privilege; end if;
  if exists (select 1 from auth.identities where user_id = requester and provider = 'apple') then
    raise exception 'Apple-linked deletion requires provider revocation' using errcode = '55000';
  end if;
  delete from auth.users where id = requester;
  if not found then raise insufficient_privilege; end if;
  return true;
end;
$$;
revoke all on function onto.delete_my_account() from public, anon;
grant execute on function onto.delete_my_account() to authenticated;
