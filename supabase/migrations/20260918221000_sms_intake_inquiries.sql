begin;

-- Operational SMS inquiries are separate from tickets, customers and ad events.
-- Store content for 30 days; the preceding migration retains only delivery/HMAC
-- metadata for 90 days and preserves opted-out sender hashes beyond that window.
create table public.sms_intake_inquiries (
  id uuid primary key default gen_random_uuid(),
  sender_hash text not null references public.sms_vapi_conversations(sender_hash)
    on update cascade on delete cascade,
  from_number text not null check (from_number ~ '^\+[1-9][0-9]{7,14}$'),
  to_number text not null check (to_number ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default clock_timestamp(),
  last_message_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days')
);
create index sms_intake_inquiries_sender_idx
  on public.sms_intake_inquiries(sender_hash, to_number, last_message_at desc);
create index sms_intake_inquiries_expiry_idx on public.sms_intake_inquiries(expires_at);

create table public.sms_intake_messages (
  message_sid text primary key references public.sms_vapi_messages(message_sid) on delete cascade,
  inquiry_id uuid not null references public.sms_intake_inquiries(id) on delete cascade,
  body text not null check (length(body) <= 4000 and octet_length(body) <= 16000),
  reply_text text check (reply_text is null or (length(reply_text) <= 4000 and octet_length(reply_text) <= 16000)),
  received_at timestamptz not null default clock_timestamp(),
  retained_until timestamptz not null default (clock_timestamp() + interval '30 days')
);
create index sms_intake_messages_inquiry_idx on public.sms_intake_messages(inquiry_id, received_at desc);
create index sms_intake_messages_expiry_idx on public.sms_intake_messages(retained_until);

create table public.sms_intake_email_notifications (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null unique references public.sms_intake_inquiries(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
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
  retained_until timestamptz not null default (clock_timestamp() + interval '30 days'),
  check (status <> 'sending' or (claim_id is not null and claim_expires_at is not null)),
  check (status <> 'sent' or (provider_email_id is not null and sent_at is not null))
);
create index sms_intake_email_pending_idx on public.sms_intake_email_notifications(next_attempt_at, created_at)
  where status in ('pending','retry','sending');
create index sms_intake_email_expiry_idx on public.sms_intake_email_notifications(retained_until);

alter table public.sms_intake_inquiries enable row level security;
alter table public.sms_intake_messages enable row level security;
alter table public.sms_intake_email_notifications enable row level security;
revoke all on public.sms_intake_inquiries, public.sms_intake_messages, public.sms_intake_email_notifications
  from public, anon, authenticated;
grant select, insert, update, delete on public.sms_intake_inquiries, public.sms_intake_messages,
  public.sms_intake_email_notifications to service_role;

create function public.claim_sms_intake_inbound(
  p_message_sid text, p_sender_hash text, p_body_length integer, p_num_media integer,
  p_assistant_id uuid, p_control boolean, p_from_number text, p_to_number text, p_body text,
  p_previous_sender_hash text default null, p_rate_limit integer default 10,
  p_is_help boolean default false
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  result jsonb;
  inquiry_id uuid;
  operation_at timestamptz := clock_timestamp();
begin
  if p_from_number is null or p_from_number !~ '^\+[1-9][0-9]{7,14}$'
    or p_to_number is null or p_to_number !~ '^\+[1-9][0-9]{7,14}$'
    or p_body is null or length(p_body) > 4000 or octet_length(p_body) > 16000 then
    raise exception 'SMS_INTAKE_INPUT_INVALID' using errcode = '22023';
  end if;
  -- The base claim holds the sender row lock through this entire transaction,
  -- serializing grouping and preserving STOP/START and HMAC-rotation semantics.
  result := public.claim_sms_vapi_inbound(p_message_sid, p_sender_hash, p_body_length,
    p_num_media, p_assistant_id, p_control, p_previous_sender_hash, p_rate_limit);
  if (result->>'duplicate')::boolean or p_control is not null or coalesce(p_is_help, false)
    or coalesce((result->>'opted_out')::boolean, false) then
    return result;
  end if;
  select i.id into inquiry_id from public.sms_intake_inquiries i
    where i.sender_hash = p_sender_hash and i.from_number = p_from_number and i.to_number = p_to_number
      and i.last_message_at > operation_at - interval '24 hours' and i.expires_at > operation_at
    order by i.last_message_at desc, i.id limit 1;
  if inquiry_id is null then
    insert into public.sms_intake_inquiries(sender_hash, from_number, to_number, created_at, last_message_at, expires_at)
      values (p_sender_hash, p_from_number, p_to_number, operation_at, operation_at, operation_at + interval '30 days')
      returning id into inquiry_id;
    insert into public.sms_intake_email_notifications(inquiry_id, snapshot, created_at, retained_until)
      values (inquiry_id, jsonb_build_object('fromNumber', p_from_number, 'toNumber', p_to_number,
        'body', p_body, 'numMedia', p_num_media, 'receivedAt', operation_at, 'inquiryId', inquiry_id),
        operation_at, operation_at + interval '30 days');
  else
    update public.sms_intake_inquiries i set last_message_at = operation_at,
      expires_at = operation_at + interval '30 days' where i.id = inquiry_id;
  end if;
  insert into public.sms_intake_messages(message_sid, inquiry_id, body, received_at, retained_until)
    values (p_message_sid, inquiry_id, p_body, operation_at, operation_at + interval '30 days');
  return result || jsonb_build_object('inquiry_id', inquiry_id);
end $$;

create function public.complete_sms_intake_inbound(
  p_message_sid text, p_sender_hash text, p_state text, p_vapi_chat_id text,
  p_reply_length integer, p_set_opted_out boolean default null, p_reset_chat boolean default false,
  p_reply_text text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  if p_reply_text is not null and (length(p_reply_text) > 4000 or octet_length(p_reply_text) > 16000) then
    raise exception 'SMS_INTAKE_REPLY_INVALID' using errcode = '22023';
  end if;
  result := public.complete_sms_vapi_inbound(p_message_sid, p_sender_hash, p_state,
    p_vapi_chat_id, p_reply_length, p_set_opted_out, p_reset_chat);
  if (result->>'completed')::boolean and (result->>'reply_allowed')::boolean then
    update public.sms_intake_messages set reply_text = p_reply_text
      where message_sid = p_message_sid and retained_until > clock_timestamp();
  end if;
  return result;
end $$;

create function public.claim_sms_intake_email_notifications(p_limit integer default 10)
returns setof public.sms_intake_email_notifications
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'SMS_INTAKE_EMAIL_LIMIT_INVALID' using errcode = '22023';
  end if;
  -- Resend's stable sms-inquiry-<id> key is useful only inside its 24h window.
  -- An expired retry/lease becomes indeterminate instead of sending a fresh copy.
  update public.sms_intake_email_notifications set status = 'indeterminate',
    failure_code = 'idempotency_window_elapsed', claim_id = null, claim_expires_at = null
    where status in ('retry','sending') and first_attempt_at <= clock_timestamp() - interval '23 hours'
      and (status <> 'sending' or claim_expires_at <= clock_timestamp());
  return query
  with candidates as (
    select id from public.sms_intake_email_notifications
      where retained_until > clock_timestamp()
        and ((status in ('pending','retry') and next_attempt_at <= clock_timestamp())
          or (status = 'sending' and claim_expires_at <= clock_timestamp()))
        and (first_attempt_at is null or first_attempt_at > clock_timestamp() - interval '23 hours')
      order by created_at, id limit p_limit for update skip locked
  )
  update public.sms_intake_email_notifications a set status = 'sending', claim_id = gen_random_uuid(),
    claim_expires_at = clock_timestamp() + interval '3 minutes',
    first_attempt_at = coalesce(first_attempt_at, clock_timestamp()),
    attempt_count = attempt_count + 1, failure_code = null
    from candidates c where a.id = c.id returning a.*;
end $$;

create function public.freeze_sms_intake_email_notification(p_id uuid, p_claim_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare frozen jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->'to' is distinct from '["hello@fabsy.ca"]'::jsonb
    or p_payload->'bcc' is distinct from '["brett@execom.ca"]'::jsonb
    or coalesce(p_payload->>'html','') = '' or coalesce(p_payload->>'subject','') = ''
    or octet_length(p_payload::text) > 100000 then
    raise exception 'SMS_INTAKE_EMAIL_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  update public.sms_intake_email_notifications set email_payload = coalesce(email_payload, p_payload)
    where id = p_id and claim_id = p_claim_id and status = 'sending'
      and claim_expires_at > clock_timestamp() and retained_until > clock_timestamp()
      and first_attempt_at > clock_timestamp() - interval '23 hours'
    returning email_payload into frozen;
  if not found then raise exception 'SMS_INTAKE_EMAIL_CLAIM_LOST'; end if;
  return frozen;
end $$;

create function public.finish_sms_intake_email_notification(
  p_id uuid, p_claim_id uuid, p_status text,
  p_provider_email_id text default null, p_failure_code text default null
) returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare affected integer;
begin
  if p_status is null or p_status not in ('sent','retry','failed')
    or (p_status = 'sent' and (coalesce(p_provider_email_id,'') = '' or length(p_provider_email_id) > 200 or p_failure_code is not null))
    or (p_status <> 'sent' and (p_provider_email_id is not null or coalesce(p_failure_code,'') !~ '^[a-z0-9_]{1,80}$')) then
    raise exception 'SMS_INTAKE_EMAIL_OUTCOME_INVALID' using errcode = '22023';
  end if;
  update public.sms_intake_email_notifications set status = p_status, provider_email_id = p_provider_email_id,
    sent_at = case when p_status = 'sent' then clock_timestamp() else null end,
    failure_code = p_failure_code,
    next_attempt_at = clock_timestamp() + make_interval(secs => least(3600, 30 * power(2,least(attempt_count,7)))::integer),
    claim_id = null, claim_expires_at = null
    where id = p_id and claim_id = p_claim_id and status = 'sending';
  get diagnostics affected = row_count;
  return affected = 1;
end $$;

create function public.admin_sms_intake_inbox()
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(), false) then
    raise exception 'SMS_INTAKE_STAFF_REQUIRED' using errcode = '42501';
  end if;
  select jsonb_build_object('inquiries', coalesce(jsonb_agg(row_data order by last_message_at desc, id), '[]'::jsonb))
  into result from (
    select i.id, i.last_message_at,
      jsonb_build_object('id', i.id, 'from_number', i.from_number, 'to_number', i.to_number,
        'created_at', i.created_at, 'last_message_at', i.last_message_at,
        'opted_out', c.opted_out_at is not null, 'email_status', e.status,
        'email_failure_code', e.failure_code, 'email_sent_at', e.sent_at,
        'message_count', (select count(*) from public.sms_intake_messages m where m.inquiry_id=i.id and m.retained_until>clock_timestamp()),
        'messages_truncated', (select count(*) > 50 from public.sms_intake_messages m where m.inquiry_id=i.id and m.retained_until>clock_timestamp()),
        'messages', coalesce((select jsonb_agg(message_data order by received_at, message_sid) from (
          select m.received_at, m.message_sid, jsonb_build_object('message_sid', m.message_sid,
            'body', m.body, 'reply_text', m.reply_text, 'received_at', m.received_at,
            'state', meta.state, 'delivery_status', meta.delivery_status, 'delivery_error_code', meta.delivery_error_code) as message_data
          from public.sms_intake_messages m join public.sms_vapi_messages meta on meta.message_sid=m.message_sid
          where m.inquiry_id=i.id and m.retained_until>clock_timestamp()
          order by m.received_at desc, m.message_sid desc limit 50
        ) recent_messages), '[]'::jsonb)) as row_data
    from public.sms_intake_inquiries i
    join public.sms_vapi_conversations c on c.sender_hash=i.sender_hash
    left join public.sms_intake_email_notifications e on e.inquiry_id=i.id and e.retained_until>clock_timestamp()
    where i.expires_at>clock_timestamp()
    order by i.last_message_at desc, i.id limit 50
  ) recent_inquiries;
  return result;
end $$;

create function public.purge_sms_intake_content()
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare messages_deleted integer; notifications_deleted integer; inquiries_deleted integer;
begin
  delete from public.sms_intake_messages where retained_until <= clock_timestamp();
  get diagnostics messages_deleted = row_count;
  delete from public.sms_intake_email_notifications where retained_until <= clock_timestamp();
  get diagnostics notifications_deleted = row_count;
  delete from public.sms_intake_inquiries where expires_at <= clock_timestamp();
  get diagnostics inquiries_deleted = row_count;
  return jsonb_build_object('messages_deleted', messages_deleted, 'notifications_deleted', notifications_deleted,
    'inquiries_deleted', inquiries_deleted);
end $$;

-- The authenticated worker's dry run checks deployment contracts without
-- claiming a message, enabling the AI circuit or creating a notification.
create function public.sms_intake_readiness()
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('version', 1,
    'contracts_ready',
      to_regclass('public.sms_vapi_conversations') is not null
      and to_regclass('public.sms_vapi_messages') is not null
      and to_regclass('public.sms_intake_inquiries') is not null
      and to_regclass('public.sms_intake_messages') is not null
      and to_regclass('public.sms_intake_email_notifications') is not null
      and to_regprocedure('public.claim_sms_intake_inbound(text,text,integer,integer,uuid,boolean,text,text,text,text,integer,boolean)') is not null
      and to_regprocedure('public.complete_sms_intake_inbound(text,text,text,text,integer,boolean,boolean,text)') is not null
      and to_regprocedure('public.authorize_sms_vapi_chat(text,text,integer,integer)') is not null
      and to_regprocedure('public.record_sms_vapi_status(text,text,text,text)') is not null
      and to_regprocedure('public.admin_sms_intake_inbox()') is not null
      and to_regprocedure('public.claim_sms_intake_email_notifications(integer)') is not null
      and to_regprocedure('public.freeze_sms_intake_email_notification(uuid,uuid,jsonb)') is not null
      and to_regprocedure('public.finish_sms_intake_email_notification(uuid,uuid,text,text,text)') is not null,
    'circuit_enabled', coalesce((select circuit_enabled from public.sms_vapi_runtime where singleton_id=1),false));
$$;

revoke all on function public.claim_sms_intake_inbound(text,text,integer,integer,uuid,boolean,text,text,text,text,integer,boolean),
  public.complete_sms_intake_inbound(text,text,text,text,integer,boolean,boolean,text),
  public.claim_sms_intake_email_notifications(integer), public.freeze_sms_intake_email_notification(uuid,uuid,jsonb),
  public.finish_sms_intake_email_notification(uuid,uuid,text,text,text), public.purge_sms_intake_content(),
  public.admin_sms_intake_inbox(), public.sms_intake_readiness() from public, anon, authenticated;
grant execute on function public.claim_sms_intake_inbound(text,text,integer,integer,uuid,boolean,text,text,text,text,integer,boolean),
  public.complete_sms_intake_inbound(text,text,text,text,integer,boolean,boolean,text),
  public.claim_sms_intake_email_notifications(integer), public.freeze_sms_intake_email_notification(uuid,uuid,jsonb),
  public.finish_sms_intake_email_notification(uuid,uuid,text,text,text), public.purge_sms_intake_content(),
  public.sms_intake_readiness() to service_role;
grant execute on function public.admin_sms_intake_inbox() to authenticated;

comment on table public.sms_intake_inquiries is 'Private operational SMS inquiries, grouped by sender and destination within 24 hours of activity. No ticket creation or advertising attribution.';
comment on table public.sms_intake_messages is 'Staff-only inbound SMS text and allowed reply text, retained 30 days. No media downloads or media URLs.';
comment on table public.sms_intake_email_notifications is 'One frozen first-message notification per inquiry. No historical backfill. First message snapshot and provider payload retained 30 days independently of later inquiry activity.';

select cron.schedule('fabsy-sms-intake-content-purge', '7 3 * * *', 'select public.purge_sms_intake_content();');
-- Reuse existing Vault credentials without copying secret values into job text.
do $$
declare email_job_id bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_namespace where nspname='vault') then
    if exists(select 1 from vault.secrets where name='idr_project_url')
      and exists(select 1 from vault.secrets where name='idr_cron_secret') then
      email_job_id := cron.schedule('fabsy-sms-intake-emails','* * * * *', $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='idr_project_url') || '/functions/v1/process-sms-intake-emails',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
          body := '{}'::jsonb, timeout_milliseconds := 150000
        );
      $job$);
      -- Provider sends begin only when the reviewed bridge release activates it.
      perform cron.alter_job(email_job_id, active := false);
    end if;
  end if;
end $$;
commit;
