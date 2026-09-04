\set ON_ERROR_STOP on

do $$
begin
  if has_function_privilege(
    'anon',
    'public.save_ticket_intake_draft(uuid,text,bigint,text,text,smallint,smallint,jsonb,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.save_ticket_intake_draft(uuid,text,bigint,text,text,smallint,smallint,jsonb,text)',
    'execute'
  ) then
    raise exception 'rotation-aware save RPC is exposed outside service_role';
  end if;
end
$$;

set role service_role;

select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000305',
  repeat('d', 64), (repeat('1', 63) || 'a'), 'old@example.com', '4035550105', 'en',
  '{"email":"old@example.com","phone":"4035550105","ticketNumber":"ROTATE-1"}'::jsonb,
  3::smallint, 2::smallint,
  '00000000-0000-4000-8000-000000000305/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000305', repeat('d', 64), 1
);
select public.claim_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000305', repeat('d', 64),
  '00000000-0000-4000-8000-000000000505', false
);
select public.complete_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000305',
  '00000000-0000-4000-8000-000000000505',
  'failed', 'request_rejected'
);

-- A contact change after a delivery claim revokes the old capability in the
-- same transaction and adopts only the client-retained candidate hash.
select public.save_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000305', repeat('d', 64), 2,
  'new@example.com', '4035550105', 2::smallint, 1::smallint,
  '{"email":"new@example.com","phone":"4035550105","ticketNumber":"ROTATE-1"}'::jsonb,
  repeat('c', 64)
);

do $$
declare
  draft public.ticket_intake_drafts%rowtype;
begin
  select * into draft from public.ticket_intake_drafts
  where id = '00000000-0000-4000-8000-000000000305';
  if draft.access_token_hash <> repeat('c', 64) or
     draft.revision <> 3 or
     draft.completed_step <> 2 or
     draft.resume_delivery_generation <> 2 or
     draft.resume_delivery_status <> 'pending' or
     draft.resume_delivery_attempt_count <> 0 then
    raise exception 'contact save did not atomically rotate and reset delivery';
  end if;
end
$$;

-- Replaying the exact request after its HTTP response was lost authenticates
-- with the retained candidate, returns the committed row, and changes nothing.
select public.save_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000305', repeat('d', 64), 2,
  'new@example.com', '4035550105', 2::smallint, 1::smallint,
  '{"email":"new@example.com","phone":"4035550105","ticketNumber":"ROTATE-1"}'::jsonb,
  repeat('c', 64)
);
do $$
begin
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000305'
      and access_token_hash = repeat('c', 64)
      and revision = 3
      and resume_delivery_generation = 2
  ) then
    raise exception 'exact replay rotated or incremented the draft twice';
  end if;

  begin
    perform public.save_ticket_intake_draft(
      '00000000-0000-4000-8000-000000000305', repeat('d', 64), 2,
      'new@example.com', '4035550105', 2::smallint, 1::smallint,
      '{"email":"new@example.com","phone":"4035550105","ticketNumber":"DIFFERENT"}'::jsonb,
      repeat('c', 64)
    );
    raise exception 'mismatched replay was accepted';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_REVISION_CONFLICT' then raise; end if;
  end;

  begin
    perform public.save_ticket_intake_draft(
      '00000000-0000-4000-8000-000000000305', repeat('d', 64), 3,
      'new@example.com', '4035550105', 2::smallint, 1::smallint,
      '{"email":"new@example.com","phone":"4035550105","ticketNumber":"ROTATE-1"}'::jsonb,
      repeat('b', 64)
    );
    raise exception 'revoked old capability was accepted';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_REVISION_CONFLICT' then raise; end if;
  end;
end
$$;

-- A legacy NULL is allowed only when rotation is unnecessary; a rotating save
-- still requires a distinct client-retained candidate.
select public.claim_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000305', repeat('c', 64),
  '00000000-0000-4000-8000-000000000506', false
);
select public.complete_ticket_intake_resume_delivery(
  '00000000-0000-4000-8000-000000000305',
  '00000000-0000-4000-8000-000000000506',
  'failed', 'request_rejected'
);
do $$
begin
  begin
    perform public.save_ticket_intake_draft(
      '00000000-0000-4000-8000-000000000305', repeat('c', 64), 3,
      'third@example.com', '4035550105', 2::smallint, 1::smallint,
      '{"email":"third@example.com","phone":"4035550105","ticketNumber":"ROTATE-1"}'::jsonb,
      null
    );
    raise exception 'null replacement capability was accepted';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_REPLACEMENT_CAPABILITY_INVALID' then raise; end if;
  end;
  begin
    perform public.save_ticket_intake_draft(
      '00000000-0000-4000-8000-000000000305', repeat('c', 64), 3,
      'new@example.com', '4035550105', 2::smallint, 1::smallint,
      '{"email":"new@example.com","phone":"4035550105","ticketNumber":"ROTATE-1"}'::jsonb,
      repeat('c', 64)
    );
    raise exception 'active capability was accepted as its own replacement';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_REPLACEMENT_CAPABILITY_INVALID' then raise; end if;
  end;
end
$$;

-- Before any delivery attempt, a legacy contact edit keeps the old capability;
-- an unused candidate still cannot authenticate a later request.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000306',
  repeat('9', 64), (repeat('1', 63) || 'b'), 'before@example.com', null, 'en',
  '{"email":"before@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000306/representation-ticket-r1.pdf',
  'application/pdf', 1200
);
select public.save_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000306', repeat('9', 64), 1,
  'after@example.com', null, 1::smallint, 0::smallint,
  '{"email":"after@example.com"}'::jsonb,
  null
);
do $$
begin
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000306'
      and access_token_hash = repeat('9', 64)
      and revision = 2
      and resume_delivery_generation = 1
  ) then
    raise exception 'unattempted draft unexpectedly rotated';
  end if;
  begin
    perform public.save_ticket_intake_draft(
      '00000000-0000-4000-8000-000000000306', repeat('8', 64), 2,
      'after@example.com', null, 1::smallint, 0::smallint,
      '{"email":"after@example.com"}'::jsonb,
      repeat('7', 64)
    );
    raise exception 'unused candidate authenticated a replay';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_REVISION_CONFLICT' then raise; end if;
  end;
end
$$;

reset role;
select 'ticket intake rotation recovery assertions passed' as result;
