-- The original checks bound trimmed content, but their RPCs store the raw
-- value. Keep existing contracts and permissions while bounding stored text.
-- Existing oversized values can only be outer-space padding under the old
-- checks. Remove that padding; never truncate the actual reviewed content or
-- change its moderation state, version, author, occurrence, or timestamps.
update onto.event_reviews
set body = trim(body)
where char_length(body) > 1000
  and char_length(trim(body)) between 1 and 1000;

update onto.community_reports
set reason = trim(reason)
where char_length(reason) > 500
  and char_length(trim(reason)) between 1 and 500;

update onto.hosted_submissions
set title = trim(title)
where char_length(title) > 240
  and char_length(trim(title)) between 1 and 240;

update onto.hosted_submissions
set description = trim(description)
where char_length(description) > 4000
  and char_length(trim(description)) between 1 and 4000;

update onto.hosted_submissions
set meeting_instructions = trim(meeting_instructions)
where char_length(meeting_instructions) > 500
  and char_length(trim(meeting_instructions)) between 1 and 500;

-- Approved activities were copied into the public catalog. Repair only an
-- exact owned copy whose trimmed text still matches its normalized source.
-- Preserve other provenance and cancellation data. The normal events trigger
-- honestly advances updated_at for any public copy repaired here.
update onto.events e
set title = trim(e.title)
from onto.hosted_submissions h
where h.state = 'approved'
  and e.source_name = 'onto community'
  and e.id = 'hosted-' || h.id
  and e.source_event_id = h.id::text
  and char_length(e.title) > 240
  and char_length(trim(e.title)) between 1 and 240
  and trim(e.title) = h.title;

update onto.events e
set description = trim(e.description)
from onto.hosted_submissions h
where h.state = 'approved'
  and e.source_name = 'onto community'
  and e.id = 'hosted-' || h.id
  and e.source_event_id = h.id::text
  and char_length(e.description) > 4000
  and char_length(trim(e.description)) between 1 and 4000
  and trim(e.description) = h.description;

update onto.events e
set provenance = jsonb_set(e.provenance, '{hosted,meetingInstructions}',
  to_jsonb(trim(e.provenance #>> '{hosted,meetingInstructions}')), false)
from onto.hosted_submissions h
where h.state = 'approved'
  and e.source_name = 'onto community'
  and e.id = 'hosted-' || h.id
  and e.source_event_id = h.id::text
  and jsonb_typeof(e.provenance #> '{hosted,meetingInstructions}') = 'string'
  and char_length(e.provenance #>> '{hosted,meetingInstructions}') > 500
  and char_length(trim(e.provenance #>> '{hosted,meetingInstructions}')) between 1 and 500
  and trim(e.provenance #>> '{hosted,meetingInstructions}') = h.meeting_instructions;

-- Table constraints protect both RPC inserts/edits and privileged direct
-- writes. The original trimmed nonempty checks continue to apply.
alter table onto.event_reviews
  add constraint event_reviews_stored_body_length
  check (char_length(body) <= 1000);

alter table onto.community_reports
  add constraint community_reports_stored_reason_length
  check (char_length(reason) <= 500);

alter table onto.hosted_submissions
  add constraint hosted_submissions_stored_title_length
  check (char_length(title) <= 240),
  add constraint hosted_submissions_stored_description_length
  check (char_length(description) <= 4000),
  add constraint hosted_submissions_stored_meeting_length
  check (char_length(meeting_instructions) <= 500);
