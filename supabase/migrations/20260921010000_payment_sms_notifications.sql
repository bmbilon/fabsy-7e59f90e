begin;

create table public.payment_sms_state (
  id boolean primary key default true check(id),
  activated_at timestamptz not null default clock_timestamp(),
  last_worker_at timestamptz, last_worker_error text
);
insert into public.payment_sms_state(id) values(true);
alter table public.payment_sms_state enable row level security;
revoke all on public.payment_sms_state from public,anon,authenticated,service_role;
grant select on public.payment_sms_state to authenticated,service_role;
create policy staff_read_payment_sms_state on public.payment_sms_state for select to authenticated using(public.is_idr_staff());

create function public.record_payment_sms_worker_health(p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'PAYMENT_SMS_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_error is not null and p_error !~ '^[a-z0-9_]{1,80}$' then raise exception 'PAYMENT_SMS_HEALTH_INVALID'; end if;
  update public.payment_sms_state set last_worker_at=clock_timestamp(),last_worker_error=p_error where id;
end $$;

create table public.payment_sms_notifications (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id text not null unique check(checkout_session_id ~ '^cs_live_[A-Za-z0-9]+$'),
  payment_intent_id text not null unique check(payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  event_id text not null check(event_id ~ '^evt_[A-Za-z0-9]+$'),
  occurred_at timestamptz not null,
  checkout_kind text not null check(checkout_kind in ('ticket_only','ticket_with_addon','photo_radar','ticket_assessment','idr_only')),
  intent_id uuid not null, submission_id uuid, order_id uuid, client_id uuid,
  amount_total bigint not null check(amount_total>0 and amount_total<=9007199254740991),
  currency text not null check(currency='CAD'),
  client_name text, ticket_number text,
  status text not null check(status in ('pending','sending','accepted','failed','indeterminate','needs_review')),
  failure_code text check(failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  claim_id uuid, claim_expires_at timestamptz, attempted_at timestamptz,
  provider_message_sid text check(provider_message_sid is null or provider_message_sid ~ '^SM[0-9a-fA-F]{32}$'),
  accepted_at timestamptz, created_at timestamptz not null default clock_timestamp(),
  check(status<>'sending' or (claim_id is not null and claim_expires_at is not null and attempted_at is not null)),
  check(status<>'accepted' or (provider_message_sid is not null and accepted_at is not null))
);
alter table public.payment_sms_notifications enable row level security;
alter table public.payment_sms_notifications force row level security;
revoke all on public.payment_sms_notifications from public,anon,authenticated,service_role;
grant select on public.payment_sms_notifications to authenticated,service_role;
create policy staff_read_payment_sms on public.payment_sms_notifications for select to authenticated
  using(public.is_idr_staff());
create index payment_sms_pending on public.payment_sms_notifications(created_at,id) where status in ('pending','sending');

-- This service-only boundary is called after signed LIVE Stripe checkout
-- fulfillment. It independently resolves stored ownership; labels never come
-- from Stripe customer/metadata text. No historical rows are backfilled.
create function public.enqueue_verified_payment_sms(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  checkout text:=p_event->>'checkout_session_id'; payment text:=p_event->>'payment_intent_id';
  kind text:=p_event->>'checkout_kind'; happened timestamptz:=(p_event->>'occurred_at')::timestamptz;
  intent_id_value uuid:=(p_event->>'intent_id')::uuid; submission_id_value uuid:=(p_event->>'submission_id')::uuid;
  order_id_value uuid:=(p_event->>'order_id')::uuid; client_id_value uuid;
  reservation public.idr_checkout_intents%rowtype; purchased public.idr_orders%rowtype;
  ticket public.ticket_submissions%rowtype; client public.clients%rowtype;
  existing public.payment_sms_notifications%rowtype; inserted public.payment_sms_notifications%rowtype;
  reason text; full_name text; full_ticket text; gross bigint:=(p_event->>'amount_total')::bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'PAYMENT_SMS_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_event->'livemode' is distinct from 'true'::jsonb
    or coalesce(p_event->>'event_type','') not in ('checkout.session.completed','checkout.session.async_payment_succeeded')
    or coalesce(p_event->>'event_id','') !~ '^evt_[A-Za-z0-9]+$'
    or coalesce(checkout,'') !~ '^cs_live_[A-Za-z0-9]+$' or coalesce(payment,'') !~ '^pi_[A-Za-z0-9]+$'
    or happened is null or happened>clock_timestamp()+interval '5 minutes' or intent_id_value is null
    or coalesce(kind,'') not in ('ticket_only','ticket_with_addon','photo_radar','ticket_assessment','idr_only')
    or coalesce(p_event->>'currency','')<>'CAD' or gross is null or gross<=0 or gross>9007199254740991 then
    raise exception 'PAYMENT_SMS_SOURCE_INVALID';
  end if;
  if happened<(select activated_at from public.payment_sms_state where id) then
    return jsonb_build_object('status','before_activation','created',false);
  end if;
  -- Both identities are unique, and the lock keeps cross-session reuse from
  -- racing a legitimate producer. No provider call occurs in this transaction.
  perform pg_advisory_xact_lock(hashtextextended('payment-sms-enqueue',731904222));
  select * into existing from public.payment_sms_notifications
    where checkout_session_id=checkout or payment_intent_id=payment for update;
  if found then
    if existing.checkout_session_id<>checkout or existing.payment_intent_id<>payment
      or existing.amount_total<>gross or existing.currency<>p_event->>'currency'
      or existing.checkout_kind<>kind or existing.intent_id<>intent_id_value
      or existing.submission_id is distinct from submission_id_value or existing.order_id is distinct from order_id_value then
      update public.payment_sms_notifications set failure_code='payment_identity_conflict',
        status=case when status='pending' then 'needs_review' else status end where id=existing.id;
      return jsonb_build_object('id',existing.id,'status','identity_conflict','created',false);
    end if;
    return jsonb_build_object('id',existing.id,'status',existing.status,'created',false);
  end if;
  select * into reservation from public.idr_checkout_intents where id=intent_id_value for share;
  if not found or reservation.status<>'paid' or reservation.stripe_checkout_session_id is distinct from checkout
    or reservation.checkout_kind is distinct from kind or reservation.ticket_submission_id is distinct from submission_id_value then
    reason:='paid_reservation_mismatch';
  else client_id_value:=reservation.client_id;
  end if;
  if reason is null and kind in ('ticket_with_addon','idr_only') then
    select * into purchased from public.idr_orders where id=order_id_value for share;
    if not found or order_id_value is distinct from intent_id_value
      or purchased.stripe_checkout_session_id is distinct from checkout
      or purchased.stripe_payment_intent_id is distinct from payment
      or purchased.ticket_submission_id is distinct from submission_id_value
      or (client_id_value is not null and purchased.client_id is distinct from client_id_value)
      or purchased.paid_at is null
      or reservation.type not in ('addon','standalone') or purchased.type is distinct from reservation.type
      or (kind='ticket_with_addon' and reservation.type<>'addon')
      or (reservation.type='addon' and submission_id_value is null) then
      reason:='paid_order_mismatch';
    else client_id_value:=purchased.client_id;
    end if;
  elsif reason is null and order_id_value is not null then reason:='unexpected_order';
  end if;
  if reason is null and (client_id_value is null or
    (p_event->>'client_id' is not null and (p_event->>'client_id')::uuid is distinct from client_id_value)) then reason:='client_ownership_mismatch'; end if;
  if reason is null and submission_id_value is not null then
    select * into ticket from public.ticket_submissions where id=submission_id_value for share;
    if not found or ticket.client_id is distinct from client_id_value or ticket.deleted_at is not null then reason:='ticket_ownership_mismatch';
    elsif kind='ticket_assessment' and (ticket.service_type<>'ticket_insurance_assessment'
      or to_jsonb(ticket)->>'assessment_checkout_session_id' is distinct from checkout
      or to_jsonb(ticket)->>'assessment_payment_intent_id' is distinct from payment) then reason:='assessment_payment_mismatch';
    elsif kind in ('ticket_only','ticket_with_addon','photo_radar') and (ticket.service_type<>'representation'
      or to_jsonb(ticket)->>'representation_checkout_session_id' is distinct from checkout
      or to_jsonb(ticket)->>'representation_payment_intent_id' is distinct from payment) then reason:='ticket_payment_mismatch';
    else
      full_ticket:=regexp_replace(upper(ticket.ticket_number),'[^A-Z0-9]','','g');
      if coalesce(ticket.ticket_number,'') !~ '^[A-Za-z0-9 -]{5,40}$' or coalesce(full_ticket,'') !~ '^[A-Z0-9]{5,30}$'
        or full_ticket !~ '[0-9]' then reason:='ticket_number_missing_or_invalid'; end if;
    end if;
  elsif reason is null then reason:='ticket_number_missing';
  end if;
  if client_id_value is not null then
    select * into client from public.clients where id=client_id_value for share;
    if not found or nullif(btrim(client.first_name),'') is null or nullif(btrim(client.last_name),'') is null
      or length(client.first_name)>100 or length(client.last_name)>100
      or concat(client.first_name,client.last_name) ~ '[[:cntrl:]]' then
      reason:=coalesce(reason,'client_name_missing_or_invalid');
    else full_name:=btrim(client.first_name)||' '||btrim(client.last_name);
    end if;
  end if;
  insert into public.payment_sms_notifications(checkout_session_id,payment_intent_id,event_id,occurred_at,checkout_kind,
    intent_id,submission_id,order_id,client_id,amount_total,currency,client_name,ticket_number,status,failure_code)
  values(checkout,payment,p_event->>'event_id',happened,kind,intent_id_value,submission_id_value,order_id_value,client_id_value,
    gross,p_event->>'currency',full_name,full_ticket,case when reason is null then 'pending' else 'needs_review' end,reason)
  returning * into inserted;
  return jsonb_build_object('id',inserted.id,'status',inserted.status,'created',true);
end $$;

create function public.claim_payment_sms_notifications(p_limit integer default 1)
returns setof public.payment_sms_notifications language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'PAYMENT_SMS_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>5 then raise exception 'PAYMENT_SMS_LIMIT_INVALID'; end if;
  update public.payment_sms_notifications set status='indeterminate',failure_code='claim_expired',claim_id=null,claim_expires_at=null
    where status='sending' and claim_expires_at<=clock_timestamp();
  -- Suppress a stale identity snapshot before its first send. Preserve all
  -- attempted rows unchanged for provider reconciliation, never requeue them.
  update public.payment_sms_notifications n set status='needs_review',failure_code='identity_changed_before_send'
    where n.status='pending' and not exists(
      select 1 from public.clients c join public.ticket_submissions t on t.client_id=c.id
      where c.id=n.client_id and t.id=n.submission_id and t.deleted_at is null
        and btrim(c.first_name)||' '||btrim(c.last_name)=n.client_name
        and regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g')=n.ticket_number);
  return query with due as (
    select id from public.payment_sms_notifications where status='pending' and attempted_at is null
      order by created_at,id limit p_limit for update skip locked
  ) update public.payment_sms_notifications n set status='sending',claim_id=gen_random_uuid(),
      claim_expires_at=clock_timestamp()+interval '3 minutes',attempted_at=clock_timestamp()
      from due where n.id=due.id returning n.*;
end $$;

create function public.finish_payment_sms_notification(p_id uuid,p_claim_id uuid,p_status text,
  p_provider_message_sid text default null,p_failure_code text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'PAYMENT_SMS_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_status is null or p_status not in ('accepted','failed','indeterminate')
    or (p_status='accepted' and (coalesce(p_provider_message_sid,'') !~ '^SM[0-9a-fA-F]{32}$' or p_failure_code is not null))
    or (p_status<>'accepted' and (p_provider_message_sid is not null or coalesce(p_failure_code,'') !~ '^[a-z0-9_]{1,80}$')) then
    raise exception 'PAYMENT_SMS_OUTCOME_INVALID'; end if;
  update public.payment_sms_notifications set status=p_status,provider_message_sid=p_provider_message_sid,
    accepted_at=case when p_status='accepted' then clock_timestamp() end,failure_code=p_failure_code,claim_id=null,claim_expires_at=null
    where id=p_id and claim_id=p_claim_id and status='sending';
  get diagnostics affected=row_count; return affected=1;
end $$;
revoke all on function public.record_payment_sms_worker_health(text),public.enqueue_verified_payment_sms(jsonb),public.claim_payment_sms_notifications(integer),
  public.finish_payment_sms_notification(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_payment_sms_worker_health(text),public.enqueue_verified_payment_sms(jsonb),public.claim_payment_sms_notifications(integer),
  public.finish_payment_sms_notification(uuid,uuid,text,text,text) to service_role;
comment on table public.payment_sms_notifications is 'Private owner alerts for newly verified live paid checkouts. Gross Stripe amount includes tax. One attempt per session/payment; missing identity and uncertain provider outcomes require review. Accepted means provider acceptance, not handset delivery.';

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_namespace where nspname='vault') then
    if exists(select 1 from vault.secrets where name='idr_project_url') and exists(select 1 from vault.secrets where name='idr_cron_secret') then
      perform cron.schedule('fabsy-payment-notifications','* * * * *',$job$
        select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='idr_project_url') || '/functions/v1/process-payment-notifications',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
          body := '{}'::jsonb,timeout_milliseconds := 150000);
      $job$);
    end if;
  end if;
end $$;
commit;
