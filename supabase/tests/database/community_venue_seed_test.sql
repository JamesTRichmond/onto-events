begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Load the exact candidate bytes staged by CI, including all newlines.
-- The CLI mounts only supabase/tests and runs pg_prove from that directory.
\set venue_seed_b64 `base64 < .generated/vermont-venue-seed.txt | tr -d '\n'`
create temp table seed_script(sql text);
insert into seed_script values(convert_from(decode(:'venue_seed_b64','base64'),'UTF8'));
grant select on seed_script to anon,authenticated,service_role;

delete from onto.community_pilot;
select throws_ok((select sql from seed_script),'55000',null,'missing pilot state fails without inventing readiness');
select is((select count(*) from onto.community_venues where id like 'vt-%'),0::bigint,'missing pilot state adds no venue');
insert into onto.community_pilot(id) values(true);

select lives_ok((select sql from seed_script),'privileged operator prepares the actual four-venue candidate');
select is((select count(*) from onto.community_venues where id like 'vt-%'),4::bigint,'only four pilot venue identities are added');
select ok((select not hosting and not reviews from onto.community_pilot where id),'venue preparation keeps both pilot flags closed');
select is((select count(*) from onto.community_reviewers),0::bigint,'venue preparation does not assign a reviewer');
select is((select count(*) from onto.events where source_name='onto community'),0::bigint,'venue preparation does not publish an activity');

create temp table venue_snapshot as select * from onto.community_venues where id like 'vt-%';
select lives_ok((select sql from seed_script),'repeated application is idempotent');
select results_eq(
  $$select to_jsonb(v) from onto.community_venues v where id like 'vt-%' order by id$$,
  $$select to_jsonb(v) from venue_snapshot v order by id$$,
  'a repeated application preserves every field and the original approval timestamp');

-- Encounter a conflict after an earlier missing row would have been inserted.
delete from onto.community_venues where id='vt-bixby-library';
update onto.community_venues set name='Operator changed this place' where id='vt-fletcher-north';
select throws_ok((select sql from seed_script),'23514',null,'different existing venue fails before overwriting it');
select is((select count(*) from onto.community_venues where id like 'vt-%'),3::bigint,'late conflict atomically rolls back the earlier new row');
select is((select name from onto.community_venues where id='vt-fletcher-north'),'Operator changed this place','existing changed identity remains intact');
update onto.community_venues set name=(select name from venue_snapshot where id='vt-fletcher-north') where id='vt-fletcher-north';
select lives_ok((select sql from seed_script),'operator can retry after separately resolving the conflict');

update onto.community_venues set active=false where id='vt-bixby-library';
select throws_ok((select sql from seed_script),'23514',null,'retired venue is not silently reactivated');
select ok((select not active from onto.community_venues where id='vt-bixby-library'),'retired venue remains retired');
update onto.community_venues set active=true where id='vt-bixby-library';

delete from onto.community_venues where id='vt-bixby-library';
update onto.community_pilot set hosting=true;
select throws_ok((select sql from seed_script),'55000',null,'open hosting prevents this preparation operation');
select is((select count(*) from onto.community_venues where id='vt-bixby-library'),0::bigint,'open-hosting refusal adds no venue');
update onto.community_pilot set hosting=false,reviews=true;
select throws_ok((select sql from seed_script),'55000',null,'open reviews also prevents preparation');
select ok((select reviews from onto.community_pilot where id),'the operation never turns off an already-open pilot');
update onto.community_pilot set reviews=false;

select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select throws_ok((select sql from seed_script),'42501',null,'a guest cannot apply the venue operation');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","user_metadata":{"reviewer":true}}',true);
set local role authenticated;
select throws_ok((select sql from seed_script),'42501',null,'client metadata cannot grant deployment permission');
reset role;
select is((select count(*) from onto.community_venues where id='vt-bixby-library'),0::bigint,'client attempts do not add venue rows');
select ok(not has_table_privilege('anon','onto.community_venues','INSERT'),'guests have no venue insert grant');
select ok(not has_table_privilege('authenticated','onto.community_venues','UPDATE'),'signed-in clients have no venue update grant');

select lives_ok((select sql from seed_script),'closed-pilot server retry completes normally');
set local role service_role;
select lives_ok((select sql from seed_script),'the separately authorized server role can repeat the operation');
reset role;
select * from finish();
rollback;
