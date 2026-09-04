\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure(
    'public.save_ticket_intake_draft(uuid,text,bigint,text,text,smallint,smallint,jsonb)'
  ) is not null then
    raise exception 'legacy save RPC overload remains installed';
  end if;
  if has_function_privilege(
    'anon',
    'public.claim_ticket_intake_resume_delivery(uuid,text,uuid,boolean)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.complete_ticket_intake_resume_delivery(uuid,uuid,text,text)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.discard_pending_ticket_intake_draft_upload(uuid,text,bigint)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.save_ticket_intake_draft(uuid,text,bigint,text,text,smallint,smallint,jsonb,text)',
    'execute'
  ) then
    raise exception 'resume delivery RPCs are exposed outside service_role';
  end if;
  if has_table_privilege('anon', 'public.ticket_intake_drafts', 'update') or
     has_table_privilege('authenticated', 'public.ticket_intake_drafts', 'update') then
    raise exception 'resume delivery state is directly mutable';
  end if;
end
$$;

set role service_role;

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000301',
  repeat('7', 64), repeat('9', 64), 'email@example.com', '4035550199', 'pa',
  '{"email":"email@example.com","phone":"4035550199"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000301/representation-ticket-r1.pdf',
  'application/pdf', 1200
);

do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000301';
  if draft.resume_delivery_status <> 'pending' or
     draft.resume_delivery_channel is not null or
     draft.resume_delivery_attempt_count <> 0 then
    raise exception 'new draft did not start with a clean pending outbox';
  end if;
  begin
    perform public.claim_ticket_intake_resume_delivery(
      draft.id, repeat('7', 64), '00000000-0000-4000-8000-000000000401', false
    );
    raise exception 'delivery was claimable before upload confirmation';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_DELIVERY_NOT_READY' then raise; end if;
  end;
end
$$;

select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000301', repeat('7', 64), 1
);

-- Repeating confirmation with the original revision is idempotent.
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000301', repeat('7', 64), 1
);

select public.claim_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000301', repeat('7', 64),
  '00000000-0000-4000-8000-000000000401', false
);

do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.claim_ticket_intake_resume_delivery(
    '00000000-0000-4000-8000-000000000301', repeat('7', 64),
    '00000000-0000-4000-8000-000000000402', false
  );
  if draft.resume_delivery_status <> 'sending' or
     draft.resume_delivery_channel <> 'email' or
     draft.resume_delivery_claim_id <> '00000000-0000-4000-8000-000000000401' or
     draft.resume_delivery_attempt_count <> 1 then
    raise exception 'initial claim was duplicated or did not prefer email';
  end if;
end
$$;

do $$
begin
  begin
    perform public.complete_ticket_intake_resume_delivery(
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000499',
      'failed', 'request_rejected'
    );
    raise exception 'a foreign claim completed delivery';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_DELIVERY_CLAIM_LOST' then raise; end if;
  end;
end
$$;

select public.complete_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000401',
  'failed', 'request_rejected'
);

do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  -- A repeated upload confirmation / initial claim never retries failure.
  select * into draft from public.claim_ticket_intake_resume_delivery(
    '00000000-0000-4000-8000-000000000301', repeat('7', 64),
    '00000000-0000-4000-8000-000000000402', false
  );
  if draft.resume_delivery_status <> 'failed' or draft.resume_delivery_attempt_count <> 1 then
    raise exception 'initial path retried a definite failure';
  end if;
end
$$;

select public.claim_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000301', repeat('7', 64),
  '00000000-0000-4000-8000-000000000402', true
);
select public.complete_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000402',
  'indeterminate', 'outcome_unknown'
);

do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  update public.ticket_intake_drafts
  set resume_delivery_claim_expires_at = now() - interval '1 hour'
  where id = '00000000-0000-4000-8000-000000000301';
  select * into draft from public.claim_ticket_intake_resume_delivery(
    '00000000-0000-4000-8000-000000000301', repeat('7', 64),
    '00000000-0000-4000-8000-000000000403', true
  );
  if draft.resume_delivery_status <> 'sending' or
     draft.resume_delivery_failure_code <> 'outcome_unknown' or
     draft.resume_delivery_claim_id <> '00000000-0000-4000-8000-000000000402' or
     draft.resume_delivery_attempt_count <> 2 then
    raise exception 'ambiguous delivery was retried after lease expiry';
  end if;
end
$$;

-- Changing contact after a delivery claim rotates the bearer capability and
-- resets the outbox without initiating another delivery.
select public.save_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000301', repeat('7', 64), 2,
  'changed@example.com', '4035550199', 2::smallint, 1::smallint,
  '{"email":"changed@example.com","phone":"4035550199"}'::jsonb,
  repeat('2', 64)
);
do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000301';
  if draft.access_token_hash <> repeat('2', 64) or
     draft.resume_delivery_generation <> 2 or
     draft.email <> 'changed@example.com' or
     draft.resume_delivery_status <> 'pending' or
     draft.resume_delivery_channel is not null or
     draft.resume_delivery_attempt_count <> 0 or
     draft.resume_delivery_claim_id is not null or
     draft.revision <> 3 then
    raise exception 'contact change did not rotate capability and reset delivery atomically';
  end if;
  begin
    perform public.claim_ticket_intake_resume_delivery(
      draft.id, repeat('7', 64),
      '00000000-0000-4000-8000-000000000406', false
    );
    raise exception 'old capability remained valid after contact change';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_DELIVERY_ACCESS_DENIED' then raise; end if;
  end;
end
$$;

-- Saving unchanged contact with the replacement capability does not rotate it again.
select public.save_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000301', repeat('2', 64), 3,
  'changed@example.com', '4035550199', 2::smallint, 1::smallint,
  '{"email":"changed@example.com","phone":"4035550199"}'::jsonb,
  repeat('1', 64)
);
do $$
begin
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000301'
      and access_token_hash = repeat('2', 64)
      and resume_delivery_generation = 2
      and revision = 4
      and resume_delivery_status = 'pending'
  ) then
    raise exception 'unchanged contact unexpectedly rotated capability';
  end if;
end
$$;

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000302',
  repeat('8', 64), repeat('8', 64), null, '14035550198', 'en', '{}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000302/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000302', repeat('8', 64), 1
);
select public.claim_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000302', repeat('8', 64),
  '00000000-0000-4000-8000-000000000404', false
);
select public.complete_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000404',
  'sent', null
);

do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.claim_ticket_intake_resume_delivery(
    '00000000-0000-4000-8000-000000000302', repeat('8', 64),
    '00000000-0000-4000-8000-000000000405', false
  );
  if draft.resume_delivery_status <> 'sent' or
     draft.resume_delivery_channel <> 'sms' or
     draft.resume_delivery_sent_at is null or
     draft.resume_delivery_attempt_count <> 1 or
     draft.resume_delivery_claim_id <> '00000000-0000-4000-8000-000000000404' then
    raise exception 'sent SMS delivery was duplicated or lost audit state';
  end if;
end
$$;

-- A replacement never displaces the last confirmed object until confirmation.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000303',
  repeat('6', 64), repeat('5', 64), 'replace@example.com', null, 'en', '{}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000303/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000303', repeat('6', 64), 1
);
select public.prepare_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000303', repeat('6', 64), 2,
  '00000000-0000-4000-8000-000000000303/representation-ticket-r3.jpg',
  'image/jpeg', 2400
);
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000203');
do $$
begin
  begin
    insert into public.ticket_submissions (
      id, client_id, service_type, status, representation_access_token_hash,
      ticket_document_path, preferred_locale, email, phone
    ) values (
      '00000000-0000-4000-8000-000000000303',
      '00000000-0000-4000-8000-000000000203',
      'representation', 'awaiting_payment', repeat('6', 64),
      '00000000-0000-4000-8000-000000000303/representation-ticket-r1.pdf',
      'en', 'replace@example.com', '4035550111'
    );
    raise exception 'draft converted while a replacement was pending';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CONVERSION_INVALID' then raise; end if;
  end;
  if exists (
    select 1 from public.ticket_submissions
    where id = '00000000-0000-4000-8000-000000000303'
  ) then
    raise exception 'pending-replacement conversion did not roll back';
  end if;
end
$$;
do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000303';
  if draft.ticket_document_path <> '00000000-0000-4000-8000-000000000303/representation-ticket-r1.pdf' or
     draft.ticket_document_content_type <> 'application/pdf' or
     draft.ticket_document_size_bytes <> 1200 or
     draft.ticket_uploaded_at is null or
     draft.pending_ticket_document_path <> '00000000-0000-4000-8000-000000000303/representation-ticket-r3.jpg' then
    raise exception 'preparing a replacement displaced the confirmed object';
  end if;
end
$$;
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000303', repeat('6', 64), 3
);
do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000303';
  if draft.ticket_document_path <> '00000000-0000-4000-8000-000000000303/representation-ticket-r3.jpg' or
     draft.ticket_document_content_type <> 'image/jpeg' or
     draft.ticket_document_size_bytes <> 2400 or
     draft.ticket_uploaded_at is null or
     draft.pending_ticket_document_path is not null or
     draft.revision <> 4 then
    raise exception 'confirmed replacement did not swap atomically';
  end if;
end
$$;

-- An interrupted replacement can be discarded without losing the confirmed
-- ticket, after which final conversion can use that confirmed object.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000304',
  repeat('4', 64), repeat('3', 64), 'discard@example.com', null, 'en', '{}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000304/representation-ticket-r1.pdf',
  'application/pdf', 1300
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000304', repeat('4', 64), 1
);
select public.prepare_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000304', repeat('4', 64), 2,
  '00000000-0000-4000-8000-000000000304/representation-ticket-r3.jpg',
  'image/jpeg', 2500
);
select public.discard_pending_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000304', repeat('4', 64), 3
);
-- The repeated action is idempotent even with the pre-discard revision.
select public.discard_pending_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000304', repeat('4', 64), 3
);
do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000304';
  if draft.ticket_document_path <> '00000000-0000-4000-8000-000000000304/representation-ticket-r1.pdf' or
     draft.ticket_document_content_type <> 'application/pdf' or
     draft.ticket_document_size_bytes <> 1300 or
     draft.ticket_uploaded_at is null or
     draft.pending_ticket_document_path is not null or
     draft.revision <> 4 then
    raise exception 'discard did not preserve the confirmed ticket atomically';
  end if;
end
$$;
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000204');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000304',
  '00000000-0000-4000-8000-000000000204',
  'representation', 'awaiting_payment', repeat('4', 64),
  '00000000-0000-4000-8000-000000000304/representation-ticket-r1.pdf',
  'en', 'discard@example.com', '4035550112'
);
do $$
begin
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000304'
      and status = 'converted'
      and pending_ticket_document_path is null
      and ticket_document_path = '00000000-0000-4000-8000-000000000304/representation-ticket-r1.pdf'
  ) then
    raise exception 'discarded replacement did not restore conversion';
  end if;
end
$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.staff', 'false', false);
do $$
begin
  if exists (select 1 from public.ticket_intake_drafts) then
    raise exception 'non-staff can read resume delivery state';
  end if;
end
$$;
select set_config('request.jwt.claim.staff', 'true', false);
do $$
begin
  if not exists (
    select 1 from public.ticket_intake_drafts
    where resume_delivery_status in ('sent', 'sending')
  ) then
    raise exception 'staff cannot inspect resume delivery state';
  end if;
end
$$;

reset role;
select 'ticket intake resume delivery assertions passed' as result;
