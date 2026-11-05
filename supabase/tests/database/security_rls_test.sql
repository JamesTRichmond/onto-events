begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@onto.test'),
  ('22222222-2222-4222-8222-222222222222', 'other@onto.test');

update onto.profiles
set display_name = case
  when user_id = '11111111-1111-4111-8111-111111111111' then 'Owner'
  else 'Other'
end;

insert into onto.events (
  id, source_name, source_event_id, title, rating, starts_at, ingested_at
) values
  ('event-public', 'Test', 'public', 'Public event', 'general', now() + interval '1 day', now()),
  ('event-mature', 'Test', 'mature', 'Mature event', 'mature', now() + interval '1 day', now());

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'onto' and c.relname in
     ('profiles', 'events', 'event_rsvps', 'user_blocks', 'user_reports', 'user_presence')
     and c.relrowsecurity),
  6::bigint,
  'RLS is enabled on every API table'
);

select ok(has_schema_privilege('anon', 'onto', 'USAGE'), 'anon can use only the onto API schema');
select ok(has_table_privilege('anon', 'onto.events', 'SELECT'), 'anon can read events');
select ok(not has_table_privilege('anon', 'onto.events', 'INSERT'), 'anon cannot create events');
select ok(not has_table_privilege('authenticated', 'onto.events', 'UPDATE'), 'users cannot edit events');
select ok(
  has_schema_privilege('service_role', 'onto', 'USAGE'),
  'service role can use the onto schema'
);
select ok(
  has_table_privilege('service_role', 'onto.user_reports', 'SELECT'),
  'service role can read reports for moderation'
);
select is(
  (select count(*)
   from auth.users u
   left join onto.profiles p on p.user_id = u.id
   where p.user_id is null),
  0::bigint,
  'every auth user has a profile'
);

set local role anon;
select is((select count(*) from onto.events), 1::bigint, 'anon sees general events');
select is((select count(*) from onto.events where id = 'event-mature'), 0::bigint, 'anon cannot see mature events');
select throws_ok(
  $$insert into onto.events (id, source_name, source_event_id, title, starts_at)
    values ('event-bad', 'Test', 'bad', 'Bad event', now())$$,
  '42501'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is((select count(*) from onto.profiles), 1::bigint, 'a user sees only their own profile');
select lives_ok(
  $$update onto.profiles set display_name = 'Stolen'
    where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'an update attempt against another profile is safely ignored'
);
select lives_ok(
  $$insert into onto.event_rsvps (user_id, event_id)
    values ('11111111-1111-4111-8111-111111111111', 'event-public')$$,
  'a user can create their own RSVP'
);
select throws_ok(
  $$insert into onto.event_rsvps (user_id, event_id)
    values ('22222222-2222-4222-8222-222222222222', 'event-public')$$,
  '42501'
);
select is((select count(*) from onto.event_rsvps), 1::bigint, 'a user sees only their own RSVP');
select throws_ok(
  $$select onto.finish_catalog_sync('Test', now(), 0, 0)$$,
  '42501'
);
select throws_ok(
  $$select onto.delete_my_account('22222222-2222-4222-8222-222222222222')$$,
  '42501', 'Account changed. Confirm deletion again.',
  'a switched token cannot delete the account newly signed in'
);
select throws_ok(
  $$select onto.delete_my_account(null)$$,
  '42501', 'Account changed. Confirm deletion again.',
  'deletion requires the confirmed account ID'
);
select ok(to_regprocedure('onto.delete_my_account()') is null, 'implicit-current deletion RPC is removed');
select lives_ok(
  $$select onto.delete_my_account('11111111-1111-4111-8111-111111111111')$$,
  'an authenticated user can delete their own account'
);
reset role;

select is(
  (select count(*) from auth.users where id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'account deletion removes the caller'
);
select is(
  (select count(*) from onto.event_rsvps where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'account deletion cascades through RSVPs'
);
select is(
  (select count(*) from auth.users where id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'account deletion leaves every other user intact'
);
select is(
  (select display_name from onto.profiles
   where user_id = '22222222-2222-4222-8222-222222222222'),
  'Other',
  'the ignored cross-account update changed no data'
);

select * from finish();
rollback;
