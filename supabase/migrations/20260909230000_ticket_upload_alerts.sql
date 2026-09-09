begin;

create table public.ticket_upload_alerts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.ticket_intake_drafts(id) on delete cascade,
  object_fingerprint text not null check (object_fingerprint ~ '^[0-9a-f]{64}$'),
  uploaded_at timestamptz not null,
  contact_snapshot jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','sending','retry','sent','failed','indeterminate')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  claim_id uuid,
  claim_expires_at timestamptz,
  email_payload jsonb,
  provider_email_id text,
  sent_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (draft_id, object_fingerprint),
  check (status <> 'sending' or (claim_id is not null and claim_expires_at is not null)),
  check (status <> 'sent' or (provider_email_id is not null and sent_at is not null))
);
alter table public.ticket_upload_alerts enable row level security;
alter table public.ticket_upload_alerts force row level security;
revoke all on public.ticket_upload_alerts from public, anon, authenticated;
grant select, insert, update, delete on public.ticket_upload_alerts to service_role;
create index ticket_upload_alerts_pending_idx on public.ticket_upload_alerts (next_attempt_at, created_at)
  where status in ('pending','retry','sending');

create function public.enqueue_ticket_upload_alert(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  draft public.ticket_intake_drafts%rowtype;
  notice_id uuid;
begin
  select * into draft from public.ticket_intake_drafts where id = p_draft_id;
  if not found or draft.ticket_uploaded_at is null or not draft.contact_permission
     or draft.status not in ('active','converted') or draft.expires_at <= clock_timestamp() then
    return null;
  end if;
  insert into public.ticket_upload_alerts (draft_id, object_fingerprint, uploaded_at, contact_snapshot)
  values (draft.id, encode(sha256(convert_to(draft.ticket_document_path, 'UTF8')), 'hex'), draft.ticket_uploaded_at,
    jsonb_build_object('firstName', left(coalesce(draft.draft_data->>'firstName',''),120),
      'lastName', left(coalesce(draft.draft_data->>'lastName',''),120),
      'email', draft.email, 'phone', draft.phone, 'preferredLocale', draft.preferred_locale))
  on conflict (draft_id, object_fingerprint) do nothing
  returning id into notice_id;
  return notice_id;
end $$;

create function public.queue_confirmed_ticket_upload_alert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.ticket_uploaded_at is not null and
     (tg_op = 'INSERT' or old.ticket_uploaded_at is null or
      old.ticket_document_path is distinct from new.ticket_document_path) then
    perform public.enqueue_ticket_upload_alert(new.id);
  end if;
  return new;
end $$;
create trigger queue_confirmed_ticket_upload_alert
  after insert or update of ticket_uploaded_at, ticket_document_path on public.ticket_intake_drafts
  for each row execute function public.queue_confirmed_ticket_upload_alert();

create function public.claim_ticket_upload_alerts(p_limit integer default 10)
returns setof public.ticket_upload_alerts
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'TICKET_UPLOAD_ALERT_LIMIT_INVALID';
  end if;
  -- Never repeat a potentially accepted send outside the provider's 24h fence.
  update public.ticket_upload_alerts
    set status = 'indeterminate', failure_code = 'idempotency_window_elapsed',
        claim_id = null, claim_expires_at = null
    where status in ('retry','sending') and first_attempt_at <= clock_timestamp() - interval '23 hours'
      and (status <> 'sending' or claim_expires_at <= clock_timestamp());
  return query
  with candidates as (
    select id from public.ticket_upload_alerts
    where ((status in ('pending','retry') and next_attempt_at <= clock_timestamp())
      or (status = 'sending' and claim_expires_at <= clock_timestamp()))
      and (first_attempt_at is null or first_attempt_at > clock_timestamp() - interval '23 hours')
    order by created_at, id limit p_limit for update skip locked
  )
  update public.ticket_upload_alerts a
    set status = 'sending', claim_id = gen_random_uuid(),
        claim_expires_at = clock_timestamp() + interval '3 minutes',
        first_attempt_at = coalesce(first_attempt_at, clock_timestamp()),
        attempt_count = attempt_count + 1, failure_code = null
    from candidates c where a.id = c.id returning a.*;
end $$;

create function public.freeze_ticket_upload_alert_email(p_id uuid, p_claim_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare frozen jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or
     jsonb_typeof(p_payload->'to') is distinct from 'array' or
     jsonb_array_length(p_payload->'to') <> 1 or
     coalesce(p_payload->>'html','') = '' or coalesce(p_payload->>'subject','') = '' then
    raise exception 'TICKET_UPLOAD_ALERT_PAYLOAD_INVALID';
  end if;
  update public.ticket_upload_alerts
    set email_payload = coalesce(email_payload, p_payload)
    where id = p_id and claim_id = p_claim_id and status = 'sending'
      and claim_expires_at > clock_timestamp()
    returning email_payload into frozen;
  if not found then raise exception 'TICKET_UPLOAD_ALERT_CLAIM_LOST'; end if;
  return frozen;
end $$;

create function public.finish_ticket_upload_alert(
  p_id uuid, p_claim_id uuid, p_status text,
  p_provider_email_id text default null, p_failure_code text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if p_status not in ('sent','retry','failed') or
     (p_status = 'sent' and (coalesce(p_provider_email_id,'') = '' or p_failure_code is not null)) or
     (p_status <> 'sent' and coalesce(p_failure_code,'') !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'TICKET_UPLOAD_ALERT_OUTCOME_INVALID';
  end if;
  update public.ticket_upload_alerts
    set status = p_status, provider_email_id = p_provider_email_id,
        sent_at = case when p_status = 'sent' then clock_timestamp() else null end,
        failure_code = p_failure_code,
        next_attempt_at = clock_timestamp() + make_interval(secs => least(3600, 30 * power(2,least(attempt_count,7)))::integer),
        claim_id = null, claim_expires_at = null
    where id = p_id and claim_id = p_claim_id and status = 'sending';
  get diagnostics affected = row_count;
  return affected = 1;
end $$;

revoke all on function public.enqueue_ticket_upload_alert(uuid) from public, anon, authenticated;
revoke all on function public.queue_confirmed_ticket_upload_alert() from public, anon, authenticated;
revoke all on function public.claim_ticket_upload_alerts(integer) from public, anon, authenticated;
revoke all on function public.freeze_ticket_upload_alert_email(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.finish_ticket_upload_alert(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_ticket_upload_alert(uuid) to service_role;
grant execute on function public.claim_ticket_upload_alerts(integer) to service_role;
grant execute on function public.freeze_ticket_upload_alert_email(uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_ticket_upload_alert(uuid,uuid,text,text,text) to service_role;

comment on table public.ticket_upload_alerts is
  'Private per-upload admin email outbox. Contact snapshot and frozen provider payload expire with the parent intake. No ticket files or resume capabilities.';

-- Reuse the project's existing private scheduler credential. No secret is copied into job text.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_namespace where nspname='vault') then
    if exists(select 1 from vault.secrets where name='idr_project_url')
      and exists(select 1 from vault.secrets where name='idr_cron_secret') then
      perform cron.schedule('fabsy-ticket-upload-alerts','* * * * *', $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='idr_project_url') || '/functions/v1/process-ticket-upload-alerts',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
          body := '{}'::jsonb, timeout_milliseconds := 150000
        );
      $job$);
    end if;
  end if;
end $$;
commit;
