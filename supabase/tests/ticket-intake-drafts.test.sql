\set ON_ERROR_STOP on

do $$
begin
  if has_table_privilege('anon', 'public.ticket_intake_drafts', 'select') or
     has_table_privilege('anon', 'public.ticket_intake_drafts', 'insert') or
     has_table_privilege('authenticated', 'public.ticket_intake_drafts', 'insert') then
    raise exception 'draft table is directly exposed';
  end if;
  if has_table_privilege('anon', 'public.ticket_cache', 'select') or
     has_table_privilege('authenticated', 'public.ticket_cache', 'update') then
    raise exception 'legacy ticket cache remains exposed';
  end if;
  if has_function_privilege('anon', 'public.create_ticket_intake_draft(uuid,text,text,text,text,text,jsonb,smallint,smallint,text,text,integer)', 'execute') then
    raise exception 'anonymous role can call the privileged draft create RPC';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'System can upload consent forms') then
    raise exception 'legacy consent upload policy remains installed';
  end if;
end
$$;

set role service_role;

insert into public.ticket_intake_draft_rate_limits (
  request_fingerprint, window_started_at, create_count, updated_at
) values (repeat('e', 64), now() - interval '3 hours', 1, now() - interval '3 hours');

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000101',
  repeat('a', 64), repeat('f', 64), 'lead@example.com', null, 'en',
  '{"email":"lead@example.com","ticketType":"officer_issued"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000101/representation-ticket-r1.pdf',
  'application/pdf', 1200
);

do $$
begin
  if exists (
    select 1 from public.ticket_intake_draft_rate_limits
    where request_fingerprint = repeat('e', 64)
  ) then
    raise exception 'stale request fingerprint was not removed';
  end if;
end
$$;

do $$
declare
  draft_id uuid;
  token_hash text;
  path text;
begin
  for index in 2..5 loop
    draft_id := ('00000000-0000-4000-8000-' || lpad((100 + index)::text, 12, '0'))::uuid;
    token_hash := lpad(index::text, 64, '0');
    path := draft_id::text || '/representation-ticket-r1.pdf';
    perform public.create_ticket_intake_draft(
      draft_id, token_hash, repeat('f', 64), 'lead@example.com', null, 'en', '{}'::jsonb,
      1::smallint, 0::smallint, path, 'application/pdf', 1200
    );
  end loop;
  begin
    draft_id := '00000000-0000-4000-8000-000000000106';
    perform public.create_ticket_intake_draft(
      draft_id, repeat('6', 64), repeat('f', 64), 'lead@example.com', null, 'en', '{}'::jsonb,
      1::smallint, 0::smallint, draft_id::text || '/representation-ticket-r1.pdf', 'application/pdf', 1200
    );
    raise exception 'sixth draft create unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CREATE_RATE_LIMIT' then raise; end if;
  end;
end
$$;

select public.save_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000101', repeat('a', 64), 1,
  'updated@example.com', null, 2::smallint, 1::smallint,
  '{"email":"updated@example.com","firstName":"Test"}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000101'
      and email = 'updated@example.com'
      and draft_data ->> 'email' = 'updated@example.com'
  ) then
    raise exception 'saved contact and draft data were not synchronized';
  end if;
end
$$;

do $$
begin
  begin
    perform public.save_ticket_intake_draft(
      '00000000-0000-4000-8000-000000000101', repeat('a', 64), 1,
      'lead@example.com', null, 2::smallint, 1::smallint, '{}'::jsonb
    );
    raise exception 'stale draft save unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_REVISION_CONFLICT' then raise; end if;
  end;
end
$$;

select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000101', repeat('a', 64), 2
);

insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000201');

do $$
declare
  blocked_id constant uuid := '00000000-0000-4000-8000-000000000107';
  blocked_status text;
begin
  perform public.create_ticket_intake_draft(
    blocked_id, repeat('b', 64), repeat('d', 64), 'blocked@example.com', '4035550199', 'en', '{}'::jsonb,
    1::smallint, 0::smallint, blocked_id::text || '/representation-ticket-r1.pdf', 'application/pdf', 1200
  );
  perform public.confirm_ticket_intake_draft_upload(blocked_id, repeat('b', 64), 1);
  begin
    insert into public.ticket_submissions (
      id, client_id, service_type, status, representation_access_token_hash,
      ticket_document_path, preferred_locale, email, phone
    ) values (
      blocked_id, '00000000-0000-4000-8000-000000000201',
      'representation', 'awaiting_payment', repeat('c', 64),
      blocked_id::text || '/representation-ticket-r1.pdf',
      'en', 'blocked@example.com', '4035550199'
    );
    raise exception 'wrong capability unexpectedly converted a draft';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CONVERSION_INVALID' then raise; end if;
  end;
  select status into blocked_status from public.ticket_intake_drafts where id = blocked_id;
  if blocked_status <> 'active' or exists (select 1 from public.ticket_submissions where id = blocked_id) then
    raise exception 'failed conversion did not roll back atomically';
  end if;
end
$$;

insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  'representation', 'awaiting_payment', repeat('a', 64),
  '00000000-0000-4000-8000-000000000101/representation-ticket-r1.pdf',
  'en', 'updated@example.com', '4035550123'
);

do $$
declare
  converted public.ticket_intake_drafts%rowtype;
begin
  select * into converted from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000101';
  if converted.status <> 'converted' or
     converted.converted_submission_id <> converted.id or
     converted.client_id <> '00000000-0000-4000-8000-000000000201' or
     converted.draft_data ->> 'firstName' <> 'Test' or
     converted.email <> 'updated@example.com' or
     converted.draft_data ->> 'email' <> 'updated@example.com' or
     converted.contact_permission_version <> 'ticket-intake-follow-up-v1' or
     converted.contact_permission_recorded_at is null then
    raise exception 'draft conversion was not atomic or lost cancel-recovery data';
  end if;
end
$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.staff', 'false', false);
do $$
begin
  if exists (select 1 from public.ticket_intake_drafts) then
    raise exception 'non-staff authenticated user can read drafts';
  end if;
end
$$;
select set_config('request.jwt.claim.staff', 'true', false);
do $$
begin
  if not exists (select 1 from public.ticket_intake_drafts) then
    raise exception 'staff cannot read the draft queue';
  end if;
end
$$;

reset role;
select 'ticket intake draft migration assertions passed' as result;
