\set ON_ERROR_STOP on

do $$
begin
  if has_function_privilege(
    'anon',
    'public.claim_expired_ticket_intake_drafts(uuid,integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_ticket_intake_draft_cleanup(uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.release_ticket_intake_draft_cleanup(uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.record_ticket_intake_draft_cleanup_tombstones(uuid,uuid,text[])',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.purge_expired_converted_ticket_intake_drafts(integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.purge_expired_converted_ticket_intake_drafts(integer)',
    'execute'
  ) then
    raise exception 'cleanup RPCs are exposed outside service_role';
  end if;
  if has_table_privilege(
    'anon', 'public.ticket_intake_draft_cleanup_tombstones', 'select'
  ) or has_table_privilege(
    'authenticated', 'public.ticket_intake_draft_cleanup_tombstones', 'select'
  ) then
    raise exception 'cleanup tombstones are publicly readable';
  end if;
end
$$;

set role service_role;

do $$
begin
  begin
    perform public.claim_expired_ticket_intake_drafts(
      '00000000-0000-4000-8000-000000000699', 26
    );
    raise exception 'oversize cleanup batch was accepted';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CLEANUP_LIMIT_INVALID' then raise; end if;
  end;
end
$$;

-- Oldest eligible draft has both a confirmed object and a pending replacement.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000701',
  (repeat('b', 63) || '1'), (repeat('b', 63) || '1'), 'cleanup-one@example.com', null, 'en',
  '{"email":"cleanup-one@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000701/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000701', (repeat('b', 63) || '1'), 1
);
select public.prepare_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000701', (repeat('b', 63) || '1'), 2,
  '00000000-0000-4000-8000-000000000701/representation-ticket-r2.jpg',
  'image/jpeg', 2200
);
update public.ticket_intake_drafts
set expires_at = now() - interval '18 days'
where id = '00000000-0000-4000-8000-000000000701';

-- A second eligible draft proves active leases and bounded claims do not
-- duplicate the first row.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000702',
  (repeat('c', 63) || '2'), (repeat('c', 63) || '2'), 'cleanup-two@example.com', null, 'en',
  '{"email":"cleanup-two@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000702/representation-ticket-r1.png',
  'image/png', 1300
);
update public.ticket_intake_drafts
set expires_at = now() - interval '17 days'
where id = '00000000-0000-4000-8000-000000000702';

-- A live draft is never a cleanup candidate.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000703',
  (repeat('d', 63) || '3'), (repeat('d', 63) || '3'), 'live@example.com', null, 'en',
  '{"email":"live@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000703/representation-ticket-r1.webp',
  'image/webp', 1400
);

-- Recently expired drafts remain protected by the 24-hour signed-upload grace.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000706',
  (repeat('0', 63) || '6'), (repeat('0', 63) || '6'), 'grace@example.com', null, 'en',
  '{"email":"grace@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000706/representation-ticket-r1.pdf',
  'application/pdf', 1700
);
update public.ticket_intake_drafts
set expires_at = now() - interval '2 hours'
where id = '00000000-0000-4000-8000-000000000706';

-- An expired converted draft remains outside the Storage cleanup queue. The
-- separate converted-retention purge removes only its redundant database row.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000704',
  (repeat('e', 63) || '4'), (repeat('e', 63) || '4'), 'converted-cleanup@example.com', null, 'en',
  '{"email":"converted-cleanup@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000704/representation-ticket-r1.pdf',
  'application/pdf', 1500
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000704', (repeat('e', 63) || '4'), 1
);
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000904');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000704',
  '00000000-0000-4000-8000-000000000904',
  'representation', 'awaiting_payment', (repeat('e', 63) || '4'),
  '00000000-0000-4000-8000-000000000704/representation-ticket-r1.pdf',
  'en', 'converted-cleanup@example.com', '4035550704'
);
update public.ticket_intake_drafts
set expires_at = now() - interval '19 days',
    draft_data = '{"email":"converted-cleanup@example.com","dateOfBirth":"1990-01-01","driversLicense":"SENSITIVE-DRAFT-COPY"}'::jsonb
where id = '00000000-0000-4000-8000-000000000704';

-- A later canonical document replacement must not preserve the redundant
-- converted draft or cause its old object path to enter draft cleanup.
update public.ticket_submissions
set ticket_document_path = '00000000-0000-4000-8000-000000000704/canonical-replacement-r2.pdf'
where id = '00000000-0000-4000-8000-000000000704';

-- A converted draft inside the 24-hour post-expiry grace remains available.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000707',
  (repeat('1', 63) || '7'), (repeat('1', 63) || '7'), 'converted-grace@example.com', null, 'en',
  '{"email":"converted-grace@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000707/representation-ticket-r1.pdf',
  'application/pdf', 1800
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000707', (repeat('1', 63) || '7'), 1
);
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000907');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000707',
  '00000000-0000-4000-8000-000000000907',
  'representation', 'awaiting_payment', (repeat('1', 63) || '7'),
  '00000000-0000-4000-8000-000000000707/representation-ticket-r1.pdf',
  'en', 'converted-grace@example.com', '4035550707'
);
update public.ticket_intake_drafts
set expires_at = now() - interval '23 hours'
where id = '00000000-0000-4000-8000-000000000707';

-- A nonconverted draft whose path is already referenced by any submission is
-- also excluded, even if the submission has a different identifier.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000705',
  (repeat('f', 63) || '5'), (repeat('f', 63) || '5'), 'referenced@example.com', null, 'en',
  '{"email":"referenced@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000705/representation-ticket-r1.heic',
  'image/heic', 1600
);
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000905');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000805',
  '00000000-0000-4000-8000-000000000905',
  'representation', 'awaiting_payment', (repeat('f', 63) || '5'),
  '00000000-0000-4000-8000-000000000705/representation-ticket-r1.heic',
  'en', 'other-submission@example.com', '4035550805'
);
update public.ticket_intake_drafts
set expires_at = now() - interval '20 days'
where id = '00000000-0000-4000-8000-000000000705';

do $$
declare
  claimed jsonb;
  keys text[];
begin
  select to_jsonb(c) into claimed
  from public.claim_expired_ticket_intake_drafts(
    '00000000-0000-4000-8000-000000000601', 1
  ) c;
  if claimed ->> 'draft_id' <> '00000000-0000-4000-8000-000000000701' or
     claimed ->> 'claim_id' <> '00000000-0000-4000-8000-000000000601' or
     claimed ->> 'current_path' <> '00000000-0000-4000-8000-000000000701/representation-ticket-r1.pdf' or
     claimed ->> 'pending_path' <> '00000000-0000-4000-8000-000000000701/representation-ticket-r2.jpg' then
    raise exception 'bounded cleanup claim returned the wrong draft or paths';
  end if;
  select array_agg(key order by key) into keys
  from jsonb_object_keys(claimed) key;
  if keys <> array['claim_id', 'current_path', 'draft_id', 'pending_path']::text[] then
    raise exception 'cleanup claim returned data beyond identifiers and object paths';
  end if;
end
$$;

do $$
declare
  claimed_id uuid;
begin
  select draft_id into claimed_id
  from public.claim_expired_ticket_intake_drafts(
    '00000000-0000-4000-8000-000000000602', 1
  );
  if claimed_id <> '00000000-0000-4000-8000-000000000702' then
    raise exception 'active lease was duplicated or bounded claim skipped next eligible row';
  end if;
end
$$;

-- Submission is blocked for the whole deletion lease.
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000906');
do $$
begin
  begin
    insert into public.ticket_submissions (
      id, client_id, service_type, status, representation_access_token_hash,
      ticket_document_path, preferred_locale, email, phone
    ) values (
      '00000000-0000-4000-8000-000000000806',
      '00000000-0000-4000-8000-000000000906',
      'representation', 'awaiting_payment', (repeat('b', 63) || '1'),
      '00000000-0000-4000-8000-000000000701/representation-ticket-r99.webp',
      'en', 'late@example.com', '4035550806'
    );
    raise exception 'submission referenced an actively claimed cleanup path';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CLEANUP_PATH_CLAIMED' then raise; end if;
  end;
end
$$;

-- Release is claim-bound and permits an immediate safe reclaim only because no
-- Storage call has occurred in this SQL exercise.
do $$
begin
  if public.release_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000699'
  ) then
    raise exception 'foreign cleanup claim was released';
  end if;
  if not public.release_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000601'
  ) then
    raise exception 'owned cleanup claim was not released';
  end if;
  perform public.release_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000602'
  );
end
$$;

select * from public.claim_expired_ticket_intake_drafts(
  '00000000-0000-4000-8000-000000000603', 1
);
update public.ticket_intake_drafts
set cleanup_claimed_at = now() - interval '2 hours',
    cleanup_claim_expires_at = now() - interval '1 hour'
where id = '00000000-0000-4000-8000-000000000701';
select * from public.claim_expired_ticket_intake_drafts(
  '00000000-0000-4000-8000-000000000604', 1
);

do $$
begin
  if public.finalize_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000604'
  ) then
    raise exception 'cleanup finalized before pre-delete tombstones existed';
  end if;
end
$$;

select public.record_ticket_intake_draft_cleanup_tombstones(
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000604',
  array[
    encode(sha256(convert_to(
      '00000000-0000-4000-8000-000000000701/representation-ticket-r1.pdf',
      'UTF8'
    )), 'hex'),
    encode(sha256(convert_to(
      '00000000-0000-4000-8000-000000000701/representation-ticket-r2.jpg',
      'UTF8'
    )), 'hex')
  ]
);

do $$
begin
  if public.finalize_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000603'
  ) or public.release_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000603'
  ) then
    raise exception 'expired cleanup owner retained control after reclaim';
  end if;
  if not public.finalize_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000604'
  ) then
    raise exception 'current cleanup owner could not finalize';
  end if;
  if not public.finalize_ticket_intake_draft_cleanup(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000604'
  ) then
    raise exception 'cleanup finalization was not idempotent';
  end if;
  if exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000701'
  ) then
    raise exception 'finalized cleanup retained the expired draft row';
  end if;
  if (
    select count(*)
    from public.ticket_intake_draft_cleanup_tombstones
    where draft_id = '00000000-0000-4000-8000-000000000701'
  ) <> 2 then
    raise exception 'finalize did not tombstone both deleted paths';
  end if;
end
$$;

-- A request that loaded the draft before expiry but inserts after finalization
-- is rejected by the durable folder tombstone even for an unlisted orphan
-- revision after the draft row is gone.
do $$
begin
  begin
    insert into public.ticket_submissions (
      id, client_id, service_type, status, representation_access_token_hash,
      ticket_document_path, preferred_locale, email, phone
    ) values (
      '00000000-0000-4000-8000-000000000807',
      '00000000-0000-4000-8000-000000000906',
      'representation', 'awaiting_payment', (repeat('b', 63) || '1'),
      '00000000-0000-4000-8000-000000000701/representation-ticket-r99.webp',
      'en', 'too-late@example.com', '4035550807'
    );
    raise exception 'late submission referenced a deleted cleanup path';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CLEANUP_PATH_CLAIMED' then raise; end if;
  end;
end
$$;

do $$
declare
  claimed_ids uuid[];
begin
  select array_agg(draft_id order by draft_id) into claimed_ids
  from public.claim_expired_ticket_intake_drafts(
    '00000000-0000-4000-8000-000000000605', 25
  );
  if claimed_ids <> array['00000000-0000-4000-8000-000000000702'::uuid] then
    raise exception 'cleanup included converted, referenced, live, or unexpected drafts';
  end if;
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000704' and status = 'converted'
  ) or not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000705'
  ) or not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000703' and status = 'active'
  ) or not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000706' and status = 'active'
  ) then
    raise exception 'protected draft rows were modified or deleted';
  end if;
end
$$;

-- Converted retention is service-only, bounded and never passes the canonical
-- ticket object into either deletion/tombstone path.
do $$
declare
  purged integer;
begin
  begin
    perform public.purge_expired_converted_ticket_intake_drafts(26);
    raise exception 'oversize converted purge batch was accepted';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CONVERTED_PURGE_LIMIT_INVALID' then raise; end if;
  end;

  select public.purge_expired_converted_ticket_intake_drafts(1) into purged;
  if purged <> 1 then
    raise exception 'eligible converted draft was not purged exactly once';
  end if;
  if exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000704'
  ) then
    raise exception 'converted draft retained duplicate contact, payload or capability data';
  end if;
  if not exists (
    select 1 from public.ticket_submissions
    where id = '00000000-0000-4000-8000-000000000704'
      and client_id = '00000000-0000-4000-8000-000000000904'
      and ticket_document_path = '00000000-0000-4000-8000-000000000704/canonical-replacement-r2.pdf'
      and representation_access_token_hash = (repeat('e', 63) || '4')
  ) or not exists (
    select 1 from public.clients
    where id = '00000000-0000-4000-8000-000000000904'
  ) then
    raise exception 'converted purge removed or changed a canonical case record';
  end if;
  if exists (
    select 1 from public.ticket_intake_draft_cleanup_tombstones
    where draft_id = '00000000-0000-4000-8000-000000000704'
  ) or exists (
    select 1 from public.ticket_intake_draft_object_deletions
    where draft_id = '00000000-0000-4000-8000-000000000704'
  ) then
    raise exception 'converted purge enqueued or tombstoned a canonical case object';
  end if;
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000707'
      and status = 'converted'
  ) then
    raise exception 'converted draft was purged inside its 24-hour post-expiry grace';
  end if;
end
$$;

-- Both subordinate draft foreign keys cascade, so a redundant autosave cannot
-- block an authorized erasure of the canonical submission or client.
do $$
declare
  submission_delete_action "char";
  client_delete_action "char";
begin
  select confdeltype into submission_delete_action
  from pg_constraint
  where conrelid = 'public.ticket_intake_drafts'::regclass
    and conname = 'ticket_intake_drafts_converted_submission_id_fkey';
  select confdeltype into client_delete_action
  from pg_constraint
  where conrelid = 'public.ticket_intake_drafts'::regclass
    and conname = 'ticket_intake_drafts_client_id_fkey';
  if submission_delete_action <> 'c' or client_delete_action <> 'c' then
    raise exception 'converted draft foreign keys are not delete-cascading';
  end if;
end
$$;

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000708',
  (repeat('2', 63) || '8'), (repeat('2', 63) || '8'), 'submission-cascade@example.com', null, 'en',
  '{"email":"submission-cascade@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000708/representation-ticket-r1.pdf',
  'application/pdf', 1900
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000708', (repeat('2', 63) || '8'), 1
);
insert into public.clients (id) values ('00000000-0000-4000-8000-000000000908');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000708',
  '00000000-0000-4000-8000-000000000908',
  'representation', 'awaiting_payment', (repeat('2', 63) || '8'),
  '00000000-0000-4000-8000-000000000708/representation-ticket-r1.pdf',
  'en', 'submission-cascade@example.com', '4035550708'
);
delete from public.ticket_submissions
where id = '00000000-0000-4000-8000-000000000708';

do $$
begin
  if exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000708'
  ) or not exists (
    select 1 from public.clients
    where id = '00000000-0000-4000-8000-000000000908'
  ) then
    raise exception 'submission erasure was blocked or removed the independent client';
  end if;
end
$$;

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000709',
  (repeat('3', 63) || '9'), (repeat('3', 63) || '9'), 'client-cascade@example.com', null, 'en',
  '{"email":"client-cascade@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000709/representation-ticket-r1.pdf',
  'application/pdf', 2000
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000709', (repeat('3', 63) || '9'), 1
);
insert into public.clients (id) values ('00000000-0000-4000-8000-000000000909');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000709',
  '00000000-0000-4000-8000-000000000909',
  'representation', 'awaiting_payment', (repeat('3', 63) || '9'),
  '00000000-0000-4000-8000-000000000709/representation-ticket-r1.pdf',
  'en', 'client-cascade@example.com', '4035550709'
);
delete from public.clients
where id = '00000000-0000-4000-8000-000000000909';

do $$
begin
  if exists (
    select 1 from public.clients
    where id = '00000000-0000-4000-8000-000000000909'
  ) or exists (
    select 1 from public.ticket_submissions
    where id = '00000000-0000-4000-8000-000000000709'
  ) or exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000709'
  ) then
    raise exception 'client erasure was blocked by a converted draft dependency';
  end if;
end
$$;

reset role;
select 'ticket intake draft cleanup assertions passed' as result;
