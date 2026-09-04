set client_min_messages = warning;

-- Application roles cannot inspect paths or drive the deletion worker RPCs.
do $$
begin
  if has_table_privilege(
    'anon', 'public.ticket_intake_draft_object_deletions', 'select'
  ) or has_table_privilege(
    'authenticated', 'public.ticket_intake_draft_object_deletions', 'select'
  ) or has_function_privilege(
    'anon', 'public.claim_ticket_intake_draft_object_deletions(uuid,integer)', 'execute'
  ) or has_function_privilege(
    'authenticated', 'public.finalize_ticket_intake_draft_object_deletion(uuid,uuid)', 'execute'
  ) then
    raise exception 'application role can access the private object deletion queue';
  end if;
end
$$;

set role service_role;

-- Replacing an unconfirmed upload queues its former exact path before the row
-- moves, even if the best-effort Storage delete later fails.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000811',
  (repeat('4', 63) || 'a'), (repeat('4', 63) || 'a'), 'queue-one@example.com', null, 'en',
  '{"email":"queue-one@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000811/representation-ticket-r1.pdf',
  'application/pdf', 1100
);
select public.prepare_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000811', (repeat('4', 63) || 'a'), 1,
  '00000000-0000-4000-8000-000000000811/representation-ticket-r2.jpg',
  'image/jpeg', 1200
);

do $$
begin
  if not exists (
    select 1 from public.ticket_intake_draft_object_deletions queued
    where queued.draft_id = '00000000-0000-4000-8000-000000000811'
      and queued.object_path = '00000000-0000-4000-8000-000000000811/representation-ticket-r1.pdf'
      and queued.deleted_at is null
      and queued.eligible_at >= queued.queued_at + interval '24 hours'
  ) or not exists (
    select 1 from public.ticket_intake_drafts draft
    where draft.id = '00000000-0000-4000-8000-000000000811'
      and draft.ticket_document_path = '00000000-0000-4000-8000-000000000811/representation-ticket-r2.jpg'
      and draft.revision = 2
  ) then
    raise exception 'unconfirmed replacement did not atomically retain its old path';
  end if;
end
$$;

-- Supersede, discard and confirm each queue the only path their transaction
-- clears. No folder enumeration or inferred revision enters this ledger.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000812',
  (repeat('5', 63) || 'b'), (repeat('5', 63) || 'b'), 'queue-two@example.com', null, 'en',
  '{"email":"queue-two@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000812/representation-ticket-r1.png',
  'image/png', 1300
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000812', (repeat('5', 63) || 'b'), 1
);
select public.prepare_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000812', (repeat('5', 63) || 'b'), 2,
  '00000000-0000-4000-8000-000000000812/representation-ticket-r3.webp',
  'image/webp', 1400
);
select public.prepare_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000812', (repeat('5', 63) || 'b'), 3,
  '00000000-0000-4000-8000-000000000812/representation-ticket-r4.heic',
  'image/heic', 1500
);
select public.discard_pending_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000812', (repeat('5', 63) || 'b'), 4
);
select public.prepare_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000812', (repeat('5', 63) || 'b'), 5,
  '00000000-0000-4000-8000-000000000812/representation-ticket-r6.heif',
  'image/heif', 1600
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000812', (repeat('5', 63) || 'b'), 6
);

do $$
declare
  queued_paths text[];
begin
  select array_agg(object_path order by object_path) into queued_paths
  from public.ticket_intake_draft_object_deletions
  where draft_id = '00000000-0000-4000-8000-000000000812';
  if queued_paths <> array[
    '00000000-0000-4000-8000-000000000812/representation-ticket-r1.png',
    '00000000-0000-4000-8000-000000000812/representation-ticket-r3.webp',
    '00000000-0000-4000-8000-000000000812/representation-ticket-r4.heic'
  ]::text[] then
    raise exception 'known superseded paths were not queued exactly';
  end if;
  if not exists (
    select 1 from public.ticket_intake_drafts
    where id = '00000000-0000-4000-8000-000000000812'
      and ticket_document_path = '00000000-0000-4000-8000-000000000812/representation-ticket-r6.heif'
      and pending_ticket_document_path is null
      and ticket_uploaded_at is not null
      and revision = 7
  ) then
    raise exception 'confirmed replacement did not preserve the new current ticket';
  end if;
end
$$;

-- A queued exact path is fenced from a stale submission throughout deletion.
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000912');
do $$
begin
  begin
    insert into public.ticket_submissions (
      id, client_id, service_type, status, representation_access_token_hash,
      ticket_document_path, preferred_locale, email, phone
    ) values (
      '00000000-0000-4000-8000-000000000912',
      '00000000-0000-4000-8000-000000000912',
      'representation', 'awaiting_payment', (repeat('5', 63) || 'b'),
      '00000000-0000-4000-8000-000000000812/representation-ticket-r3.webp',
      'en', 'stale-queue@example.com', '4035550912'
    );
    raise exception 'stale submission referenced a queued deletion path';
  exception when others then
    if sqlerrm <> 'TICKET_INTAKE_CLEANUP_PATH_CLAIMED' then raise; end if;
  end;
end
$$;

-- One lease owns a path at a time. A second claimant sees nothing; after lease
-- expiry it can reclaim, while the stale owner cannot finalize or release it.
update public.ticket_intake_draft_object_deletions
set queued_at = now() - interval '25 hours',
    eligible_at = now() - interval '1 hour'
where object_path = '00000000-0000-4000-8000-000000000812/representation-ticket-r3.webp';
update public.ticket_intake_draft_object_deletions
set eligible_at = now() + interval '2 days'
where deleted_at is null
  and object_path <> '00000000-0000-4000-8000-000000000812/representation-ticket-r3.webp';

create temporary table first_object_claim as
select * from public.claim_ticket_intake_draft_object_deletions(
  '00000000-0000-4000-8000-000000000621', 1
);

do $$
begin
  if (select count(*) from first_object_claim) <> 1 or exists (
    select 1 from public.claim_ticket_intake_draft_object_deletions(
      '00000000-0000-4000-8000-000000000622', 25
    )
  ) then
    raise exception 'concurrent cleanup claimant duplicated an active lease';
  end if;
end
$$;

update public.ticket_intake_draft_object_deletions queued
set cleanup_claimed_at = now() - interval '2 hours',
    cleanup_claim_expires_at = now() - interval '1 hour'
from first_object_claim first_claim
where queued.id = first_claim.deletion_id;

create temporary table reclaimed_object as
select * from public.claim_ticket_intake_draft_object_deletions(
  '00000000-0000-4000-8000-000000000622', 1
);

do $$
declare
  deletion uuid;
begin
  select deletion_id into deletion from reclaimed_object;
  if deletion is null then
    raise exception 'expired object deletion lease was not reclaimed';
  end if;
  if public.finalize_ticket_intake_draft_object_deletion(
    deletion, '00000000-0000-4000-8000-000000000621'
  ) or public.release_ticket_intake_draft_object_deletion(
    deletion, '00000000-0000-4000-8000-000000000621'
  ) then
    raise exception 'stale object deletion claimant retained control';
  end if;
  if not public.finalize_ticket_intake_draft_object_deletion(
    deletion, '00000000-0000-4000-8000-000000000622'
  ) or not public.finalize_ticket_intake_draft_object_deletion(
    deletion, '00000000-0000-4000-8000-000000000622'
  ) then
    raise exception 'current claimant could not finalize idempotently';
  end if;
end
$$;

-- A path already referenced by a converted case is never claimable, even if a
-- privileged repair accidentally places it in the queue.
select public.create_ticket_intake_draft(
  '00000000-0000-4000-8000-000000000813',
  (repeat('6', 63) || 'c'), (repeat('6', 63) || 'c'), 'converted-queue@example.com', null, 'en',
  '{"email":"converted-queue@example.com"}'::jsonb,
  1::smallint, 0::smallint,
  '00000000-0000-4000-8000-000000000813/representation-ticket-r1.pdf',
  'application/pdf', 1700
);
select public.confirm_ticket_intake_draft_upload(
  '00000000-0000-4000-8000-000000000813', (repeat('6', 63) || 'c'), 1
);
insert into public.clients (id)
values ('00000000-0000-4000-8000-000000000913');
insert into public.ticket_submissions (
  id, client_id, service_type, status, representation_access_token_hash,
  ticket_document_path, preferred_locale, email, phone
) values (
  '00000000-0000-4000-8000-000000000813',
  '00000000-0000-4000-8000-000000000913',
  'representation', 'awaiting_payment', (repeat('6', 63) || 'c'),
  '00000000-0000-4000-8000-000000000813/representation-ticket-r1.pdf',
  'en', 'converted-queue@example.com', '4035550913'
);
insert into public.ticket_intake_draft_object_deletions (
  draft_id, object_path, queued_at, eligible_at
) values (
  '00000000-0000-4000-8000-000000000813',
  '00000000-0000-4000-8000-000000000813/representation-ticket-r1.pdf',
  now() - interval '25 hours',
  now() - interval '1 hour'
);

do $$
begin
  if exists (
    select 1 from public.claim_ticket_intake_draft_object_deletions(
      '00000000-0000-4000-8000-000000000623', 25
    ) where draft_id = '00000000-0000-4000-8000-000000000813'
  ) then
    raise exception 'converted case document entered the deletion worker';
  end if;
end
$$;

reset role;
select 'ticket intake object deletion queue assertions passed' as result;
