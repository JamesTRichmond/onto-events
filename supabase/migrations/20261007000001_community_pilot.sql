-- Dormant by default. Deploy and activate only after moderation and exact-build acceptance.
create table onto.community_pilot (id boolean primary key default true check(id), hosting boolean not null default false, reviews boolean not null default false);
insert into onto.community_pilot(id) values(true);
alter table onto.community_pilot enable row level security;
create policy pilot_public_read on onto.community_pilot for select to anon,authenticated using(true);
grant select on onto.community_pilot to anon,authenticated;
grant all on onto.community_pilot to service_role;

create table onto.community_reviewers (user_id uuid primary key references auth.users(id) on delete cascade);
alter table onto.community_reviewers enable row level security;
grant all on onto.community_reviewers to service_role;
create function onto.is_community_reviewer() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from onto.community_reviewers where user_id=auth.uid());
$$;
revoke all on function onto.is_community_reviewer() from public;
grant execute on function onto.is_community_reviewer() to anon,authenticated;
create function onto.community_pilot_state() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('hosting',hosting,'reviews',reviews,'reviewer',onto.is_community_reviewer()) from onto.community_pilot where id;
$$;
revoke all on function onto.community_pilot_state() from public;
grant execute on function onto.community_pilot_state() to anon,authenticated;

create table onto.community_venues (
 id text primary key, name text not null, locality text not null, region text not null, country_code text not null default 'US' check(country_code='US'),
 latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 timezone text not null check(timezone in ('America/New_York','America/Denver')),
 service_region text not null check(service_region in ('utah','vermont-corridor')),
 evidence_url text not null check(evidence_url ~ '^https://'), verified_at timestamptz not null, active boolean not null default true
);
alter table onto.community_venues enable row level security;
create policy venues_public_read on onto.community_venues for select to anon,authenticated using(active);
grant select on onto.community_venues to anon,authenticated;
grant all on onto.community_venues to service_role;

create table onto.hosted_submissions (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade,
 venue_id text not null references onto.community_venues(id), title text not null check(char_length(trim(title)) between 1 and 240),
 description text not null check(char_length(trim(description)) between 1 and 4000), meeting_instructions text not null check(char_length(trim(meeting_instructions)) between 1 and 500),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
 category onto.event_category not null check(category not in ('nightlife','roadtrip')), newcomers_welcome boolean not null default false,
 parent_event_id text references onto.events(id) on delete set null,
 state text not null default 'draft' check(state in ('draft','pending','approved','rejected','cancelled')),
 version integer not null default 1, review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table onto.hosted_submissions enable row level security;
create policy hosts_reviewer_read on onto.hosted_submissions for select to authenticated using(onto.is_community_reviewer());
grant select on onto.hosted_submissions to authenticated;
grant all on onto.hosted_submissions to service_role;
-- Authenticated authors mutate via bounded RPCs only; clients cannot set approval or author.
create function onto.my_hosted_submissions() returns setof onto.hosted_submissions language sql stable security definer set search_path='' as $$
 select * from onto.hosted_submissions where author_id=auth.uid() order by created_at desc;
$$;
create function onto.save_hosted_submission(submission_id uuid,payload jsonb,submit boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; existing onto.hosted_submissions; venue onto.community_venues;
begin
 if auth.uid() is null or not (select hosting from onto.community_pilot where id) then raise insufficient_privilege using message='Hosting pilot unavailable'; end if;
 select * into venue from onto.community_venues where id=payload->>'venue_id' and active;
 if not found then raise check_violation using message='Choose a verified public venue'; end if;
 if (payload->>'starts_at')::timestamptz <= now() or (payload->>'starts_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or (payload->>'ends_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise check_violation using message='Explicit future times required'; end if;
 if concat(payload->>'title',' ',payload->>'description',' ',payload->>'meeting_instructions') ~* '(21\+|18\+|adults? only|private home|my house|home address|members? only|invitation only)' then raise check_violation using message='Public Everyone activities only'; end if;
 if payload->>'parent_event_id' is not null and not exists(select 1 from onto.events where id=payload->>'parent_event_id' and rating='general' and not is_cancelled) then raise check_violation using message='Invalid parent event'; end if;
 if submission_id is null then
  if (select count(*) from onto.hosted_submissions where author_id=auth.uid() and created_at>now()-interval '1 day') >= 5 then raise check_violation using message='Daily submission limit reached'; end if;
  insert into onto.hosted_submissions(author_id,venue_id,title,description,meeting_instructions,starts_at,ends_at,category,newcomers_welcome,parent_event_id,state)
   values(auth.uid(),venue.id,payload->>'title',payload->>'description',payload->>'meeting_instructions',(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,(payload->>'category')::onto.event_category,coalesce((payload->>'newcomers_welcome')::boolean,false),payload->>'parent_event_id',case when submit then 'pending' else 'draft' end) returning id into result;
 else
  select * into existing from onto.hosted_submissions where id=submission_id and author_id=auth.uid() for update;
  if not found or existing.state='cancelled' then raise insufficient_privilege; end if;
  update onto.hosted_submissions set venue_id=venue.id,title=payload->>'title',description=payload->>'description',meeting_instructions=payload->>'meeting_instructions',starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz,category=(payload->>'category')::onto.event_category,newcomers_welcome=coalesce((payload->>'newcomers_welcome')::boolean,false),parent_event_id=payload->>'parent_event_id',state=case when submit then 'pending' else 'draft' end,version=version+1,review_note=null,updated_at=now() where id=submission_id;
  update onto.events set is_cancelled=true where id='hosted-'||submission_id;
  result:=submission_id;
 end if;
 return result;
end $$;
create function onto.cancel_hosted_submission(submission_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update onto.hosted_submissions set state='cancelled',version=version+1,updated_at=now() where id=submission_id and author_id=auth.uid();
 if not found then raise insufficient_privilege; end if;
 update onto.events set is_cancelled=true where id='hosted-'||submission_id;
end $$;
-- Deleting an account withdraws its published hosted activities as well as cascading private submissions.
create function onto.withdraw_deleted_host() returns trigger language plpgsql security definer set search_path='' as $$
begin update onto.events set is_cancelled=true where id='hosted-'||old.id; return old; end $$;
create trigger withdraw_deleted_host before delete on onto.hosted_submissions for each row execute function onto.withdraw_deleted_host();
create policy hosted_pilot_visibility on onto.events as restrictive for select to anon,authenticated using(source_name <> 'onto community' or ((select hosting from onto.community_pilot where id) and not is_cancelled));

create table onto.event_reviews (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade,
 event_id text not null references onto.events(id) on delete cascade, score integer not null check(score between 1 and 5), body text not null check(char_length(trim(body)) between 1 and 1000),
 state text not null default 'pending' check(state in ('pending','approved','rejected')), version integer not null default 1, review_note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(author_id,event_id)
);
alter table onto.event_reviews enable row level security;
create policy reviews_reviewer_read on onto.event_reviews for select to authenticated using(onto.is_community_reviewer());
grant select on onto.event_reviews to authenticated;
grant all on onto.event_reviews to service_role;
-- Deliberately owner-executed projection: no author/profile/timestamp or RSVP relationship is public.
create view onto.public_event_reviews with (security_barrier=true) as select r.id,r.event_id,r.score,r.body from onto.event_reviews r join onto.events e on e.id=r.event_id
 where r.state='approved' and e.rating='general' and not e.is_cancelled and (select reviews from onto.community_pilot where id)
 and (e.source_name <> 'onto community' or (select hosting from onto.community_pilot where id));
grant select on onto.public_event_reviews to anon,authenticated;
create function onto.my_event_reviews() returns setof onto.event_reviews language sql stable security definer set search_path='' as $$select * from onto.event_reviews where author_id=auth.uid() order by created_at desc;$$;
create function onto.submit_event_review(event_id text,score integer,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not (select reviews from onto.community_pilot where id) then raise insufficient_privilege; end if;
 if not exists(select 1 from onto.events e where e.id=submit_event_review.event_id and e.rating='general' and not e.is_cancelled) then raise check_violation using message='Everyone event required'; end if;
 if (select count(*) from onto.event_reviews where author_id=auth.uid() and updated_at>now()-interval '1 day') >= 20 then raise check_violation using message='Daily review limit reached'; end if;
 insert into onto.event_reviews(author_id,event_id,score,body) values(auth.uid(),event_id,score,body)
 on conflict on constraint event_reviews_author_id_event_id_key do update set score=excluded.score,body=excluded.body,state='pending',version=onto.event_reviews.version+1,review_note=null,updated_at=now() returning id into result;
 return result;
end $$;
create function onto.delete_event_review(review_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 delete from onto.event_reviews where id=review_id and author_id=auth.uid(); if not found then raise insufficient_privilege; end if;
end $$;

create table onto.community_reports (id uuid primary key default gen_random_uuid(), reporter_id uuid references auth.users(id) on delete cascade, target_kind text not null check(target_kind in ('host','review')),target_id uuid not null,reason text not null check(char_length(trim(reason)) between 1 and 500), resolved boolean not null default false,created_at timestamptz not null default now());
alter table onto.community_reports enable row level security;
create policy reports_reviewer_read on onto.community_reports for select to authenticated using(onto.is_community_reviewer());
grant select on onto.community_reports to authenticated;
grant all on onto.community_reports to service_role;
create function onto.report_community_content(target_kind text,target_id uuid,reason text) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if (select count(*) from onto.community_reports where reporter_id=auth.uid() and created_at>now()-interval '1 day') >= 20 then raise check_violation; end if;
 if not ((target_kind='host' and exists(select 1 from onto.hosted_submissions where id=target_id and state='approved')) or (target_kind='review' and exists(select 1 from onto.public_event_reviews where id=target_id))) then raise check_violation; end if;
 insert into onto.community_reports(reporter_id,target_kind,target_id,reason) values(auth.uid(),target_kind,target_id,reason);
end $$;
create function onto.resolve_community_report(report_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not onto.is_community_reviewer() then raise insufficient_privilege; end if;
 update onto.community_reports set resolved=true where id=report_id;
end $$;
create function onto.moderate_community_content(target_kind text,target_id uuid,expected_version integer,approve boolean,note text) returns void language plpgsql security definer set search_path='' as $$
declare h onto.hosted_submissions; v onto.community_venues;
begin
 if not onto.is_community_reviewer() then raise insufficient_privilege; end if;
 if char_length(note)>500 then raise check_violation; end if;
 if target_kind='host' then
  select * into h from onto.hosted_submissions where id=target_id for update;
  if not found or h.state not in ('pending','approved') or h.version<>expected_version then raise serialization_failure using message='Submission changed; reload the queue'; end if;
  if approve then
   select * into v from onto.community_venues where id=h.venue_id and active;
   if not found or h.starts_at<=now() then raise check_violation; end if;
   insert into onto.events(id,source_name,source_event_id,title,description,venue_name,locality,region,country_code,latitude,longitude,category,rating,starts_at,ends_at,timezone,is_cancelled,provenance)
    values('hosted-'||h.id,'onto community',h.id::text,h.title,h.description,v.name,v.locality,v.region,v.country_code,v.latitude,v.longitude,h.category,'general',h.starts_at,h.ends_at,v.timezone,false,jsonb_build_object('hosted',jsonb_build_object('meetingInstructions',h.meeting_instructions,'newcomersWelcome',h.newcomers_welcome)))
    on conflict(id) do update set title=excluded.title,description=excluded.description,venue_name=excluded.venue_name,locality=excluded.locality,region=excluded.region,latitude=excluded.latitude,longitude=excluded.longitude,category=excluded.category,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,is_cancelled=false,provenance=excluded.provenance;
  else update onto.events set is_cancelled=true where id='hosted-'||h.id; end if;
  update onto.hosted_submissions set state=case when approve then 'approved' else 'rejected' end,review_note=note,version=version+1,updated_at=now() where id=h.id;
 elsif target_kind='review' then
  update onto.event_reviews set state=case when approve then 'approved' else 'rejected' end,review_note=note,version=version+1,updated_at=now() where id=target_id and version=expected_version and state in ('pending','approved');
  if not found then raise serialization_failure using message='Review changed; reload the queue'; end if;
 else raise check_violation; end if;
end $$;

-- Explicit function grants, no default PUBLIC mutation capability.
do $$declare fn text; begin
 foreach fn in array array['my_hosted_submissions()','save_hosted_submission(uuid,jsonb,boolean)','cancel_hosted_submission(uuid)','my_event_reviews()','submit_event_review(text,integer,text)','delete_event_review(uuid)','report_community_content(text,uuid,text)','resolve_community_report(uuid)','moderate_community_content(text,uuid,integer,boolean,text)'] loop
  execute 'revoke all on function onto.'||fn||' from public,anon';
  execute 'grant execute on function onto.'||fn||' to authenticated';
 end loop;
end $$;
