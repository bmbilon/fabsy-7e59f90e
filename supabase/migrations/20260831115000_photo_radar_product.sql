-- Photo Radar: additive product and private ATE workflow; no historical repricing.
begin;

alter table public.ticket_submissions
  add column if not exists ticket_type text not null default 'officer_issued',
  add column if not exists ticket_type_source text not null default 'manual',
  add column if not exists registered_owner_on_offence_date text,
  add column if not exists order_type text not null default 'rapid_resolution',
  add column if not exists review_path text not null default 'standard',
  add column if not exists representation_paid_at timestamptz,
  add column if not exists representation_checkout_session_id text,
  add column if not exists representation_payment_intent_id text;

alter table public.ticket_submissions
  add constraint ticket_submissions_ticket_type_check check (ticket_type in ('officer_issued', 'photo_radar')),
  add constraint ticket_submissions_ticket_type_source_check check (ticket_type_source in ('upload', 'manual', 'entry', 'default')),
  add constraint ticket_submissions_owner_answer_check check (registered_owner_on_offence_date in ('yes', 'sold_before', 'stolen')),
  add constraint ticket_submissions_product_route_check check (
    (ticket_type = 'photo_radar' and order_type = 'photo_radar' and review_path = 'ate'
      and registered_owner_on_offence_date is not null and not representation_includes_assessment and insurance_company is null)
    or (ticket_type = 'officer_issued' and order_type = 'rapid_resolution' and review_path = 'standard' and registered_owner_on_offence_date is null)
  );

create or replace function public.enforce_ticket_triage_upgrade_benefits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.service_type = 'ticket_insurance_assessment' then
    new.representation_credit_eligible := new.ticket_type <> 'photo_radar'
      and new.assessment_payment_source is distinct from 'included_with_representation';
  end if;
  return new;
end;
$$;
alter table public.ticket_submissions drop constraint if exists ticket_submissions_assessment_shape_check;
alter table public.ticket_submissions add constraint ticket_submissions_assessment_shape_check check (
  service_type = 'representation' or (assessment_intake is not null and assessment_ticket_path is not null
    and assessment_access_token_hash is not null and representation_credit_eligible =
      (ticket_type <> 'photo_radar' and assessment_payment_source is distinct from 'included_with_representation'))
);

alter table public.idr_checkout_intents
  drop constraint if exists idr_checkout_intents_type_check,
  drop constraint if exists idr_checkout_intents_checkout_kind_check,
  drop constraint if exists idr_checkout_intents_expected_amount_cents_check,
  drop constraint if exists idr_checkout_intents_product_price_check;
alter table public.idr_checkout_intents
  add constraint idr_checkout_intents_type_check check (type in ('ticket','standalone','addon','assessment','photo_radar')),
  add constraint idr_checkout_intents_checkout_kind_check check (checkout_kind in ('ticket_only','idr_only','ticket_with_addon','ticket_assessment','photo_radar')),
  add constraint idr_checkout_intents_expected_amount_cents_check check (expected_amount_cents in (3100,4900,7900,9900,12900,14900,19800,48800)),
  add constraint idr_checkout_intents_product_price_check check (
    (type='photo_radar' and expected_amount_cents=7900 and checkout_kind='photo_radar') or
    (type='ticket' and expected_amount_cents in (19800,48800) and checkout_kind='ticket_only') or
    (type='standalone' and expected_amount_cents in (4900,12900) and checkout_kind='idr_only') or
    (type='addon' and expected_amount_cents in (3100,9900) and checkout_kind in ('idr_only','ticket_with_addon')) or
    (type='assessment' and expected_amount_cents=14900 and checkout_kind='ticket_assessment')
  );

-- Fail deployment rather than discard conflicting historical purchases.
drop index if exists public.idx_idr_checkout_intents_core_purchase;
create unique index idx_idr_checkout_intents_core_purchase on public.idr_checkout_intents(ticket_submission_id)
  where ticket_submission_id is not null and checkout_kind in ('ticket_only','ticket_with_addon','photo_radar');

create or replace function public.enforce_ticket_product_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
declare kind text; saved_locale text;
begin
  if new.ticket_submission_id is null then return new; end if;
  select t.ticket_type,coalesce(to_jsonb(t)->>'preferred_locale','en') into kind,saved_locale
    from public.ticket_submissions t where id=new.ticket_submission_id for update;
  if (new.type='photo_radar' and kind is distinct from 'photo_radar') or
     (kind='photo_radar' and new.type<>'photo_radar') then
    raise exception 'TICKET_PRODUCT_MISMATCH';
  end if;
  if kind='photo_radar' and saved_locale<>'en' then
    raise exception 'PHOTO_RADAR_LOCALE_NOT_RELEASED';
  end if;
  return new;
end;
$$;
create trigger enforce_ticket_product_checkout before insert or update on public.idr_checkout_intents
  for each row execute function public.enforce_ticket_product_checkout();

create or replace function public.prevent_photo_radar_insurance_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from public.ticket_submissions where id=new.ticket_submission_id and ticket_type='photo_radar') then
    raise exception 'PHOTO_RADAR_HAS_NO_INSURANCE_REPORT';
  end if;
  return new;
end;
$$;
create trigger prevent_photo_radar_insurance_order before insert or update of ticket_submission_id on public.idr_orders
  for each row execute function public.prevent_photo_radar_insurance_order();

-- Also protects the new classification/consent fields. Old guards remain in place.
create or replace function public.protect_photo_radar_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from public.idr_checkout_intents i where i.ticket_submission_id=old.id and i.status in ('creating','open','paid')) and (
    new.ticket_type is distinct from old.ticket_type or new.ticket_type_source is distinct from old.ticket_type_source or
    new.registered_owner_on_offence_date is distinct from old.registered_owner_on_offence_date or
    new.order_type is distinct from old.order_type or new.review_path is distinct from old.review_path or
    (old.ticket_type='photo_radar' and (
      (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(new)) where key=any(array[
        'client_id','first_name','last_name','email','phone','address','city','postal_code','date_of_birth','drivers_license',
        'ticket_number','violation','fine_amount','violation_date','violation_time','court_location','court_date','defense_strategy',
        'additional_notes','insurance_company','sms_opt_in','source_assessment_id','representation_includes_assessment','service_type',
        'ticket_document_path','representation_access_token_hash','consent_form_path','preferred_locale'
      ])) is distinct from
      (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(old)) where key=any(array[
        'client_id','first_name','last_name','email','phone','address','city','postal_code','date_of_birth','drivers_license',
        'ticket_number','violation','fine_amount','violation_date','violation_time','court_location','court_date','defense_strategy',
        'additional_notes','insurance_company','sms_opt_in','source_assessment_id','representation_includes_assessment','service_type',
        'ticket_document_path','representation_access_token_hash','consent_form_path','preferred_locale'
      ]))
    ))
  ) then raise exception 'REPRESENTATION_CHECKOUT_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger protect_photo_radar_checkout before update on public.ticket_submissions
  for each row execute function public.protect_photo_radar_checkout();

create table public.ate_reviews (
  ticket_submission_id uuid primary key references public.ticket_submissions(id) on delete restrict,
  notice_kind text not null default 'unknown' check (notice_kind in ('unknown','speed','red_light')),
  jurisdiction text not null default '',
  offence_at timestamptz,
  complete_disclosure_at timestamptz,
  action_due_at timestamptz,
  action_taken_at timestamptz,
  action_notes text not null default '' check(length(action_notes)<=10000),
  checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array' and octet_length(checklist::text)<=40000),
  crown_asks jsonb not null default '[]' check(jsonb_typeof(crown_asks)='array' and octet_length(crown_asks::text)<=40000),
  evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=60000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  original_fine_cents integer check(original_fine_cents>=0),
  final_fine_cents integer check(final_fine_cents>=0),
  outcome text check(outcome in ('withdrawn','reduced','unchanged')),
  outcome_reference text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ate_review_resolution_complete check(
    (resolved_at is null and outcome is null and final_fine_cents is null) or
    (resolved_at is not null and original_fine_cents is not null and final_fine_cents is not null and outcome is not null and length(btrim(outcome_reference))>0)
  )
);
create index ate_reviews_due_idx on public.ate_reviews(action_due_at) where action_taken_at is null;

create table public.ate_crown_offers (
  id uuid primary key default gen_random_uuid(),
  ticket_submission_id uuid not null references public.ate_reviews(ticket_submission_id) on delete restrict,
  version integer not null check(version>0),
  response_text text not null check(length(btrim(response_text)) between 1 and 10000),
  proposed_fine_cents integer not null check(proposed_fine_cents>=0),
  expires_at timestamptz,
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  client_decision text not null default 'pending' check(client_decision in ('pending','approved','declined','question')),
  client_reply text,
  client_decided_at timestamptz,
  client_decided_by uuid references auth.users(id),
  unique(ticket_submission_id,version)
);

-- Durable, private handoff for the existing operator/clone process. Enqueueing
-- and claiming events never sends an email or accepts a Crown agreement.
create table public.ate_case_events (
  id uuid primary key default gen_random_uuid(),
  ticket_submission_id uuid not null references public.ate_reviews(ticket_submission_id) on delete restrict,
  event_key text not null unique,
  event_type text not null check(event_type in ('payment_confirmed','disclosure_complete','action_recorded','crown_offer','client_instruction','outcome_recorded')),
  audience text not null check(audience in ('client','staff')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=20000),
  status text not null default 'pending' check(status in ('pending','processing','completed')),
  claim_token uuid,
  claimed_at timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 5),
  delivery_reference text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index ate_case_events_pending_idx on public.ate_case_events(created_at) where status<>'completed';
alter table public.ate_case_events enable row level security;
revoke all on public.ate_case_events from public,anon,authenticated,service_role;
grant select on public.ate_case_events to authenticated,service_role;
create policy "Staff read ATE event handoff" on public.ate_case_events for select to authenticated using(public.is_idr_staff());

create or replace function public.enqueue_ate_case_event(p_submission_id uuid,p_event_type text,p_key text,p_payload jsonb,p_audience text default 'client')
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.ate_case_events(ticket_submission_id,event_type,event_key,audience,payload)
  values(p_submission_id,p_event_type,p_key,p_audience,p_payload||jsonb_build_object('order_type','photo_radar','review_path','ate','portal_path','/portal/cases/'||p_submission_id::text,'delivery_policy','prepare_for_operator_review'))
  on conflict(event_key) do nothing;
end;
$$;
revoke all on function public.enqueue_ate_case_event(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.emit_ate_review_events()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    perform public.enqueue_ate_case_event(new.ticket_submission_id,'payment_confirmed','ate:'||new.ticket_submission_id::text||':paid',jsonb_build_object('base_cents',7900,'gst_cents',395,'total_cents',8295));
  else
    if old.complete_disclosure_at is null and new.complete_disclosure_at is not null then
      perform public.enqueue_ate_case_event(new.ticket_submission_id,'disclosure_complete','ate:'||new.ticket_submission_id::text||':disclosure',jsonb_build_object('complete_disclosure_at',new.complete_disclosure_at,'action_due_at',new.action_due_at));
    end if;
    if old.action_taken_at is null and new.action_taken_at is not null then
      perform public.enqueue_ate_case_event(new.ticket_submission_id,'action_recorded','ate:'||new.ticket_submission_id::text||':action',jsonb_build_object('action_taken_at',new.action_taken_at));
    end if;
    if old.resolved_at is null and new.resolved_at is not null then
      perform public.enqueue_ate_case_event(new.ticket_submission_id,'outcome_recorded','ate:'||new.ticket_submission_id::text||':outcome',jsonb_build_object('outcome',new.outcome,'original_fine_cents',new.original_fine_cents,'final_fine_cents',new.final_fine_cents));
    end if;
  end if;
  return new;
end;
$$;
create trigger emit_ate_review_events after insert or update on public.ate_reviews for each row execute function public.emit_ate_review_events();
revoke all on function public.emit_ate_review_events() from public,anon,authenticated,service_role;

create or replace function public.emit_ate_offer_events()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    perform public.enqueue_ate_case_event(new.ticket_submission_id,'crown_offer','ate:offer:'||new.id::text,
      jsonb_build_object('offer_id',new.id,'version',new.version,'proposed_fine_cents',new.proposed_fine_cents,'expires_at',new.expires_at));
  elsif new.client_decided_at is distinct from old.client_decided_at then
    perform public.enqueue_ate_case_event(new.ticket_submission_id,'client_instruction','ate:instruction:'||new.id::text||':'||new.client_decided_at::text,
      jsonb_build_object('offer_id',new.id,'version',new.version,'decision',new.client_decision,'client_decided_at',new.client_decided_at),'staff');
  end if;
  return new;
end;
$$;
create trigger emit_ate_offer_events after insert or update on public.ate_crown_offers for each row execute function public.emit_ate_offer_events();
revoke all on function public.emit_ate_offer_events() from public,anon,authenticated,service_role;

create or replace function public.claim_ate_case_events(p_limit integer default 10)
returns setof public.ate_case_events language plpgsql security definer set search_path=public as $$
begin
  if p_limit is null or p_limit<1 or p_limit>50 then raise exception 'ATE_EVENT_BATCH_INVALID'; end if;
  return query with candidates as (
    select id from public.ate_case_events where attempts<5 and (status='pending' or (status='processing' and claimed_at<now()-interval '10 minutes'))
    order by created_at,id for update skip locked limit p_limit
  ) update public.ate_case_events e set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=e.attempts+1
    from candidates c where e.id=c.id returning e.*;
end;
$$;
revoke all on function public.claim_ate_case_events(integer) from public,anon,authenticated;
grant execute on function public.claim_ate_case_events(integer) to service_role;
create or replace function public.complete_ate_case_event(p_id uuid,p_claim_token uuid,p_delivery_reference text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_claim_token is null or p_delivery_reference is null or length(btrim(p_delivery_reference)) not between 1 and 1000 then raise exception 'ATE_EVENT_COMPLETION_INVALID'; end if;
  update public.ate_case_events set status='completed',delivery_reference=p_delivery_reference,completed_at=now()
    where id=p_id and claim_token=p_claim_token and status='processing';
  return found;
end;
$$;
revoke all on function public.complete_ate_case_event(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_ate_case_event(uuid,uuid,text) to service_role;

-- ATE completion cannot bypass actual-fine recording or the client-decision lane.
create or replace function public.enforce_ate_terminal_consistency()
returns trigger language plpgsql security definer set search_path=public as $$
declare review public.ate_reviews%rowtype;
begin
  if new.ticket_type<>'photo_radar' then return new; end if;
  if new.status in ('pending','in_progress','completed') and (new.representation_paid_at is null or
    not exists(select 1 from public.idr_checkout_intents i where i.ticket_submission_id=new.id and i.type='photo_radar'
      and i.status='paid' and i.stripe_checkout_session_id=new.representation_checkout_session_id)) then
    raise exception 'ATE_VERIFIED_PAYMENT_REQUIRED';
  end if;
  if new.status='completed' or new.case_outcome is not null then
    select * into review from public.ate_reviews where ticket_submission_id=new.id;
    if not found or review.resolved_at is null or new.status<>'completed' or
      new.case_outcome is distinct from (case review.outcome when 'unchanged' then 'conviction_stands' else review.outcome end) then
      raise exception 'ATE_ACTUAL_OUTCOME_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
create trigger enforce_ate_terminal_consistency before insert or update on public.ticket_submissions
  for each row execute function public.enforce_ate_terminal_consistency();
revoke all on function public.enforce_ate_terminal_consistency() from public,anon,authenticated,service_role;

alter table public.ate_reviews enable row level security;
alter table public.ate_crown_offers enable row level security;
revoke all on public.ate_reviews, public.ate_crown_offers from public, anon, authenticated;
grant select on public.ate_reviews, public.ate_crown_offers to authenticated;
grant all on public.ate_reviews, public.ate_crown_offers to service_role;
create policy "Staff read ATE review" on public.ate_reviews for select to authenticated using(public.is_idr_staff());
create policy "Staff and case owners read Crown offers" on public.ate_crown_offers for select to authenticated using (
  public.is_idr_staff() or exists(select 1 from public.ticket_submissions t join public.clients c on c.id=t.client_id
    where t.id=ticket_submission_id and c.auth_user_id=auth.uid())
);

create or replace function public.activate_photo_radar_checkout(
  p_intent_id uuid,p_submission_id uuid,p_client_id uuid,p_session_id text,p_attempt integer,p_payment_intent_id text
) returns text language plpgsql security definer set search_path = public as $$
declare t public.ticket_submissions%rowtype; i public.idr_checkout_intents%rowtype; was_paid boolean;
begin
  select * into t from public.ticket_submissions where id=p_submission_id for update;
  select * into i from public.idr_checkout_intents where id=p_intent_id for update;
  if t.id is null or i.id is null or p_client_id is null or p_attempt is null or t.client_id<>p_client_id or i.client_id<>p_client_id or
    i.ticket_submission_id<>t.id or t.ticket_type<>'photo_radar' or t.order_type<>'photo_radar' or t.review_path<>'ate' or
    t.service_type<>'representation' or i.type<>'photo_radar' or i.checkout_kind<>'photo_radar' or i.expected_amount_cents<>7900 or
    i.attempts<>p_attempt or i.status not in ('creating','open','paid') or p_session_id is null or p_session_id !~ '^cs_' or
    (i.stripe_checkout_session_id is not null and i.stripe_checkout_session_id<>p_session_id) or
    (t.representation_checkout_session_id is not null and t.representation_checkout_session_id<>p_session_id) then
    raise exception 'PHOTO_RADAR_PAYMENT_RESERVATION_MISMATCH';
  end if;
  was_paid := t.representation_paid_at is not null;
  update public.idr_checkout_intents set status='paid',stripe_checkout_session_id=p_session_id where id=i.id;
  update public.ticket_submissions set status=case when status='awaiting_payment' then 'pending' else status end,
    representation_paid_at=coalesce(representation_paid_at,now()),representation_checkout_session_id=p_session_id,
    representation_payment_intent_id=coalesce(representation_payment_intent_id,p_payment_intent_id),updated_at=now() where id=t.id;
  insert into public.ate_reviews(ticket_submission_id,original_fine_cents) values(t.id,
    case when t.fine_amount ~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then round(t.fine_amount::numeric*100)::integer else null end)
    on conflict(ticket_submission_id) do nothing;
  return case when was_paid then 'ticket_already_active' else 'ticket_activated' end;
end;
$$;
revoke all on function public.activate_photo_radar_checkout(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.activate_photo_radar_checkout(uuid,uuid,uuid,text,integer,text) to service_role;

create or replace function public.save_ate_review(
  p_submission_id uuid,p_notice_kind text,p_jurisdiction text,p_evidence jsonb,p_checklist jsonb,p_crown_asks jsonb,
  p_complete_disclosure_at timestamptz default null,p_action_notes text default '',p_action_taken_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare review public.ate_reviews%rowtype; item jsonb; expected_keys text[] := array['plate_match','site_permission','zone_hours','construction_workers','five_minute_rule','mailing_service','ownership','operator_calibration'];
begin
  if not public.is_idr_staff() then raise exception 'ATE_STAFF_REQUIRED'; end if;
  select * into review from public.ate_reviews where ticket_submission_id=p_submission_id for update;
  if not found then raise exception 'ATE_PAID_CASE_REQUIRED'; end if;
  if p_checklist is null or jsonb_typeof(p_checklist)<>'array' or jsonb_array_length(p_checklist)<>8 or
     (select array_agg(x->>'key' order by x->>'key') from jsonb_array_elements(p_checklist) x) is distinct from
     (select array_agg(x order by x) from unnest(expected_keys) x) then raise exception 'ATE_CHECKLIST_INVALID'; end if;
  for item in select * from jsonb_array_elements(p_checklist) loop
    if item->>'status' not in ('pending','pass','issue','missing','not_applicable') or item->>'status' is null then raise exception 'ATE_CHECKLIST_INVALID'; end if;
    if item->>'status' in ('pass','issue') and length(btrim(coalesce(item->>'evidence','')))=0 then raise exception 'ATE_EVIDENCE_REFERENCE_REQUIRED'; end if;
  end loop;
  if p_complete_disclosure_at>now() or p_action_taken_at>now() or
    (review.complete_disclosure_at is not null and p_complete_disclosure_at is distinct from review.complete_disclosure_at) or
    (review.action_taken_at is not null and p_action_taken_at is distinct from review.action_taken_at) or
    (p_action_taken_at is not null and (p_complete_disclosure_at is null or p_action_taken_at<p_complete_disclosure_at or length(btrim(p_action_notes))=0)) then
    raise exception 'ATE_DISCLOSURE_TIMING_INVALID';
  end if;
  update public.ate_reviews set notice_kind=p_notice_kind,jurisdiction=p_jurisdiction,evidence=p_evidence,checklist=p_checklist,crown_asks=p_crown_asks,
    complete_disclosure_at=p_complete_disclosure_at,action_due_at=p_complete_disclosure_at+interval '48 hours',
    action_taken_at=p_action_taken_at,action_notes=p_action_notes,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where ticket_submission_id=p_submission_id;
end;
$$;
revoke all on function public.save_ate_review(uuid,text,text,jsonb,jsonb,jsonb,timestamptz,text,timestamptz) from public,anon;
grant execute on function public.save_ate_review(uuid,text,text,jsonb,jsonb,jsonb,timestamptz,text,timestamptz) to authenticated;

create or replace function public.record_ate_crown_offer(p_submission_id uuid,p_response_text text,p_proposed_fine_cents integer,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare next_version integer; offer_id uuid;
begin
  if not public.is_idr_staff() then raise exception 'ATE_STAFF_REQUIRED'; end if;
  perform 1 from public.ate_reviews where ticket_submission_id=p_submission_id and resolved_at is null for update;
  if not found then raise exception 'ATE_ACTIVE_CASE_REQUIRED'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'ATE_OFFER_ALREADY_EXPIRED'; end if;
  select coalesce(max(version),0)+1 into next_version from public.ate_crown_offers where ticket_submission_id=p_submission_id;
  insert into public.ate_crown_offers(ticket_submission_id,version,response_text,proposed_fine_cents,expires_at,recorded_by)
  values(p_submission_id,next_version,p_response_text,p_proposed_fine_cents,p_expires_at,auth.uid()) returning id into offer_id;
  return offer_id;
end;
$$;
revoke all on function public.record_ate_crown_offer(uuid,text,integer,timestamptz) from public,anon;
grant execute on function public.record_ate_crown_offer(uuid,text,integer,timestamptz) to authenticated;

create or replace function public.respond_to_ate_crown_offer(p_offer_id uuid,p_decision text,p_reply text default '')
returns void language plpgsql security definer set search_path = public as $$
declare offer public.ate_crown_offers%rowtype; case_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select ticket_submission_id into case_id from public.ate_crown_offers where id=p_offer_id;
  -- Same parent lock as offer creation: a replacement cannot race an approval.
  perform 1 from public.ate_reviews where ticket_submission_id=case_id and resolved_at is null for update;
  if not found then raise exception 'ATE_ACTIVE_CASE_REQUIRED'; end if;
  select * into offer from public.ate_crown_offers where id=p_offer_id for update;
  if not found or not exists(select 1 from public.ticket_submissions t join public.clients c on c.id=t.client_id
    where t.id=offer.ticket_submission_id and c.auth_user_id=auth.uid()) then raise exception 'CASE_OWNERSHIP_REQUIRED'; end if;
  if p_decision not in ('approved','declined','question') or p_decision is null or length(p_reply)>10000 or (p_decision='question' and length(btrim(p_reply))=0) then raise exception 'ATE_DECISION_INVALID'; end if;
  if offer.expires_at<=now() or exists(select 1 from public.ate_crown_offers where ticket_submission_id=offer.ticket_submission_id and version>offer.version) then raise exception 'ATE_OFFER_NO_LONGER_CURRENT'; end if;
  if offer.client_decision in ('approved','declined') then
    if offer.client_decision=p_decision then return; end if;
    raise exception 'ATE_DECISION_ALREADY_RECORDED';
  end if;
  update public.ate_crown_offers set client_decision=p_decision,client_reply=p_reply,client_decided_at=now(),client_decided_by=auth.uid() where id=p_offer_id;
  -- Recording an instruction never communicates with the Crown or enters a plea.
end;
$$;
revoke all on function public.respond_to_ate_crown_offer(uuid,text,text) from public,anon;
grant execute on function public.respond_to_ate_crown_offer(uuid,text,text) to authenticated;

create or replace function public.record_ate_outcome(p_submission_id uuid,p_original_fine_cents integer,p_final_fine_cents integer,p_outcome text,p_reference text)
returns void language plpgsql security definer set search_path = public as $$
declare current_offer public.ate_crown_offers%rowtype;
begin
  if not public.is_idr_staff() then raise exception 'ATE_STAFF_REQUIRED'; end if;
  perform 1 from public.ate_reviews where ticket_submission_id=p_submission_id for update;
  if not found then raise exception 'ATE_PAID_CASE_REQUIRED'; end if;
  if p_original_fine_cents is null or p_final_fine_cents is null or p_original_fine_cents<0 or p_final_fine_cents<0 or
    p_outcome is null or p_outcome not in ('withdrawn','reduced','unchanged') or p_reference is null or length(btrim(p_reference))=0 or
    (p_outcome='withdrawn' and p_final_fine_cents<>0) or
    (p_outcome='reduced' and p_final_fine_cents>=p_original_fine_cents) or
    (p_outcome='unchanged' and p_final_fine_cents<>p_original_fine_cents) then raise exception 'ATE_OUTCOME_INVALID'; end if;
  if p_outcome='reduced' then
    select * into current_offer from public.ate_crown_offers where ticket_submission_id=p_submission_id order by version desc limit 1;
    if not found or current_offer.client_decision<>'approved' or current_offer.proposed_fine_cents<>p_final_fine_cents then raise exception 'ATE_CLIENT_APPROVAL_REQUIRED'; end if;
  end if;
  update public.ate_reviews set original_fine_cents=p_original_fine_cents,final_fine_cents=p_final_fine_cents,outcome=p_outcome,outcome_reference=p_reference,resolved_at=coalesce(resolved_at,now()),updated_at=now()
    where ticket_submission_id=p_submission_id;
  update public.ticket_submissions set status='completed',case_outcome=case p_outcome when 'unchanged' then 'conviction_stands' else p_outcome end,updated_at=now() where id=p_submission_id;
end;
$$;
revoke all on function public.record_ate_outcome(uuid,integer,integer,text,text) from public,anon;
grant execute on function public.record_ate_outcome(uuid,integer,integer,text,text) to authenticated;

create or replace function public.ate_first_twenty_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_idr_staff() then raise exception 'ATE_STAFF_REQUIRED'; end if;
  with cohort as (
    select r.* from public.ticket_submissions t join public.ate_reviews r on r.ticket_submission_id=t.id
    where t.ticket_type='photo_radar' and t.representation_paid_at is not null
    order by t.representation_paid_at,t.id limit 20
  ), stats as (
    select count(*) as files,count(*) filter(where resolved_at is not null) as resolved,
      percentile_cont(0.5) within group(order by greatest(original_fine_cents-final_fine_cents,0)/100.0)
        filter(where resolved_at is not null) as median_reduction_cad from cohort
  ) select jsonb_build_object('cohort_count',files,'resolved_count',resolved,'pending_count',files-resolved,
    'median_reduction_cad',median_reduction_cad,'below_40',median_reduction_cad<40,'cohort_complete',files=20 and resolved=20)
    into result from stats;
  return result;
end;
$$;
revoke all on function public.ate_first_twenty_metrics() from public,anon;
grant execute on function public.ate_first_twenty_metrics() to authenticated;

comment on table public.ate_reviews is 'Private ATE evidence review. Missing evidence is a question, not a finding. The action clock starts at complete disclosure; no automated Crown acceptance.';
comment on table public.ate_crown_offers is 'Versioned Crown responses and case-specific client instructions; external Crown action still requires an authorized operator.';
comment on table public.ate_case_events is 'Private durable ATE notification/clone outbox. Consumers prepare updates for operator review and must obtain applicable sending authorization; these RPCs do not send messages or accept offers.';
comment on function public.ate_first_twenty_metrics() is 'First 20 paid ATE files, not first 20 successful cases. Resolved unchanged fines contribute zero; pending cases remain missing.';
commit;
