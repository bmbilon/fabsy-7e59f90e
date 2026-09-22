begin;

create table public.service_orders (
  id uuid primary key,
  access_token_hash text not null check (access_token_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null,
  product text not null check (product in ('photo_radar','rapid_resolution','insurance_report','bundle')),
  mode text not null check (mode in ('both','consent','payment')),
  name text not null,
  represented_name text not null,
  email text not null check (email = lower(trim(email))),
  ticket_number text,
  registered_owner boolean not null default false,
  subtotal_cents integer not null,
  gst_cents integer not null,
  total_cents integer not null,
  consent jsonb,
  purchase_terms jsonb not null,
  consent_form_path text,
  ticket_document_path text,
  pending_upload_path text,
  client_id uuid references public.clients(id),
  ticket_submission_id uuid references public.ticket_submissions(id),
  match_status text not null default 'awaiting_ticket' check (match_status in ('awaiting_ticket','matched','needs_review')),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  checkout_attempt integer not null default 1,
  payment_status text not null default 'not_started' check (payment_status in ('not_started','open','paid','expired','failed','refunded','disputed')),
  paid_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mode = 'payment' and consent is null) or (mode <> 'payment' and consent->>'accepted' = 'true')),
  check (total_cents = subtotal_cents + gst_cents and gst_cents = round(subtotal_cents * 0.05)),
  check ((product='photo_radar' and subtotal_cents=7900) or (product='rapid_resolution' and subtotal_cents=19800) or
    (product='insurance_report' and subtotal_cents=4900) or (product='bundle' and subtotal_cents=22900))
);
create index service_orders_email_idx on public.service_orders(email,created_at desc);
create index service_orders_ticket_idx on public.service_orders(ticket_submission_id);
alter table public.service_orders enable row level security;
revoke all on public.service_orders from public,anon,authenticated;
grant select on public.service_orders to authenticated;
grant all on public.service_orders to service_role;
create policy "Staff read service orders" on public.service_orders for select to authenticated using(public.is_idr_staff());

create function public.protect_service_order() returns trigger language plpgsql set search_path=public as $$
begin
  if (to_jsonb(new) - array['consent_form_path','ticket_document_path','pending_upload_path','client_id','ticket_submission_id','match_status','stripe_session_id','stripe_payment_intent_id','checkout_attempt','payment_status','paid_at','applied_at','updated_at'])
    is distinct from (to_jsonb(old) - array['consent_form_path','ticket_document_path','pending_upload_path','client_id','ticket_submission_id','match_status','stripe_session_id','stripe_payment_intent_id','checkout_attempt','payment_status','paid_at','applied_at','updated_at']) then
    raise exception 'SERVICE_ORDER_ACCEPTANCE_IMMUTABLE';
  end if;
  if old.payment_status in ('paid','refunded','disputed') and
    (new.stripe_session_id is distinct from old.stripe_session_id or new.checkout_attempt <> old.checkout_attempt or new.payment_status not in ('paid','refunded','disputed')) then
    raise exception 'SERVICE_ORDER_PAYMENT_IMMUTABLE';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger protect_service_order before update on public.service_orders for each row execute function public.protect_service_order();

-- An email is a matching key, never a credential. This function exposes no
-- existing ticket data to the customer and never selects among multiple tickets.
create function public.match_service_order(p_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare o public.service_orders; candidates uuid[]; identity_matches boolean;
begin
  select * into o from public.service_orders where id=p_id for update;
  if not found or o.product='insurance_report' or o.ticket_submission_id is not null then return o.ticket_submission_id; end if;
  select array_agg(t.id) into candidates from public.ticket_submissions t
    where lower(trim(t.email))=o.email and t.service_type='representation'
    and t.status in ('awaiting_payment','pending','in_progress') and t.deleted_at is null
    and (o.ticket_number is null or upper(trim(t.ticket_number))=o.ticket_number)
    and (t.ticket_type='photo_radar')=(o.product='photo_radar')
    and not exists(select 1 from public.service_orders other where other.ticket_submission_id=t.id and other.id<>o.id and other.mode<>'consent' and o.mode<>'consent');
  if coalesce(array_length(candidates,1),0)=1 then
    select lower(regexp_replace(trim(t.first_name || ' ' || t.last_name),'\s+',' ','g'))=lower(o.represented_name) into identity_matches
      from public.ticket_submissions t where t.id=candidates[1];
    if identity_matches or o.ticket_number is not null then
      update public.service_orders set ticket_submission_id=candidates[1],match_status='matched' where id=o.id;
      return candidates[1];
    end if;
  end if;
  update public.service_orders set match_status=case when coalesce(array_length(candidates,1),0)>0 then 'needs_review' else 'awaiting_ticket' end where id=o.id;
  return null;
end $$;
revoke all on function public.match_service_order(uuid) from public,anon,authenticated;
grant execute on function public.match_service_order(uuid) to service_role;

-- Apply verified service-order evidence to the existing case pipeline atomically.
-- No authorization or payment is invented for payment-only / consent-only orders.
create function public.apply_service_order(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare o public.service_orders; t public.ticket_submissions; k text; it text;
begin
  select * into o from public.service_orders where id=p_id for update;
  if o.applied_at is not null then return true; end if;
  if o.ticket_submission_id is null then return false; end if;
  select * into t from public.ticket_submissions where id=o.ticket_submission_id for update;
  if t.id is null or t.deleted_at is not null or lower(trim(t.email))<>o.email or t.service_type<>'representation'
    or (t.ticket_type='photo_radar')<>(o.product='photo_radar') or nullif(trim(t.ticket_number),'') is null
    or t.intake_review_status not in ('complete','ready') then return false; end if;
  if o.mode='consent' then
    -- Attach the separate consent evidence without altering an immutable paid intake.
    if t.intake_consent is null and not exists(select 1 from public.idr_checkout_intents where ticket_submission_id=t.id and status in ('creating','open','paid')) then
      update public.ticket_submissions set intake_consent=o.consent where id=t.id;
    end if;
    if t.consent_form_path is null then
      update public.ticket_submissions set consent_form_path=o.consent_form_path where id=t.id;
    end if;
    update public.service_orders set applied_at=now() where id=o.id;
    return true;
  end if;
  if o.payment_status<>'paid' or o.stripe_session_id is null or o.stripe_payment_intent_id is null then return false; end if;
  if exists(select 1 from public.idr_checkout_intents where ticket_submission_id=t.id
    and checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and id<>o.id) then return false; end if;
  if coalesce(o.consent_form_path,t.consent_form_path) is null then return false; end if;
  if t.representation_checkout_session_id is not null and t.representation_checkout_session_id<>o.stripe_session_id then return false; end if;
  if o.consent is not null and t.intake_consent is null then
    update public.ticket_submissions set intake_consent=o.consent,consent_form_path=o.consent_form_path where id=t.id;
  end if;
  k := case o.product when 'photo_radar' then 'photo_radar' when 'bundle' then 'ticket_with_addon' else 'ticket_only' end;
  it := case o.product when 'photo_radar' then 'photo_radar' when 'bundle' then 'addon' else 'ticket' end;
  insert into public.idr_checkout_intents(id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,purchaser_email,
    stripe_checkout_session_id,status,attempts,pro_discount_cents,pro_subtotal_cents)
    values(o.id,t.client_id,t.id,it,k,case when o.product='bundle' then 3100 else o.subtotal_cents end,o.email,
      o.stripe_session_id,'paid',o.checkout_attempt,0,case when o.product='photo_radar' then null else o.subtotal_cents end)
    on conflict(id) do nothing;
  update public.ticket_submissions set representation_paid_at=o.paid_at,representation_checkout_session_id=o.stripe_session_id,
    representation_payment_intent_id=o.stripe_payment_intent_id,consent_form_path=coalesce(consent_form_path,o.consent_form_path),
    status=case when status='awaiting_payment' then 'pending' else status end where id=t.id;
  if o.product='photo_radar' then
    insert into public.ate_reviews(ticket_submission_id,original_fine_cents) values(t.id,
      case when t.fine_amount ~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then round(t.fine_amount::numeric*100)::integer else null end)
      on conflict(ticket_submission_id) do nothing;
  end if;
  update public.idr_orders set ticket_submission_id=t.id where id=o.id;
  update public.service_orders set applied_at=now() where id=o.id;
  return true;
end $$;
revoke all on function public.apply_service_order(uuid) from public,anon,authenticated;
grant execute on function public.apply_service_order(uuid) to service_role;

-- Uploads and subsequently entered emailed tickets are matched using the same key.
-- Payment activation is retried by the checkout status / staff queue, so a
-- candidate match cannot make an unrelated ticket upload fail.
create function public.match_new_ticket_service_orders() returns trigger language plpgsql security definer set search_path=public as $$
declare order_id uuid;
begin
  if pg_trigger_depth()>1 or nullif(trim(new.email),'') is null then return new; end if;
  for order_id in select id from public.service_orders where email=lower(trim(new.email)) and ticket_submission_id is null loop
    perform public.match_service_order(order_id);
  end loop;
  for order_id in select id from public.service_orders where ticket_submission_id=new.id and applied_at is null loop
    begin
      perform public.apply_service_order(order_id);
    exception when others then
      -- Preserve the uploaded/reviewed ticket. The visible orders queue retries
      -- activation and retains the original verified payment evidence.
      raise warning 'Service order % requires case review', order_id;
    end;
  end loop;
  return new;
end $$;
create trigger match_new_ticket_service_orders after insert or update of email,ticket_number,first_name,last_name,intake_review_status on public.ticket_submissions
  for each row execute function public.match_new_ticket_service_orders();

commit;
