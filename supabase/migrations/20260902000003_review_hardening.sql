-- Forward-only hardening for accounts that existed before profile automation.

grant usage on schema onto to service_role;
grant select on onto.user_reports to service_role;

insert into onto.profiles (user_id, display_name)
select
  id,
  left(
    coalesce(
      nullif(trim(raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(email, ''), '@', 1), ''),
      'onto user'
    ),
    60
  )
from auth.users
on conflict (user_id) do nothing;
