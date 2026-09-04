\set ON_ERROR_STOP on

set role service_role;

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000981',
  repeat('c9', 32), repeat('d9', 32), 'staff-lead@example.com', null, 'en',
  '{"email":"staff-lead@example.com"}'::jsonb,
  2::smallint, 1::smallint,
  '00000000-0000-4000-8000-000000000981/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000981', repeat('c9', 32), 1
);

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000982',
  repeat('e9', 32), repeat('f9', 32), 'no-upload@example.com', null, 'en',
  '{"email":"no-upload@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000982/representation-ticket-r1.pdf',
  'application/pdf', 1200
);

reset role;

do $$
begin
  if has_function_privilege(
    'anon', 'public.set_ticket_intake_follow_up_status(uuid,text,text)', 'execute'
  ) or has_function_privilege(
    'service_role', 'public.set_ticket_intake_follow_up_status(uuid,text,text)', 'execute'
  ) or not has_function_privilege(
    'authenticated', 'public.set_ticket_intake_follow_up_status(uuid,text,text)', 'execute'
  ) then
    raise exception 'staff follow-up RPC grants are incorrect';
  end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000991', false);
select set_config('request.jwt.claim.staff', 'false', false);

do $$
begin
  begin
    perform public.set_ticket_intake_follow_up_status(
      '00000000-0000-4000-8000-000000000981', 'open', 'contacted'
    );
    raise exception 'nonstaff disposition update succeeded';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_FOLLOW_UP_STAFF_REQUIRED' then raise; end if;
  end;
end
$$;

select set_config('request.jwt.claim.staff', 'true', false);

do $$
begin
  begin
    update public.ticket_intake_drafts
    set staff_follow_up_status = 'dismissed'
    where id = '00000000-0000-4000-8000-000000000981';
    raise exception 'authenticated direct disposition update succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;

do $$
begin
  begin
    perform public.set_ticket_intake_follow_up_status(
      '00000000-0000-4000-8000-000000000981', 'open', 'invalid'
    );
    raise exception 'invalid disposition was accepted';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_FOLLOW_UP_STATUS_INVALID' then raise; end if;
  end;

  begin
    perform public.set_ticket_intake_follow_up_status(
      '00000000-0000-4000-8000-000000000982', 'open', 'contacted'
    );
    raise exception 'unconfirmed upload entered staff lifecycle';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_FOLLOW_UP_NOT_AVAILABLE' then raise; end if;
  end;
end
$$;

do $$
declare
  result record;
  first_change timestamptz;
begin
  select * into result
  from public.set_ticket_intake_follow_up_status(
    '00000000-0000-4000-8000-000000000981', 'open', 'contacted'
  );
  if result.follow_up_status <> 'contacted' or
     result.follow_up_updated_at is null or
     result.follow_up_updated_by <> '00000000-0000-4000-8000-000000000991' then
    raise exception 'contacted disposition audit is incomplete';
  end if;
  first_change := result.follow_up_updated_at;

  select * into result
  from public.set_ticket_intake_follow_up_status(
    '00000000-0000-4000-8000-000000000981', 'contacted', 'contacted'
  );
  if result.follow_up_updated_at <> first_change then
    raise exception 'idempotent disposition call rewrote audit time';
  end if;

  begin
    perform public.set_ticket_intake_follow_up_status(
      '00000000-0000-4000-8000-000000000981', 'open', 'dismissed'
    );
    raise exception 'stale disposition update overwrote newer staff state';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_FOLLOW_UP_CONFLICT' then raise; end if;
  end;

  select * into result
  from public.set_ticket_intake_follow_up_status(
    '00000000-0000-4000-8000-000000000981', 'contacted', 'dismissed'
  );
  if result.follow_up_status <> 'dismissed' or
     result.follow_up_updated_at < first_change then
    raise exception 'dismissed disposition was not recorded';
  end if;

  select * into result
  from public.set_ticket_intake_follow_up_status(
    '00000000-0000-4000-8000-000000000981', 'dismissed', 'open'
  );
  if result.follow_up_status <> 'open' or
     result.follow_up_updated_at is null or
     result.follow_up_updated_by <> '00000000-0000-4000-8000-000000000991' then
    raise exception 'reopened disposition audit is incomplete';
  end if;
end
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000981'
      and staff_follow_up_status = 'open'
      and staff_follow_up_updated_at is not null
      and staff_follow_up_updated_by = '00000000-0000-4000-8000-000000000991'
      and resume_delivery_attempt_count = 0
      and contact_permission = true
  ) then
    raise exception 'staff lifecycle changed delivery/consent state or lost audit data';
  end if;
end
$$;

select 'ticket intake staff follow-up tests passed' as result;
