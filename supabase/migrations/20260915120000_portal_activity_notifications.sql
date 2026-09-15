-- Durable operator alerts for actionable client-portal activity. Passive page
-- views and sign-ins are intentionally excluded to avoid notification noise.
begin;

create table public.portal_activity_state (
  id boolean primary key default true check (id),
  recipient text not null default 'brett@execom.ca' check (recipient = 'brett@execom.ca'),
  last_worker_at timestamptz,
  last_worker_error text
);
insert into public.portal_activity_state(id) values(true);

create table public.portal_activity_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check(length(event_key) between 1 and 500),
  event_type text not null check(length(event_type) between 1 and 80),
  entity_type text not null check(length(entity_type) between 1 and 80),
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','processing','sent','needs_review')),
  attempts integer not null default 0 check(attempts >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  provider_email_id text,
  sent_at timestamptz,
  last_error text,
  check(status <> 'sent' or (provider_email_id is not null and sent_at is not null))
);
create index portal_activity_events_due on public.portal_activity_events(next_attempt_at,occurred_at)
  where status in ('pending','processing');

alter table public.portal_activity_state enable row level security;
alter table public.portal_activity_events enable row level security;
revoke all on public.portal_activity_state,public.portal_activity_events from public,anon,authenticated;
grant select on public.portal_activity_state,public.portal_activity_events to authenticated;
grant all on public.portal_activity_state,public.portal_activity_events to service_role;
create policy "Staff read portal alert health" on public.portal_activity_state
  for select to authenticated using(public.is_idr_staff());
create policy "Staff read portal alerts" on public.portal_activity_events
  for select to authenticated using(public.is_idr_staff());

create function public.enqueue_portal_activity(
  p_event_key text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_event_key is null or length(p_event_key) not between 1 and 500 or
     p_event_type is null or length(p_event_type) not between 1 and 80 or
     p_entity_type is null or length(p_entity_type) not between 1 and 80 or
     p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'PORTAL_ACTIVITY_INVALID';
  end if;
  insert into public.portal_activity_events(event_key,event_type,entity_type,entity_id,payload)
  values(p_event_key,p_event_type,p_entity_type,p_entity_id,p_payload)
  on conflict(event_key) do nothing;
end;
$$;
revoke all on function public.enqueue_portal_activity(text,text,text,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.portal_client_snapshot(p_client_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((select jsonb_build_object(
    'client_id',c.id,
    'client_name',btrim(concat_ws(' ',c.first_name,c.last_name)),
    'client_email',c.email
  ) from public.clients c where c.id=p_client_id),'{}'::jsonb)
$$;
revoke all on function public.portal_client_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.emit_ticket_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare base jsonb;
begin
  base := public.portal_client_snapshot(new.client_id) || jsonb_build_object(
    'submission_id',new.id,
    'ticket_number',new.ticket_number,
    'product',coalesce(new.order_type,new.service_type),
    'intake_source',new.intake_source,
    'status',new.status
  );
  if tg_op='INSERT' then
    perform public.enqueue_portal_activity('intake:'||new.id,'intake_created','ticket_submission',new.id,base);
    if new.review_consent is not null then
      perform public.enqueue_portal_activity('review-consent:'||new.id,'review_consent_signed','ticket_submission',new.id,base);
    end if;
  else
    if new.review_consent is not null and old.review_consent is null then
      perform public.enqueue_portal_activity('review-consent:'||new.id,'review_consent_signed','ticket_submission',new.id,base);
    end if;
    if new.consent_form_path is not null and new.consent_form_path is distinct from old.consent_form_path then
      perform public.enqueue_portal_activity('representation-consent:'||new.id||':'||new.consent_form_path,
        'representation_consent_signed','ticket_submission',new.id,
        base || jsonb_build_object('consent_form_path',new.consent_form_path));
    end if;
    if new.referral_refunded_at is not null and old.referral_refunded_at is null then
      perform public.enqueue_portal_activity('refund:'||coalesce(new.referral_payment_intent_id,new.id::text),
        'payment_refunded','ticket_submission',new.id,base);
    end if;
    if new.referral_disputed_at is not null and old.referral_disputed_at is null then
      perform public.enqueue_portal_activity('dispute:'||coalesce(new.referral_payment_intent_id,new.id::text),
        'payment_disputed','ticket_submission',new.id,base);
    end if;
  end if;
  return new;
end;
$$;
create trigger emit_ticket_portal_activity after insert or update on public.ticket_submissions
  for each row execute function public.emit_ticket_portal_activity();
revoke all on function public.emit_ticket_portal_activity() from public,anon,authenticated,service_role;

create function public.emit_checkout_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare kind text; base jsonb; client_snapshot jsonb; ticket_number text;
begin
  if new.status is not distinct from old.status or new.status not in ('paid','failed','expired') then return new; end if;
  select t.ticket_number into ticket_number from public.ticket_submissions t where t.id=new.ticket_submission_id;
  client_snapshot := public.portal_client_snapshot(new.client_id);
  kind := case new.status when 'paid' then 'payment_paid' when 'failed' then 'payment_failed' else 'payment_expired' end;
  base := client_snapshot || jsonb_build_object(
    'intent_id',new.id,
    'submission_id',new.ticket_submission_id,
    'ticket_number',ticket_number,
    'product',coalesce(new.checkout_kind,new.type),
    'amount_cents',new.expected_amount_cents,
    'status',new.status,
    'stripe_checkout_session_id',coalesce(new.stripe_checkout_session_id,old.stripe_checkout_session_id)
  );
  perform public.enqueue_portal_activity('checkout:'||new.id||':'||new.attempts::text||':'||new.status,
    kind,'checkout_intent',new.id,base);
  return new;
end;
$$;
create trigger emit_checkout_portal_activity after update on public.idr_checkout_intents
  for each row execute function public.emit_checkout_portal_activity();
revoke all on function public.emit_checkout_portal_activity() from public,anon,authenticated,service_role;

create function public.emit_idr_intake_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.intake_completed_at is not null and old.intake_completed_at is null then
    perform public.enqueue_portal_activity('idr-intake:'||new.id,'idr_intake_completed','idr_order',new.id,
      public.portal_client_snapshot(new.client_id) || jsonb_build_object(
        'order_id',new.id,'submission_id',new.ticket_submission_id,'product','insurance_damage_report','status',new.status));
  end if;
  return new;
end;
$$;
create trigger emit_idr_intake_portal_activity after update on public.idr_orders
  for each row execute function public.emit_idr_intake_portal_activity();
revoke all on function public.emit_idr_intake_portal_activity() from public,anon,authenticated,service_role;

create function public.emit_abstract_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare order_row public.idr_orders%rowtype;
begin
  if tg_op='UPDATE' and new.file_url is not distinct from old.file_url then return new; end if;
  select * into order_row from public.idr_orders where id=new.idr_order_id;
  perform public.enqueue_portal_activity('abstract:'||new.id||':'||new.file_url,'abstract_uploaded','abstract',new.id,
    public.portal_client_snapshot(order_row.client_id) || jsonb_build_object(
      'order_id',order_row.id,'submission_id',order_row.ticket_submission_id,'product','insurance_damage_report','status',new.parse_status));
  return new;
end;
$$;
create trigger emit_abstract_portal_activity after insert or update on public.abstracts
  for each row execute function public.emit_abstract_portal_activity();
revoke all on function public.emit_abstract_portal_activity() from public,anon,authenticated,service_role;

create function public.emit_outcome_survey_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.responded_at is not null and (tg_op='INSERT' or old.responded_at is null or new.responded_at is distinct from old.responded_at) then
    perform public.enqueue_portal_activity('outcome-survey:'||new.id||':'||new.responded_at::text,
      'outcome_survey_submitted','outcome_survey',new.id,
      public.portal_client_snapshot(new.client_id) || jsonb_build_object('report_id',new.idr_report_id,'status','submitted'));
  end if;
  return new;
end;
$$;
create trigger emit_outcome_survey_portal_activity after insert or update on public.outcome_surveys
  for each row execute function public.emit_outcome_survey_portal_activity();
revoke all on function public.emit_outcome_survey_portal_activity() from public,anon,authenticated,service_role;

create function public.emit_client_instruction_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare ticket public.ticket_submissions%rowtype;
begin
  if new.client_decided_at is not null and new.client_decided_at is distinct from old.client_decided_at then
    select * into ticket from public.ticket_submissions where id=new.ticket_submission_id;
    perform public.enqueue_portal_activity('client-instruction:'||new.id||':'||new.client_decided_at::text,
      'client_instruction_recorded','ate_crown_offer',new.id,
      public.portal_client_snapshot(ticket.client_id) || jsonb_build_object(
        'submission_id',ticket.id,'ticket_number',ticket.ticket_number,'product','photo_radar',
        'decision',new.client_decision,'status','recorded'));
  end if;
  return new;
end;
$$;
create trigger emit_client_instruction_portal_activity after update on public.ate_crown_offers
  for each row execute function public.emit_client_instruction_portal_activity();
revoke all on function public.emit_client_instruction_portal_activity() from public,anon,authenticated,service_role;

create function public.emit_referral_profile_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare client_id uuid; user_id uuid; client_snapshot jsonb;
begin
  select r.client_id,r.user_id into client_id,user_id from public.referral_codes r where r.id=new.referrer_id;
  client_snapshot := public.portal_client_snapshot(client_id);
  if client_id is null then
    select jsonb_build_object('client_name',coalesce(u.raw_user_meta_data->>'full_name','Portal user'),'client_email',u.email)
      into client_snapshot from auth.users u where u.id=user_id;
  end if;
  perform public.enqueue_portal_activity('referral-profile:'||new.referrer_id||':'||new.updated_at::text,
    'referral_profile_saved','referral_profile',new.referrer_id,
    coalesce(client_snapshot,'{}'::jsonb) || jsonb_build_object('status','saved'));
  return new;
end;
$$;
create trigger emit_referral_profile_portal_activity after insert or update on public.referral_payout_profiles
  for each row execute function public.emit_referral_profile_portal_activity();
revoke all on function public.emit_referral_profile_portal_activity() from public,anon,authenticated,service_role;

create function public.emit_pro_licence_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare ticket public.ticket_submissions%rowtype; kind text;
begin
  if new.status not in ('verified','unverified') or (tg_op='UPDATE' and new.status is not distinct from old.status) then return new; end if;
  select * into ticket from public.ticket_submissions where id=new.ticket_submission_id;
  kind := case new.status when 'verified' then 'pro_licence_verified' else 'pro_licence_unverified' end;
  perform public.enqueue_portal_activity('pro-licence:'||new.id||':'||new.status,kind,'pro_licence_verification',new.id,
    public.portal_client_snapshot(ticket.client_id) || jsonb_build_object(
      'submission_id',ticket.id,'ticket_number',ticket.ticket_number,'product','professional_driver_discount','status',new.status));
  return new;
end;
$$;
create trigger emit_pro_licence_portal_activity after insert or update on public.pro_licence_verifications
  for each row execute function public.emit_pro_licence_portal_activity();
revoke all on function public.emit_pro_licence_portal_activity() from public,anon,authenticated,service_role;

create function public.claim_portal_activity_events(p_limit integer default 10)
returns setof public.portal_activity_events language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 25 then raise exception 'PORTAL_ACTIVITY_BATCH_INVALID'; end if;
  update public.portal_activity_events set status='needs_review',claim_token=null,lease_until=null,
    last_error='Delivery remained uncertain beyond the safe retry window. Check the hello@fabsy.ca Sent mailbox before retrying.'
    where status in ('pending','processing') and (lease_until is null or lease_until<now())
      and (first_attempt_at < now()-interval '23 hours' or attempts>=15);
  return query with due as (
    select id from public.portal_activity_events
    where next_attempt_at<=now() and (status='pending' or (status='processing' and lease_until<now()))
      and (first_attempt_at is null or first_attempt_at>=now()-interval '23 hours') and attempts<15
    order by next_attempt_at,occurred_at,id for update skip locked limit p_limit
  ) update public.portal_activity_events e set status='processing',claim_token=gen_random_uuid(),
      lease_until=now()+interval '5 minutes',attempts=e.attempts+1,first_attempt_at=coalesce(e.first_attempt_at,now())
    from due where e.id=due.id returning e.*;
end;
$$;

create function public.complete_portal_activity_event(
  p_id uuid,p_claim uuid,p_provider_id text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(p_provider_id,'') is null and nullif(p_error,'') is null then raise exception 'PORTAL_ACTIVITY_RESULT_REQUIRED'; end if;
  update public.portal_activity_events set
    status=case when nullif(p_provider_id,'') is not null then 'sent' else 'pending' end,
    provider_email_id=nullif(p_provider_id,''),sent_at=case when nullif(p_provider_id,'') is not null then now() else null end,
    last_error=case when nullif(p_provider_id,'') is not null then null else left(p_error,500) end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts,6)))::integer),
    claim_token=null,lease_until=null
    where id=p_id and claim_token=p_claim and status='processing';
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;
revoke all on function public.claim_portal_activity_events(integer),public.complete_portal_activity_event(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.claim_portal_activity_events(integer),public.complete_portal_activity_event(uuid,uuid,text,text)
  to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_namespace where nspname='vault') then
    if exists(select 1 from vault.secrets where name='idr_project_url')
      and exists(select 1 from vault.secrets where name='idr_cron_secret') then
      perform cron.schedule('fabsy-portal-activity','* * * * *', $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='idr_project_url') || '/functions/v1/process-portal-activity',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
          body := '{}'::jsonb,
          timeout_milliseconds := 150000
        );
      $job$);
    end if;
  end if;
end $$;

comment on table public.portal_activity_events is
  'Durable operator-only email outbox for actionable client portal events; no passive page views or sign-ins.';

commit;
