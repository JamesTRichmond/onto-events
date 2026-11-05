begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('44444444-4444-4444-8444-444444444444', 'bounded-author@onto.test'),
  ('55555555-5555-4555-8555-555555555555', 'bounded-other@onto.test'),
  ('66666666-6666-4666-8666-666666666666', 'bounded-reviewer@onto.test');
insert into onto.community_reviewers values
  ('66666666-6666-4666-8666-666666666666');
insert into onto.events(id, source_name, source_event_id, title, rating, starts_at)
values ('bounded-review-event', 'Fixture', 'bounded-event', 'Public review fixture', 'general', now() + interval '1 day');
insert into onto.community_venues(id, name, locality, region, latitude, longitude, timezone, service_region, evidence_url, verified_at)
values ('bounded-public-library', 'Public library', 'Middlebury', 'VT', 44.0153, -73.1673, 'America/New_York', 'vermont-corridor', 'https://example.org/bounded-fixture', now());
update onto.community_pilot set hosting = true, reviews = true;
create temp table bounded_ids(kind text primary key, id uuid);
grant all on bounded_ids to authenticated;
grant select on bounded_ids to service_role;
create temp table bounded_host_payload(payload jsonb);
insert into bounded_host_payload values (jsonb_build_object(
  'venue_id', 'bounded-public-library', 'title', 'Public games',
  'description', 'A public games program', 'meeting_instructions', 'Meet at the public desk',
  'starts_at', to_char(now() + interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'ends_at', to_char(now() + interval '1 day 2 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'category', 'games'));
grant select on bounded_host_payload to authenticated, service_role;

select ok(not has_table_privilege('authenticated', 'onto.event_reviews', 'INSERT'), 'authors still cannot insert reviews directly');
select ok(not has_table_privilege('authenticated', 'onto.event_reviews', 'UPDATE'), 'authors still cannot bypass review moderation');
select ok(not has_table_privilege('authenticated', 'onto.community_reports', 'INSERT'), 'reports still use the guarded RPC');
select ok(has_function_privilege('authenticated', 'onto.submit_event_review(text,integer,text)', 'EXECUTE'), 'signed-in review contract remains available');
select ok(not has_function_privilege('anon', 'onto.submit_event_review(text,integer,text)', 'EXECUTE'), 'guests still cannot submit reviews');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select onto.submit_event_review('bounded-review-event', 4, 'Helpful')$$, '42501', null, 'anonymous review submission remains forbidden');
reset role;

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from onto.event_rsvps), 0::bigint, 'review author has no Going requirement');
select throws_ok($$select onto.submit_event_review('bounded-review-event', 4, repeat(' ', 1000) || 'x')$$, '23514', null, 'fresh RPC rejects an oversized space-padded review');
select throws_ok($$select onto.submit_event_review('bounded-review-event', 4, repeat('x', 1001))$$, '23514', null, 'fresh RPC rejects oversized ordinary text');
select throws_ok($$select onto.submit_event_review('bounded-review-event', 4, '   ')$$, '23514', null, 'blank review remains invalid');
select throws_ok($$select onto.submit_event_review('bounded-review-event', 6, 'Helpful')$$, '23514', null, 'rating bound remains enforced');
select is((select count(*) from onto.my_event_reviews()), 0::bigint, 'rejected inserts store no review');

select lives_ok($$insert into bounded_ids select 'review', onto.submit_event_review('bounded-review-event', 4, repeat('x', 1000))$$, 'author without Going can submit exactly 1000 characters');
select is((select char_length(body) from onto.my_event_reviews()), 1000, 'boundary review stores exactly 1000 characters');
select throws_ok($$select onto.submit_event_review('bounded-review-event', 3, repeat(' ', 1000) || 'x')$$, '23514', null, 'RPC edit rejects oversized padding too');
select is((select body from onto.my_event_reviews()), repeat('x', 1000), 'rejected edit preserves the original text');
select is((select version from onto.my_event_reviews()), 1, 'rejected edit preserves its moderation version');
select lives_ok($$select onto.submit_event_review('bounded-review-event', 5, 'Helpful public instructions')$$, 'ordinary review edit remains available');
select is((select count(*) from onto.my_event_reviews()), 1::bigint, 'editing still retains one review per account and occurrence');
select is((select state from onto.my_event_reviews()), 'pending', 'ordinary edit still requires review');
select is((select version from onto.my_event_reviews()), 2, 'ordinary edit advances the moderation version');
reset role;

select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select onto.moderate_community_content('review', (select id from bounded_ids where kind = 'review'), 2, true, 'Clear public instructions')$$, 'assigned reviewer can approve the bounded review');
reset role;
set local role anon;
select is((select body from onto.public_event_reviews where event_id = 'bounded-review-event'), 'Helpful public instructions', 'public projection exposes only the approved bounded text');
reset role;

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select onto.report_community_content('review', (select id from bounded_ids where kind = 'review'), repeat(' ', 500) || 'x')$$, '23514', null, 'report RPC rejects oversized space padding');
select throws_ok($$select onto.report_community_content('review', (select id from bounded_ids where kind = 'review'), repeat('x', 501))$$, '23514', null, 'report RPC rejects oversized ordinary text');
select throws_ok($$select onto.report_community_content('review', (select id from bounded_ids where kind = 'review'), '   ')$$, '23514', null, 'blank report remains invalid');
select lives_ok($$select onto.report_community_content('review', (select id from bounded_ids where kind = 'review'), repeat('r', 500))$$, 'report RPC accepts exactly 500 characters');
select lives_ok($$select onto.report_community_content('review', (select id from bounded_ids where kind = 'review'), 'Please check these instructions')$$, 'ordinary explicit report remains available');
reset role;
select is((select count(*) from onto.community_reports where reporter_id = '44444444-4444-4444-8444-444444444444'), 2::bigint, 'only the two valid reports were stored');
select is((select max(char_length(reason)) from onto.community_reports where reporter_id = '44444444-4444-4444-8444-444444444444'), 500, 'every stored report stays within its actual length bound');

-- RLS bypass never bypasses CHECK constraints on privileged writes either.
set local role service_role;
select throws_ok($$update onto.event_reviews set body = repeat(' ', 1000) || 'x' where event_id = 'bounded-review-event'$$, '23514', null, 'privileged direct review edits also reject oversized padding');
select throws_ok($$insert into onto.community_reports(reporter_id, target_kind, target_id, reason) values ('44444444-4444-4444-8444-444444444444', 'review', (select id from bounded_ids where kind = 'review'), repeat(' ', 500) || 'x')$$, '23514', null, 'privileged direct reports also reject oversized padding');
reset role;

select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select onto.delete_event_review((select id from bounded_ids where kind = 'review'))$$, '42501', null, 'another account still cannot delete the bounded review');
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select onto.delete_event_review((select id from bounded_ids where kind = 'review'))$$, 'author can explicitly delete their review');
select is((select count(*) from onto.my_event_reviews()), 0::bigint, 'author deletion removes the private review');
select is((select count(*) from onto.public_event_reviews where event_id = 'bounded-review-event'), 0::bigint, 'author deletion withdraws the public review');
reset role;

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select onto.save_hosted_submission(null, (select payload from bounded_host_payload) || jsonb_build_object('title', repeat(' ', 240) || 'x'), true)$$, '23514', null, 'host insert rejects an oversized space-padded title');
select throws_ok($$select onto.save_hosted_submission(null, (select payload from bounded_host_payload) || jsonb_build_object('description', repeat(' ', 4000) || 'x'), true)$$, '23514', null, 'host insert rejects an oversized space-padded description');
select throws_ok($$select onto.save_hosted_submission(null, (select payload from bounded_host_payload) || jsonb_build_object('meeting_instructions', repeat(' ', 500) || 'x'), true)$$, '23514', null, 'host insert rejects oversized space-padded meeting instructions');
select is((select count(*) from onto.my_hosted_submissions()), 0::bigint, 'rejected host inserts store no submission');
select lives_ok($$insert into bounded_ids select 'normal-host', onto.save_hosted_submission(null, (select payload from bounded_host_payload), true)$$, 'ordinary public host submission remains available');
select lives_ok($$insert into bounded_ids select 'host', onto.save_hosted_submission(null, (select payload from bounded_host_payload) || jsonb_build_object('title', repeat('t', 240), 'description', repeat('d', 4000), 'meeting_instructions', repeat('m', 500)), true)$$, 'host accepts all three exact text boundaries');
select is((select char_length(title) from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), 240, 'host title stores exactly 240 characters');
select is((select char_length(description) from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), 4000, 'host description stores exactly 4000 characters');
select is((select char_length(meeting_instructions) from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), 500, 'host meeting instructions store exactly 500 characters');
reset role;

select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select onto.moderate_community_content('host', (select id from bounded_ids where kind = 'host'), 1, true, 'Public bounded activity')$$, 'assigned reviewer can approve an exactly bounded host');
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select onto.save_hosted_submission((select id from bounded_ids where kind = 'host'), (select payload from bounded_host_payload) || jsonb_build_object('title', repeat(' ', 240) || 'x'), true)$$, '23514', null, 'host edit rejects an oversized space-padded title');
select throws_ok($$select onto.save_hosted_submission((select id from bounded_ids where kind = 'host'), (select payload from bounded_host_payload) || jsonb_build_object('description', repeat(' ', 4000) || 'x'), true)$$, '23514', null, 'host edit rejects an oversized space-padded description');
select throws_ok($$select onto.save_hosted_submission((select id from bounded_ids where kind = 'host'), (select payload from bounded_host_payload) || jsonb_build_object('meeting_instructions', repeat(' ', 500) || 'x'), true)$$, '23514', null, 'host edit rejects oversized space-padded meeting instructions');
select is((select title from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), repeat('t', 240), 'rejected host edits preserve approved title');
select is((select description from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), repeat('d', 4000), 'rejected host edits preserve approved description');
select is((select meeting_instructions from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), repeat('m', 500), 'rejected host edits preserve approved meeting instructions');
select is((select state from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), 'approved', 'rejected host edits preserve approval');
select is((select version from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), 2, 'rejected host edits preserve the current version');
select ok((select not is_cancelled from onto.events where id = 'hosted-' || (select id::text from bounded_ids where kind = 'host')), 'rejected host edits do not withdraw approved discovery');
select lives_ok($$select onto.save_hosted_submission((select id from bounded_ids where kind = 'host'), (select payload from bounded_host_payload), true)$$, 'ordinary host edit remains available');
select is((select state from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), 'pending', 'ordinary host edit still requires renewed approval');
select is((select version from onto.my_hosted_submissions() where id = (select id from bounded_ids where kind = 'host')), 3, 'ordinary host edit still advances its version');
reset role;

-- Model rows accepted by the original trimmed-length checks. These new
-- constraints plus the preexisting events title bound are removed, inside
-- this rollback-only test transaction, so the migration can demonstrate
-- repairing legacy padded public copies that the events check would otherwise
-- reject.
alter table onto.event_reviews drop constraint event_reviews_stored_body_length;
alter table onto.community_reports drop constraint community_reports_stored_reason_length;
alter table onto.hosted_submissions
  drop constraint hosted_submissions_stored_title_length,
  drop constraint hosted_submissions_stored_description_length,
  drop constraint hosted_submissions_stored_meeting_length;
alter table onto.events drop constraint events_title_length;

update onto.hosted_submissions
set title = repeat(' ', 240) || 'Legacy public games',
  description = repeat(' ', 4000) || 'A legacy public program',
  meeting_instructions = repeat(' ', 500) || 'Meet at the public desk',
  state = 'approved', version = 9, review_note = 'Approved legacy content',
  created_at = '2026-10-01T12:00:00Z', updated_at = '2026-10-02T12:00:00Z'
where id = (select id from bounded_ids where kind = 'normal-host');
insert into onto.events(id, source_name, source_event_id, title, description, rating, starts_at, ends_at, is_cancelled, provenance)
select 'hosted-' || h.id, 'onto community', h.id::text, h.title, h.description,
  'general', h.starts_at, h.ends_at, true,
  jsonb_build_object('unrelated', 'preserve this', 'hosted', jsonb_build_object(
    'meetingInstructions', h.meeting_instructions, 'newcomersWelcome', true, 'other', 'also preserve'))
from onto.hosted_submissions h where h.id = (select id from bounded_ids where kind = 'normal-host');
insert into onto.event_reviews(id, author_id, event_id, score, body, state, version, review_note, created_at, updated_at)
values ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', 'bounded-review-event',
  4, repeat(' ', 1000) || 'Legacy useful review', 'approved', 9, 'Approved legacy review', '2026-10-01T12:00:00Z', '2026-10-02T12:00:00Z');
insert into onto.community_reports(id, reporter_id, target_kind, target_id, reason, resolved, created_at)
values ('88888888-8888-4888-8888-888888888888', '44444444-4444-4444-8444-444444444444', 'review',
  '77777777-7777-4777-8777-777777777777', repeat(' ', 500) || 'Legacy report reason', true, '2026-10-01T12:00:00Z');
insert into onto.events(id, source_name, source_event_id, title, description, rating, starts_at, provenance)
values ('unrelated-padding-fixture', 'Fixture', 'unrelated-padding', repeat(' ', 240) || 'Publisher text',
  repeat(' ', 4000) || 'Publisher description', 'general', now() + interval '1 day',
  jsonb_build_object('hosted', jsonb_build_object('meetingInstructions', repeat(' ', 500) || 'Publisher instructions')));
insert into onto.hosted_submissions(id, author_id, venue_id, title, description, meeting_instructions, starts_at, ends_at, category, state)
select '99999999-9999-4999-8999-999999999999', '44444444-4444-4444-8444-444444444444',
  'bounded-public-library', 'Identity guard games', 'Identity guard program', 'Identity guard desk',
  now() + interval '1 day', now() + interval '1 day 2 hours', 'games', 'approved';
insert into onto.events(id, source_name, source_event_id, title, description, rating, starts_at, provenance)
select copy_identity.id, 'onto community', copy_identity.source_event_id, repeat(' ', 240) || h.title,
  repeat(' ', 4000) || h.description, 'general', h.starts_at,
  jsonb_build_object('hosted', jsonb_build_object('meetingInstructions', repeat(' ', 500) || h.meeting_instructions))
from onto.hosted_submissions h cross join (values
  ('hosted-99999999-9999-4999-8999-999999999999', 'mismatched-source-identity'),
  ('mismatched-public-id', '99999999-9999-4999-8999-999999999999')) as copy_identity(id, source_event_id)
where h.id = '99999999-9999-4999-8999-999999999999';

create temp table legacy_host_metadata as
  select to_jsonb(h) - array['title', 'description', 'meeting_instructions'] as value
  from onto.hosted_submissions h where id = (select id from bounded_ids where kind = 'normal-host');
create temp table legacy_review_metadata as
  select to_jsonb(r) - 'body' as value from onto.event_reviews r where id = '77777777-7777-4777-8777-777777777777';
create temp table legacy_report_metadata as
  select to_jsonb(r) - 'reason' as value from onto.community_reports r where id = '88888888-8888-4888-8888-888888888888';
create temp table legacy_event_metadata as
  select to_jsonb(e) - array['title', 'description', 'provenance', 'updated_at'] as value,
    e.provenance #- '{hosted,meetingInstructions}' as other_provenance
  from onto.events e where id = 'hosted-' || (select id::text from bounded_ids where kind = 'normal-host');
create temp table unrelated_event_snapshot as
  select to_jsonb(e) as value from onto.events e where id = 'unrelated-padding-fixture';
create temp table mismatched_event_snapshot as
  select id, to_jsonb(e) as value from onto.events e where id in ('hosted-99999999-9999-4999-8999-999999999999', 'mismatched-public-id');

-- CI stages the exact migration bytes under tests/.generated; pg_prove mounts
-- tests only. Reapply the actual migration, not a copied SQL implementation.
\ir ../.generated/feedback-stored-text-bounds.txt

select is((select title from onto.hosted_submissions where id = (select id from bounded_ids where kind = 'normal-host')), 'Legacy public games', 'migration safely normalizes legacy host title');
select is((select description from onto.hosted_submissions where id = (select id from bounded_ids where kind = 'normal-host')), 'A legacy public program', 'migration safely normalizes legacy host description');
select is((select meeting_instructions from onto.hosted_submissions where id = (select id from bounded_ids where kind = 'normal-host')), 'Meet at the public desk', 'migration safely normalizes legacy host meeting instructions');
select is((select to_jsonb(h) - array['title', 'description', 'meeting_instructions'] from onto.hosted_submissions h where id = (select id from bounded_ids where kind = 'normal-host')), (select value from legacy_host_metadata), 'normalization preserves host moderation, ownership and timestamps');
select is((select body from onto.event_reviews where id = '77777777-7777-4777-8777-777777777777'), 'Legacy useful review', 'migration safely normalizes legacy review body');
select is((select to_jsonb(r) - 'body' from onto.event_reviews r where id = '77777777-7777-4777-8777-777777777777'), (select value from legacy_review_metadata), 'normalization preserves review moderation, ownership and timestamps');
select is((select reason from onto.community_reports where id = '88888888-8888-4888-8888-888888888888'), 'Legacy report reason', 'migration safely normalizes legacy report reason');
select is((select to_jsonb(r) - 'reason' from onto.community_reports r where id = '88888888-8888-4888-8888-888888888888'), (select value from legacy_report_metadata), 'normalization preserves report resolution, ownership and timestamp');
select is((select title from onto.events where id = 'hosted-' || (select id::text from bounded_ids where kind = 'normal-host')), 'Legacy public games', 'migration repairs the exact copied public title');
select is((select description from onto.events where id = 'hosted-' || (select id::text from bounded_ids where kind = 'normal-host')), 'A legacy public program', 'migration repairs the exact copied public description');
select is((select provenance #>> '{hosted,meetingInstructions}' from onto.events where id = 'hosted-' || (select id::text from bounded_ids where kind = 'normal-host')), 'Meet at the public desk', 'migration repairs copied public meeting instructions');
select is((select to_jsonb(e) - array['title', 'description', 'provenance', 'updated_at'] from onto.events e where id = 'hosted-' || (select id::text from bounded_ids where kind = 'normal-host')), (select value from legacy_event_metadata), 'public normalization preserves cancellation, identity and other fields');
select is((select provenance #- '{hosted,meetingInstructions}' from onto.events where id = 'hosted-' || (select id::text from bounded_ids where kind = 'normal-host')), (select other_provenance from legacy_event_metadata), 'public normalization preserves every unrelated provenance value');
select is((select to_jsonb(e) from onto.events e where id = 'unrelated-padding-fixture'), (select value from unrelated_event_snapshot), 'migration leaves unrelated publisher data unchanged');
select is((select to_jsonb(e) from onto.events e where id = 'hosted-99999999-9999-4999-8999-999999999999'), (select value from mismatched_event_snapshot where id = 'hosted-99999999-9999-4999-8999-999999999999'), 'migration requires the exact immutable source-event identity');
select is((select to_jsonb(e) from onto.events e where id = 'mismatched-public-id'), (select value from mismatched_event_snapshot where id = 'mismatched-public-id'), 'migration requires the exact owned public event ID');
select is((select count(*) from pg_constraint where connamespace = 'onto'::regnamespace and conname in ('event_reviews_stored_body_length', 'community_reports_stored_reason_length', 'hosted_submissions_stored_title_length', 'hosted_submissions_stored_description_length', 'hosted_submissions_stored_meeting_length')), 5::bigint, 'migration reapplies all five actual stored-length constraints');

select * from finish();
rollback;
