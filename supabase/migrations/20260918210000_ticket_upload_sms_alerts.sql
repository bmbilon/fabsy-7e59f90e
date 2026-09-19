begin;

-- Separate from email because Twilio Message creation has no Resend-style
-- idempotency fence. Each newly confirmed upload gets at most one SMS attempt.
create table public.ticket_upload_sms_alerts (
  alert_id uuid primary key references public.ticket_upload_alerts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','accepted','failed','indeterminate','cancelled')),
  claim_id uuid,
  claim_expires_at timestamptz,
  attempted_at timestamptz,
  provider_message_sid text check (provider_message_sid is null or provider_message_sid ~ '^SM[0-9a-fA-F]{32}$'),
  accepted_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (status <> 'sending' or (claim_id is not null and claim_expires_at is not null and attempted_at is not null)),
  check (status <> 'accepted' or (provider_message_sid is not null and accepted_at is not null))
);
alter table public.ticket_upload_sms_alerts enable row level security;
alter table public.ticket_upload_sms_alerts force row level security;
revoke all on public.ticket_upload_sms_alerts from public, anon, authenticated;
grant select, insert, update, delete on public.ticket_upload_sms_alerts to service_role;
create index ticket_upload_sms_alerts_pending_idx on public.ticket_upload_sms_alerts(created_at)
  where status in ('pending','sending');

create function public.queue_ticket_upload_sms_alert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.ticket_upload_sms_alerts(alert_id) values(new.id) on conflict do nothing;
  return new;
end $$;
create trigger queue_ticket_upload_sms_alert after insert on public.ticket_upload_alerts
  for each row execute function public.queue_ticket_upload_sms_alert();
-- Intentionally no backfill: old uploads must not generate surprise SMS alerts.

create function public.claim_ticket_upload_sms_alerts(p_limit integer default 10)
returns setof public.ticket_upload_sms_alerts
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'TICKET_UPLOAD_SMS_LIMIT_INVALID';
  end if;
  update public.ticket_upload_sms_alerts set status='indeterminate',
      failure_code='claim_expired',claim_id=null,claim_expires_at=null
    where status='sending' and claim_expires_at<=clock_timestamp();
  -- Check current eligibility before starting a send. Deletion/expiry/revoked
  -- contact permission after upload must not revive a closed intake via SMS.
  update public.ticket_upload_sms_alerts s set status='cancelled',failure_code='intake_unavailable'
    from public.ticket_upload_alerts a join public.ticket_intake_drafts d on d.id=a.draft_id
    where s.alert_id=a.id and s.status='pending' and
      (d.deleted_at is not null or d.expires_at<=clock_timestamp() or
       d.status not in ('active','converted') or not d.contact_permission);
  return query
  with candidates as (
    select s.alert_id from public.ticket_upload_sms_alerts s
    join public.ticket_upload_alerts a on a.id=s.alert_id
    join public.ticket_intake_drafts d on d.id=a.draft_id
    where s.status='pending' and d.deleted_at is null and d.expires_at>clock_timestamp()
      and d.status in ('active','converted') and d.contact_permission
    order by s.created_at,s.alert_id limit p_limit for update of s skip locked
  )
  update public.ticket_upload_sms_alerts a set status='sending',claim_id=gen_random_uuid(),
      claim_expires_at=clock_timestamp()+interval '3 minutes',attempted_at=clock_timestamp()
    from candidates c where a.alert_id=c.alert_id returning a.*;
end $$;

create function public.finish_ticket_upload_sms_alert(
  p_alert_id uuid,p_claim_id uuid,p_status text,
  p_provider_message_sid text default null,p_failure_code text default null
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
  if p_status is null or p_status not in ('accepted','failed','indeterminate') or
    (p_status='accepted' and (coalesce(p_provider_message_sid,'') !~ '^SM[0-9a-fA-F]{32}$' or p_failure_code is not null)) or
    (p_status<>'accepted' and (p_provider_message_sid is not null or coalesce(p_failure_code,'') !~ '^[a-z0-9_]{1,80}$')) then
    raise exception 'TICKET_UPLOAD_SMS_OUTCOME_INVALID';
  end if;
  update public.ticket_upload_sms_alerts set status=p_status,provider_message_sid=p_provider_message_sid,
    accepted_at=case when p_status='accepted' then clock_timestamp() else null end,
    failure_code=p_failure_code,claim_id=null,claim_expires_at=null
    where alert_id=p_alert_id and claim_id=p_claim_id and status='sending';
  get diagnostics affected=row_count;
  return affected=1;
end $$;

-- Status-only staff view; never expose provider IDs, contact snapshots or payloads.
create function public.get_ticket_upload_alert_statuses()
returns table(draft_id uuid,email_status text,sms_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then
    raise exception using errcode='42501',message='TICKET_UPLOAD_ALERT_STAFF_REQUIRED';
  end if;
  return query select distinct on(a.draft_id) a.draft_id,a.status,s.status
    from public.ticket_upload_alerts a
    join public.ticket_intake_drafts d on d.id=a.draft_id
    left join public.ticket_upload_sms_alerts s on s.alert_id=a.id
    where d.status in ('active','converted') and d.deleted_at is null and d.expires_at>clock_timestamp()
    order by a.draft_id,a.uploaded_at desc,a.created_at desc,a.id desc;
end $$;

revoke all on function public.queue_ticket_upload_sms_alert() from public,anon,authenticated;
revoke all on function public.claim_ticket_upload_sms_alerts(integer) from public,anon,authenticated;
revoke all on function public.finish_ticket_upload_sms_alert(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.get_ticket_upload_alert_statuses() from public,anon,authenticated;
grant execute on function public.claim_ticket_upload_sms_alerts(integer) to service_role;
grant execute on function public.finish_ticket_upload_sms_alert(uuid,uuid,text,text,text) to service_role;
grant execute on function public.get_ticket_upload_alert_statuses() to authenticated;
comment on table public.ticket_upload_sms_alerts is
  'Private per-confirmed-upload owner SMS outbox. One provider attempt, no customer content. Accepted means queued by Twilio, not delivered; ambiguous outcomes require staff review.';

commit;
