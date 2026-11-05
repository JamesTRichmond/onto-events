-- Every destructive request names the account the person confirmed. The JWT
-- remains the authority; a switched token can never delete its new owner.
drop function onto.delete_my_account();

create function onto.delete_my_account(expected_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare requester uuid := auth.uid();
begin
  if requester is null or expected_user_id is distinct from requester then
    raise insufficient_privilege using message = 'Account changed. Confirm deletion again.';
  end if;
  if exists (select 1 from auth.identities where user_id = requester and provider = 'apple') then
    raise exception 'Apple-linked deletion requires provider revocation' using errcode = '55000';
  end if;
  delete from auth.users where id = requester;
  if not found then raise insufficient_privilege; end if;
  return true;
end;
$$;
revoke all on function onto.delete_my_account(uuid) from public, anon;
grant execute on function onto.delete_my_account(uuid) to authenticated;
