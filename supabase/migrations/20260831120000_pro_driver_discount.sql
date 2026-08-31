-- Server-verified officer pricing. No public write can assert eligibility.
begin;

alter table public.ticket_submissions
  add column if not exists declared_licence_class text not null default 'unknown'
    check (declared_licence_class in ('1','2','3','4','5','6','7','unknown')),
  add column if not exists pro_verified boolean not null default false,
  add column if not exists pro_verification_id uuid,
  add column if not exists discount_applied text check (discount_applied is null or discount_applied = 'PRO20'),
  add column if not exists pro_discount_cents integer not null default 0 check (pro_discount_cents in (0,3960,4580));

create table public.pro_licence_verifications (
  id uuid primary key default gen_random_uuid(),
  ticket_submission_id uuid not null references public.ticket_submissions(id) on delete restrict,
  declared_class text not null check (declared_class in ('1','2','4')),
  read_class text check (read_class is null or read_class in ('1','2','3','4','5','6','7')),
  jurisdiction text check (jurisdiction is null or jurisdiction = 'AB'),
  identity_matches boolean not null default false,
  identity_snapshot text not null,
  evidence_path text not null unique,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing' check (status in ('processing','verified','unverified')),
  result_code text,
  expires_on date,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (status <> 'verified' or (
    read_class is not null and jurisdiction is not null
    and read_class = declared_class and jurisdiction = 'AB' and identity_matches
    and expires_on is not null and completed_at is not null
  ))
);
alter table public.ticket_submissions
  add constraint ticket_submissions_pro_verification_fk
  foreign key (pro_verification_id) references public.pro_licence_verifications(id) on delete restrict;
alter table public.ticket_submissions
  add constraint ticket_submissions_verified_pro_evidence_check check (not pro_verified or pro_verification_id is not null);
create index pro_verification_submission_created on public.pro_licence_verifications(ticket_submission_id, created_at desc);

alter table public.idr_checkout_intents
  add column if not exists pro_verification_id uuid references public.pro_licence_verifications(id),
  add column if not exists pro_coupon text check (pro_coupon is null or pro_coupon = 'PRO20'),
  add column if not exists pro_discount_cents integer not null default 0 check (pro_discount_cents in (0,3960,4580)),
  add column if not exists pro_subtotal_cents integer check (pro_subtotal_cents in (19800,22900));

alter table public.idr_orders
  add column if not exists discount_applied text check (discount_applied is null or discount_applied = 'PRO20');
alter table public.idr_orders drop constraint if exists idr_orders_type_price_check;
alter table public.idr_orders add constraint idr_orders_type_price_check check (
  (discount_applied is null and (
    (type = 'standalone' and price_paid in (49.00,129.00)) or
    (type = 'addon' and price_paid in (31.00,99.00))
  )) or (type = 'addon' and price_paid = 24.80 and discount_applied is not null and discount_applied = 'PRO20')
);

create table public.pro_discount_refunds (
  ticket_submission_id uuid primary key references public.ticket_submissions(id) on delete restrict,
  checkout_intent_id uuid not null unique references public.idr_checkout_intents(id),
  verification_id uuid not null references public.pro_licence_verifications(id),
  stripe_payment_intent_id text not null unique,
  stripe_refund_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  discount_cents integer not null check (discount_cents in (3960,4580)),
  tax_cents integer not null check (tax_cents >= 0),
  status text not null default 'reserved'
    check (status in ('reserved','processing','pending','succeeded','needs_review')),
  attempt_started_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_cents = discount_cents + tax_cents)
);

alter table public.pro_licence_verifications enable row level security;
alter table public.pro_discount_refunds enable row level security;
revoke all on public.pro_licence_verifications, public.pro_discount_refunds from anon, authenticated;
grant select on public.pro_licence_verifications, public.pro_discount_refunds to authenticated;
grant all on public.pro_licence_verifications, public.pro_discount_refunds to service_role;
create policy pro_verification_staff_read on public.pro_licence_verifications
  for select to authenticated using (public.is_idr_staff());
create policy pro_refund_staff_read on public.pro_discount_refunds
  for select to authenticated using (public.is_idr_staff());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pro-licences','pro-licences',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy pro_licence_staff_storage_read on storage.objects
  for select to authenticated using (bucket_id = 'pro-licences' and public.is_idr_staff());

create function public.pro_identity_snapshot(p_submission public.ticket_submissions)
returns text language sql immutable set search_path = public as $$
  select md5(coalesce(p_submission.client_id::text,'') || '|' ||
    coalesce(p_submission.drivers_license,'') || '|' ||
    coalesce(p_submission.first_name,'') || '|' || coalesce(p_submission.last_name,'') || '|' ||
    coalesce(to_jsonb(p_submission)->>'preferred_locale','en'))
$$;

create function public.pro_is_officer(p_submission public.ticket_submissions)
returns boolean language sql immutable set search_path = public as $$
  select p_submission.service_type = 'representation'
    and coalesce(to_jsonb(p_submission)->>'ticket_type',to_jsonb(p_submission)->>'order_type','officer')
      in ('officer','officer_issued','rapid_resolution')
$$;

create function public.protect_pro_order_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    if (tg_op = 'INSERT' and (new.pro_verified or new.pro_verification_id is not null
      or new.discount_applied is not null or new.pro_discount_cents <> 0
      or new.declared_licence_class <> 'unknown'))
      or (tg_op = 'UPDATE' and (
        new.pro_verified is distinct from old.pro_verified or
        new.pro_verification_id is distinct from old.pro_verification_id or
        new.discount_applied is distinct from old.discount_applied or
        new.pro_discount_cents is distinct from old.pro_discount_cents or
        new.declared_licence_class is distinct from old.declared_licence_class
      )) then raise exception 'PRO_SERVER_ONLY'; end if;
  end if;
  if tg_op = 'UPDATE' and (
    public.pro_identity_snapshot(new) is distinct from public.pro_identity_snapshot(old)
    or not public.pro_is_officer(new)
    or new.declared_licence_class is distinct from old.declared_licence_class
  ) then
    new.pro_verified := false;
    new.pro_verification_id := null;
  end if;
  return new;
end $$;
create trigger protect_pro_order_fields before insert or update on public.ticket_submissions
  for each row execute function public.protect_pro_order_fields();

create function public.begin_pro_licence_verification(
  p_submission_id uuid, p_declared_class text, p_evidence_sha256 text, p_extension text,
  p_expected_identity jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ticket public.ticket_submissions%rowtype;
  current_verification public.pro_licence_verifications%rowtype;
  new_id uuid := gen_random_uuid();
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'PRO_SERVER_ONLY'; end if;
  select * into ticket from public.ticket_submissions where id = p_submission_id for update;
  if p_expected_identity is null or not found or
    ticket.client_id::text is distinct from p_expected_identity->>'client_id' or
    ticket.drivers_license is distinct from p_expected_identity->>'drivers_license' or
    ticket.first_name is distinct from p_expected_identity->>'first_name' or
    ticket.last_name is distinct from p_expected_identity->>'last_name' or
    ticket.representation_access_token_hash is distinct from p_expected_identity->>'representation_access_token_hash' or
    to_jsonb(ticket)->>'ticket_type' is distinct from p_expected_identity->>'ticket_type'
    then raise exception 'PRO_INTAKE_CHANGED'; end if;
  -- Hold the ticket lock while checking the saved language. An earlier HTTP
  -- read or a browser override cannot authorize unlaunched product terms.
  if coalesce(to_jsonb(ticket)->>'preferred_locale','en') <> 'en'
    then raise exception 'PRO_LOCALE_NOT_RELEASED'; end if;
  if not found or not public.pro_is_officer(ticket) or p_declared_class not in ('1','2','4')
    or p_evidence_sha256 !~ '^[0-9a-f]{64}$' or p_extension not in ('jpg','png','webp')
    then raise exception 'PRO_INVALID_VERIFICATION'; end if;
  if exists (select 1 from public.idr_checkout_intents where ticket_submission_id = ticket.id
    and checkout_kind in ('ticket_only','ticket_with_addon') and status in ('creating','open'))
    then raise exception 'PRO_CHECKOUT_OPEN'; end if;
  if ticket.status <> 'awaiting_payment' and not exists (
    select 1 from public.idr_checkout_intents where ticket_submission_id = ticket.id
    and checkout_kind in ('ticket_only','ticket_with_addon') and status = 'paid'
  ) then raise exception 'PRO_ORDER_UNAVAILABLE'; end if;
  if ticket.status = 'awaiting_payment' and ticket.declared_licence_class <> p_declared_class
    then raise exception 'PRO_DECLARATION_MISMATCH'; end if;
  select * into current_verification from public.pro_licence_verifications
    where id = ticket.pro_verification_id;
  if ticket.pro_verified and current_verification.status = 'verified'
    and current_verification.declared_class = p_declared_class
    and current_verification.identity_snapshot = public.pro_identity_snapshot(ticket)
    and current_verification.expires_on >= (now() at time zone 'America/Edmonton')::date
    then return to_jsonb(current_verification); end if;
  if exists (select 1 from public.pro_licence_verifications where ticket_submission_id = ticket.id
    and status = 'processing' and created_at > now() - interval '2 minutes')
    then raise exception 'PRO_VERIFICATION_BUSY'; end if;
  if (select count(*) from public.pro_licence_verifications where ticket_submission_id = ticket.id
    and created_at > now() - interval '1 day') >= 5
    then raise exception 'PRO_VERIFICATION_RATE_LIMIT'; end if;
  update public.ticket_submissions set declared_licence_class = p_declared_class,
    pro_verified = false, pro_verification_id = null where id = ticket.id;
  insert into public.pro_licence_verifications(id,ticket_submission_id,declared_class,
    identity_snapshot,evidence_path,evidence_sha256)
  values (new_id,ticket.id,p_declared_class,public.pro_identity_snapshot(ticket),
    ticket.id::text || '/' || new_id::text || '.' || p_extension,p_evidence_sha256)
  returning * into current_verification;
  update public.ticket_submissions set pro_verification_id = new_id where id = ticket.id;
  return to_jsonb(current_verification);
end $$;

create function public.finish_pro_licence_verification(
  p_id uuid, p_read_class text, p_jurisdiction text, p_identity_matches boolean,
  p_expires_on date, p_result_code text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  evidence public.pro_licence_verifications%rowtype;
  ticket public.ticket_submissions%rowtype;
  valid boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'PRO_SERVER_ONLY'; end if;
  -- Consistent lock order with checkout reservation: ticket, then evidence.
  select t.* into ticket from public.ticket_submissions t join public.pro_licence_verifications v
    on v.ticket_submission_id = t.id where v.id = p_id for update of t;
  if not found then raise exception 'PRO_VERIFICATION_MISSING'; end if;
  select * into evidence from public.pro_licence_verifications where id = p_id for update;
  if evidence.status <> 'processing' then return evidence.status = 'verified'; end if;
  valid := coalesce(p_result_code = 'verified' and p_read_class = evidence.declared_class
    and p_jurisdiction = 'AB' and p_identity_matches and p_expires_on >= (now() at time zone 'America/Edmonton')::date
    and ticket.pro_verification_id = evidence.id
    and ticket.declared_licence_class = evidence.declared_class
    and public.pro_identity_snapshot(ticket) = evidence.identity_snapshot
    and coalesce(to_jsonb(ticket)->>'preferred_locale','en') = 'en'
    and public.pro_is_officer(ticket), false);
  update public.pro_licence_verifications set read_class = p_read_class, jurisdiction = p_jurisdiction,
    identity_matches = coalesce(p_identity_matches,false), expires_on = p_expires_on,
    status = case when valid then 'verified' else 'unverified' end,
    result_code = left(p_result_code,60), completed_at = now() where id = p_id;
  update public.ticket_submissions set pro_verified = valid where id = ticket.id and pro_verification_id = p_id;
  return valid;
end $$;

create function public.protect_pro_checkout_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ticket public.ticket_submissions%rowtype;
  evidence public.pro_licence_verifications%rowtype;
  changed boolean;
  expected_subtotal integer;
begin
  changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    if (old.pro_subtotal_cents is not null or new.pro_subtotal_cents is not null) and (
      new.ticket_submission_id is distinct from old.ticket_submission_id or
      new.client_id is distinct from old.client_id
    ) then raise exception 'PRO_CHECKOUT_IDENTITY_IMMUTABLE'; end if;
    changed := new.pro_coupon is distinct from old.pro_coupon or
      new.pro_discount_cents is distinct from old.pro_discount_cents or
      new.pro_subtotal_cents is distinct from old.pro_subtotal_cents or
      new.pro_verification_id is distinct from old.pro_verification_id;
    if old.pro_subtotal_cents is not null or new.pro_subtotal_cents is not null then
      changed := changed or new.checkout_kind is distinct from old.checkout_kind or
        new.type is distinct from old.type or
        new.expected_amount_cents is distinct from old.expected_amount_cents;
    end if;
    if changed and (old.status = 'paid' or new.attempts <= old.attempts)
      then raise exception 'PRO_CHECKOUT_SNAPSHOT_IMMUTABLE'; end if;
  end if;
  if not changed then return new; end if;
  if new.pro_subtotal_cents is null then
    if new.pro_coupon is not null or new.pro_discount_cents <> 0 or new.pro_verification_id is not null
      then raise exception 'PRO_INVALID_PRICE_SNAPSHOT'; end if;
    return new;
  end if;
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'PRO_SERVER_ONLY'; end if;
  select * into ticket from public.ticket_submissions where id = new.ticket_submission_id for update;
  expected_subtotal := case new.checkout_kind when 'ticket_only' then 19800 when 'ticket_with_addon' then 22900 end;
  if not found or not public.pro_is_officer(ticket) or expected_subtotal is null
    or new.pro_subtotal_cents <> expected_subtotal
    or new.expected_amount_cents <> (case new.checkout_kind when 'ticket_only' then 19800 else 3100 end)
    then raise exception 'PRO_INVALID_PRICE_SNAPSHOT'; end if;
  if new.pro_coupon is null then
    if new.pro_discount_cents <> 0 or new.pro_verification_id is not null
      then raise exception 'PRO_INVALID_PRICE_SNAPSHOT'; end if;
  else
    if coalesce(to_jsonb(ticket)->>'preferred_locale','en') <> 'en'
      then raise exception 'PRO_LOCALE_NOT_RELEASED'; end if;
    select * into evidence from public.pro_licence_verifications where id = new.pro_verification_id;
    if not found or not ticket.pro_verified or ticket.pro_verification_id <> evidence.id
      or evidence.ticket_submission_id <> ticket.id or evidence.status <> 'verified'
      or evidence.declared_class <> ticket.declared_licence_class
      or evidence.identity_snapshot <> public.pro_identity_snapshot(ticket)
      or evidence.expires_on < (now() at time zone 'America/Edmonton')::date
      or new.pro_discount_cents <> expected_subtotal / 5
      then raise exception 'PRO_VERIFICATION_REQUIRED'; end if;
  end if;
  return new;
end $$;
create trigger protect_pro_checkout_snapshot before insert or update on public.idr_checkout_intents
  for each row execute function public.protect_pro_checkout_snapshot();

create function public.complete_pro_discount_refund(
  p_submission_id uuid, p_payment_intent_id text, p_refund_id text,
  p_amount_cents integer, p_status text
) returns text language plpgsql security definer set search_path = public as $$
declare
  adjustment public.pro_discount_refunds%rowtype;
  final_status text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'PRO_SERVER_ONLY'; end if;
  if p_status is null or p_status not in ('pending','succeeded','needs_review')
    or p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
    or p_refund_id is null or p_refund_id !~ '^re_[A-Za-z0-9_]+$'
    or p_amount_cents is null or p_amount_cents <= 0
    then raise exception 'PRO_REFUND_RESULT_INVALID'; end if;
  perform 1 from public.ticket_submissions where id = p_submission_id for update;
  select * into adjustment from public.pro_discount_refunds
    where ticket_submission_id = p_submission_id for update;
  if not found or adjustment.stripe_payment_intent_id <> p_payment_intent_id
    or adjustment.amount_cents <> p_amount_cents
    or (adjustment.stripe_refund_id is not null and adjustment.stripe_refund_id <> p_refund_id)
    then raise exception 'PRO_REFUND_RESULT_MISMATCH'; end if;
  -- Two workers may fetch different Stripe states before acquiring this lock.
  -- Pending can never overwrite success. Once a bound refund has failed, an
  -- older worker cannot clear its review hold or claim the money was received.
  -- A pre-creation review hold (no refund ID) may still reconcile a found refund.
  final_status := case
    when adjustment.status = 'needs_review' and adjustment.stripe_refund_id is not null then 'needs_review'
    when adjustment.status = 'succeeded' and p_status = 'pending' then 'succeeded'
    else p_status end;
  update public.pro_discount_refunds set stripe_refund_id = p_refund_id, status = final_status,
    last_error_code = case when final_status = 'needs_review' then 'stripe_refund_requires_review' else null end,
    updated_at = now() where ticket_submission_id = p_submission_id;
  if final_status = 'succeeded' then
    update public.ticket_submissions set discount_applied = 'PRO20',
      pro_discount_cents = adjustment.discount_cents where id = p_submission_id;
  elsif final_status = 'needs_review' and adjustment.status = 'succeeded' then
    update public.ticket_submissions set discount_applied = null, pro_discount_cents = 0
      where id = p_submission_id;
  end if;
  return final_status;
end $$;

revoke all on function public.begin_pro_licence_verification(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.finish_pro_licence_verification(uuid,text,text,boolean,date,text) from public, anon, authenticated;
grant execute on function public.begin_pro_licence_verification(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.finish_pro_licence_verification(uuid,text,text,boolean,date,text) to service_role;
revoke all on function public.complete_pro_discount_refund(uuid,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.complete_pro_discount_refund(uuid,text,text,integer,text) to service_role;
revoke all on function public.pro_identity_snapshot(public.ticket_submissions), public.pro_is_officer(public.ticket_submissions)
  from public, anon, authenticated;
grant execute on function public.pro_identity_snapshot(public.ticket_submissions), public.pro_is_officer(public.ticket_submissions)
  to service_role;

comment on table public.pro_discount_refunds is
  'Exactly one PRO20 adjustment per ticket. Uncertain Stripe results are reconciled before retry, never a second refund.';
comment on column public.idr_checkout_intents.pro_subtotal_cents is
  'Immutable pre-discount service subtotal for new officer sessions; NULL identifies legacy or unrelated products.';
commit;
