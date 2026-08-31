-- One-sided driver referrals. ticket_submissions is the representation order.
-- Every write below is service-only; the edge function authenticates portal and
-- staff callers. No function moves money or sends email.
begin;

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete restrict,
  client_id uuid unique references public.clients(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  check (user_id is not null or client_id is not null)
);

alter table public.ticket_submissions
  add column ref_code text references public.referral_codes(code) on delete restrict,
  add column referral_attributed_at timestamptz,
  add column referral_payment_intent_id text,
  add column referral_stripe_customer_id text,
  add column referral_payment_settled_at timestamptz,
  add column referral_payment_checked_at timestamptz,
  add column referral_refunded_at timestamptz,
  add column referral_disputed_at timestamptz,
  add column referral_accepted_at timestamptz,
  add column referral_rejected_at timestamptz,
  add column referral_scope_confirmed boolean,
  add column referral_fleet_account boolean,
  add column referral_identity_checked_at timestamptz,
  add column referral_plate text,
  add column referral_reviewed_by uuid references auth.users(id) on delete restrict,
  add column referral_review_notes text,
  add constraint ticket_referral_attribution_pair check (
    (ref_code is null) = (referral_attributed_at is null)
  ),
  add constraint ticket_referral_review_notes_length check (length(referral_review_notes) <= 2000),
  add constraint ticket_referral_plate_length check (length(referral_plate) <= 32),
  add constraint ticket_referral_payment_intent_shape check (
    referral_payment_intent_id is null or referral_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
  );

create unique index ticket_referral_payment_intent_unique
  on public.ticket_submissions(referral_payment_intent_id)
  where referral_payment_intent_id is not null;
create index ticket_referral_code_idx on public.ticket_submissions(ref_code)
  where ref_code is not null;

create table public.referral_payout_profiles (
  referrer_id uuid primary key references public.referral_codes(id) on delete restrict,
  legal_name text not null check (length(trim(legal_name)) between 2 and 160),
  address_line1 text not null check (length(trim(address_line1)) between 3 and 200),
  address_line2 text not null default '' check (length(address_line2) <= 200),
  city text not null check (length(trim(city)) between 2 and 100),
  province text not null check (province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT')),
  postal_code text not null check (postal_code ~ '^[A-Z][0-9][A-Z] [0-9][A-Z][0-9]$'),
  payout_email text not null check (length(payout_email) <= 254 and payout_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.referral_codes(id) on delete restrict,
  code text not null references public.referral_codes(code) on delete restrict,
  order_id uuid not null unique references public.ticket_submissions(id) on delete restrict,
  ticket_type text not null check (ticket_type in ('officer','camera')),
  amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','eligible','paid','void')),
  hold_reason text,
  eligible_at timestamptz,
  paid_at timestamptz,
  payout_reference text unique,
  paid_by uuid references auth.users(id) on delete restrict,
  refund_review_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((ticket_type = 'officer' and amount = 50) or (ticket_type = 'camera' and amount = 20)),
  check ((status = 'paid') = (paid_at is not null)),
  check ((paid_at is null) = (payout_reference is null)),
  check ((paid_at is null) = (paid_by is null))
);
create index referrals_referrer_created_idx on public.referrals(referrer_id, created_at desc, id desc);
create index referrals_due_idx on public.referrals(eligible_at) where status in ('pending','eligible');

-- Tax/contact details and immutable payout snapshots never have a browser table
-- grant. An owner's dashboard returns only their own profile and redacted ledger.
create table public.referral_payouts (
  referral_id uuid primary key references public.referrals(id) on delete restrict,
  referrer_id uuid not null references public.referral_codes(id) on delete restrict,
  amount numeric(10,2) not null check (amount in (20,50)),
  payout_reference text not null unique check (length(trim(payout_reference)) between 3 and 120),
  payout_email text not null,
  legal_name text,
  address_snapshot jsonb,
  paid_by uuid not null references auth.users(id) on delete restrict,
  paid_at timestamptz not null default now()
);
create index referral_payouts_calendar_idx on public.referral_payouts(referrer_id, paid_at);

-- A refund can arrive before its checkout webhook. Retain the hold by payment
-- intent, then apply it when the order is linked. Holds cannot be client-cleared.
create table public.referral_payment_holds (
  payment_intent_id text primary key check (payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  refunded_at timestamptz,
  disputed_at timestamptz,
  source_event_id text,
  created_at timestamptz not null default now(),
  check (refunded_at is not null or disputed_at is not null)
);

create table public.referral_audit_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.ticket_submissions(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  event text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Append-only identity hashes preserve OLD as well as NEW intake identities.
-- Hashing is data minimisation, not a substitute for RLS/private access.
create table public.referral_identity_keys (
  subject_type text not null check (subject_type in ('client','user','referrer')),
  subject_id uuid not null,
  identity_kind text not null check (identity_kind in ('email','phone','address','plate','stripe_customer')),
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key(subject_type, subject_id, identity_kind, identity_hash)
);
create index referral_identity_reverse_idx on public.referral_identity_keys(identity_kind,identity_hash);

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'referral_codes','referral_payout_profiles','referrals','referral_payouts',
    'referral_payment_holds','referral_audit_events','referral_identity_keys'
  ] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', relation_name);
    -- Even an ordinary edge table write cannot bypass the business RPCs. The
    -- SECURITY DEFINER functions below own all inserts/updates and audit writes.
    execute format('grant select on public.%I to service_role', relation_name);
  end loop;
end;
$$;

create function public.referral_identity_hash(p_kind text, p_value text)
returns text language plpgsql immutable set search_path = public
as $$
declare value text := lower(trim(coalesce(p_value,'')));
begin
  if p_kind in ('phone','address','plate') then
    value := regexp_replace(value, '[^a-z0-9]', '', 'g');
  end if;
  if p_kind = 'phone' then
    if length(value) = 11 and left(value,1) = '1' then value := substr(value,2); end if;
    if length(value) < 7 then return null; end if;
  end if;
  if value = '' then return null; end if;
  return encode(sha256(convert_to(p_kind || ':' || value,'UTF8')),'hex');
end;
$$;

create function public.referral_remember_identity(p_subject_type text, p_subject_id uuid, p_kind text, p_value text)
returns void language plpgsql security definer set search_path = public
as $$
declare fingerprint text := public.referral_identity_hash(p_kind,p_value);
begin
  if fingerprint is null then return; end if;
  insert into public.referral_identity_keys(subject_type,subject_id,identity_kind,identity_hash)
  values(p_subject_type,p_subject_id,p_kind,fingerprint) on conflict do nothing;
end;
$$;

create function public.referral_snapshot_client_identity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare client_row public.clients%rowtype;
begin
  for client_row in select (new).* union all select (old).* where tg_op = 'UPDATE' loop
    perform public.referral_remember_identity('client',client_row.id,'email',client_row.email);
    perform public.referral_remember_identity('client',client_row.id,'phone',client_row.phone);
    if nullif(trim(client_row.address),'') is not null then
      perform public.referral_remember_identity('client',client_row.id,'address',
        concat_ws(' ',client_row.address,client_row.city,client_row.postal_code));
    end if;
  end loop;
  return new;
end;
$$;
create trigger referral_remember_client_identities after insert or update of email,phone,address,city,postal_code
  on public.clients for each row execute function public.referral_snapshot_client_identity();

create function public.referral_snapshot_user_identity()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.email_confirmed_at is not null then
      perform public.referral_remember_identity('user',old.id,'email',old.email);
    end if;
    if old.phone_confirmed_at is not null then
      perform public.referral_remember_identity('user',old.id,'phone',old.phone);
    end if;
  end if;
  if new.email_confirmed_at is not null then
    perform public.referral_remember_identity('user',new.id,'email',new.email);
  end if;
  if new.phone_confirmed_at is not null then
    perform public.referral_remember_identity('user',new.id,'phone',new.phone);
  end if;
  return new;
end;
$$;
create trigger referral_remember_user_identities after insert or update of email,phone,email_confirmed_at,phone_confirmed_at
  on auth.users for each row execute function public.referral_snapshot_user_identity();

create function public.referral_protect_order_fields()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.role() = 'service_role' or current_user in ('postgres','supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    if new.ref_code is not null or new.referral_payment_intent_id is not null or
       new.referral_accepted_at is not null or new.referral_scope_confirmed is not null or
       new.referral_fleet_account is not null or new.referral_identity_checked_at is not null or
       new.referral_payment_settled_at is not null or new.referral_payment_checked_at is not null or
       new.referral_stripe_customer_id is not null or new.referral_refunded_at is not null or
       new.referral_disputed_at is not null or new.referral_rejected_at is not null or
       new.referral_plate is not null or new.referral_reviewed_by is not null or new.referral_review_notes is not null then
      raise exception 'Referral state is server controlled' using errcode = '42501';
    end if;
  elsif (to_jsonb(new) - array['updated_at']) is distinct from (to_jsonb(old) - array['updated_at']) then
    if exists (
      select 1 from jsonb_each(to_jsonb(new)) n
      where (n.key = 'ref_code' or n.key like 'referral_%')
        and n.value is distinct from (to_jsonb(old)->n.key)
    ) then
      raise exception 'Referral state is server controlled' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger referral_protect_order_fields before insert or update on public.ticket_submissions
  for each row execute function public.referral_protect_order_fields();

-- Snapshot existing client and verified portal identities without changing them.
do $$
declare c record; u record;
begin
  for c in select id,email,phone,address,city,postal_code from public.clients loop
    perform public.referral_remember_identity('client',c.id,'email',c.email);
    perform public.referral_remember_identity('client',c.id,'phone',c.phone);
    if nullif(trim(c.address),'') is not null then
      perform public.referral_remember_identity('client',c.id,'address',concat_ws(' ',c.address,c.city,c.postal_code));
    end if;
  end loop;
  for u in select id,email,phone,email_confirmed_at,phone_confirmed_at from auth.users loop
    if u.email_confirmed_at is not null then perform public.referral_remember_identity('user',u.id,'email',u.email); end if;
    if u.phone_confirmed_at is not null then perform public.referral_remember_identity('user',u.id,'phone',u.phone); end if;
  end loop;
end;
$$;

create function public.ensure_referral_code(p_user_id uuid)
returns public.referral_codes language plpgsql security definer set search_path = public
as $$
declare result public.referral_codes%rowtype; purchaser public.clients%rowtype; caller auth.users%rowtype;
begin
  select * into caller from auth.users where id = p_user_id and email_confirmed_at is not null;
  if not found then raise exception 'A verified portal account is required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,4128));
  perform pg_advisory_xact_lock(hashtextextended('referral-email:' || lower(trim(caller.email)),4128));
  select * into result from public.referral_codes where user_id = p_user_id;
  if found then return result; end if;
  -- Intake can legitimately have several client rows for the same purchase
  -- email. Claim an existing outcome-issued code before choosing a client row,
  -- so an older report purchase cannot hide that person's referral history.
  select r.* into result from public.referral_codes r join public.clients c on c.id = r.client_id
    where c.auth_user_id = p_user_id or
      (c.auth_user_id is null and lower(trim(c.email)) = lower(trim(caller.email)))
    order by r.created_at,r.id limit 1 for update of r;
  if found then
    if result.user_id is not null and result.user_id <> p_user_id then
      raise exception 'This client referral code is already linked' using errcode = '42501';
    end if;
    update public.referral_codes set user_id = p_user_id where id = result.id returning * into result;
    return result;
  end if;
  select * into purchaser from public.clients c
    where c.auth_user_id = p_user_id or
      (c.auth_user_id is null and lower(trim(c.email)) = lower(trim(caller.email)))
    order by c.created_at,c.id limit 1;
  if purchaser.id is not null then
    select * into result from public.referral_codes where client_id = purchaser.id for update;
    if found then
      if result.user_id is not null and result.user_id <> p_user_id then
        raise exception 'This client referral code is already linked' using errcode = '42501';
      end if;
      update public.referral_codes set user_id = p_user_id where id = result.id returning * into result;
      return result;
    end if;
  end if;
  insert into public.referral_codes(user_id,client_id,code)
    values(p_user_id,purchaser.id,upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)))
    returning * into result;
  return result;
end;
$$;

create function public.ensure_client_referral_code(p_client_id uuid)
returns public.referral_codes language plpgsql security definer set search_path = public
as $$
declare result public.referral_codes%rowtype; purchaser public.clients%rowtype;
begin
  select * into purchaser from public.clients where id = p_client_id;
  if not found or not exists (
    select 1 from public.idr_checkout_intents i where i.client_id = p_client_id
      and i.status = 'paid' and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
  ) then raise exception 'A paid representation client is required' using errcode = '42501'; end if;
  if purchaser.auth_user_id is not null then return public.ensure_referral_code(purchaser.auth_user_id); end if;
  perform pg_advisory_xact_lock(hashtextextended('referral-email:' || lower(trim(purchaser.email)),4128));
  select r.* into result from public.referral_codes r join public.clients c on c.id = r.client_id
    where c.id = p_client_id or lower(trim(c.email)) = lower(trim(purchaser.email))
    order by r.created_at,r.id limit 1;
  if found then return result; end if;
  insert into public.referral_codes(client_id,code)
    values(p_client_id,upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))) returning * into result;
  return result;
end;
$$;

create function public.referral_identity_match(p_referrer_id uuid,p_order_id uuid)
returns text language sql stable security definer set search_path = public
as $$
  with owner as (select * from public.referral_codes where id = p_referrer_id),
  owner_emails as (
    select k.identity_hash from public.referral_identity_keys k, owner o
    where k.identity_kind = 'email' and (
      (k.subject_type = 'client' and k.subject_id = o.client_id) or
      (k.subject_type = 'user' and k.subject_id = o.user_id)
    )
  ),
  owner_clients as (
    select c.id from public.clients c, owner o where c.id = o.client_id or c.auth_user_id = o.user_id
    union
    select k.subject_id from public.referral_identity_keys k
      where k.subject_type = 'client' and k.identity_kind = 'email'
        and k.identity_hash in (select identity_hash from owner_emails)
  ),
  owner_keys as (
    select k.identity_kind,k.identity_hash from public.referral_identity_keys k,owner o
    where (k.subject_type = 'client' and k.subject_id in (select id from owner_clients)) or
      (k.subject_type = 'user' and k.subject_id = o.user_id) or
      (k.subject_type = 'referrer' and k.subject_id = o.id)
  )
  select k.identity_kind from public.referral_identity_keys k
    join public.ticket_submissions t on k.subject_type = 'client' and k.subject_id = t.client_id
    join owner_keys o on o.identity_kind = k.identity_kind and o.identity_hash = k.identity_hash
    where t.id = p_order_id limit 1;
$$;

create function public.referral_recalculate(p_order_id uuid)
returns public.referrals language plpgsql security definer set search_path = public
as $$
declare t public.ticket_submissions%rowtype; r public.referrals%rowtype; owner public.referral_codes%rowtype;
  reason text; next_type text; due timestamptz; profile_missing boolean;
begin
  select * into t from public.ticket_submissions where id = p_order_id for update;
  select * into r from public.referrals where order_id = p_order_id for update;
  if r.id is null then return null; end if;
  select * into owner from public.referral_codes where id = r.referrer_id;
  next_type := case coalesce(to_jsonb(t)->>'ticket_type','officer_issued')
    when 'officer_issued' then 'officer' when 'officer' then 'officer'
    when 'photo_radar' then 'camera' else null end;
  if t.referral_refunded_at is not null then reason := 'refund';
  elsif t.referral_disputed_at is not null then reason := 'payment_dispute';
  elsif owner.disabled_at is not null then reason := 'code_disabled';
  elsif t.service_type <> 'representation' or next_type is null then reason := 'unsupported_product';
  elsif public.referral_identity_match(r.referrer_id,t.id) is not null then reason := 'self_referral';
  elsif t.referral_rejected_at is not null then reason := 'out_of_scope';
  elsif t.referral_fleet_account is true then reason := 'fleet_account';
  end if;
  if r.status = 'paid' then
    if reason is not null or next_type is distinct from r.ticket_type then
      update public.referrals set refund_review_required = true,
        hold_reason = coalesce(reason,'classification_changed'),updated_at = now() where id = r.id returning * into r;
    end if;
    return r;
  end if;
  if t.referral_payment_settled_at is not null and t.referral_accepted_at is not null then
    due := greatest(t.referral_payment_settled_at,t.referral_accepted_at) + interval '7 days';
  end if;
  if reason is not null then
    update public.referrals set status = 'void',hold_reason = reason,eligible_at = due,updated_at = now()
      where id = r.id returning * into r;
    return r;
  end if;
  profile_missing := exists(select 1 from public.referral_payouts where referrer_id = r.referrer_id)
    and not exists(select 1 from public.referral_payout_profiles where referrer_id = r.referrer_id);
  reason := case
    when t.referral_accepted_at is null or t.referral_scope_confirmed is not true then 'awaiting_acceptance'
    when t.referral_fleet_account is null then 'awaiting_fleet_review'
    when t.referral_identity_checked_at is null then 'awaiting_identity_review'
    when t.referral_payment_intent_id is null then 'awaiting_payment'
    when t.referral_payment_settled_at is null then 'awaiting_settlement'
    when due > now() then 'seven_day_wait'
    when profile_missing then 'payout_profile_required'
    else null end;
  update public.referrals set
    ticket_type = next_type,amount = case next_type when 'camera' then 20 else 50 end,
    status = case when reason is null or reason = 'payout_profile_required' then 'eligible' else 'pending' end,
    eligible_at = due,hold_reason = reason,updated_at = now()
    where id = r.id returning * into r;
  return r;
end;
$$;

create function public.attach_referral_to_order(p_order_id uuid,p_code text,p_attributed_at timestamptz)
returns boolean language plpgsql security definer set search_path = public
as $$
declare t public.ticket_submissions%rowtype; owner public.referral_codes%rowtype; kind text;
begin
  if p_attributed_at is null or p_attributed_at < now() - interval '30 days' or
    p_attributed_at > now() + interval '5 seconds' then return false; end if;
  select * into owner from public.referral_codes where code = p_code and disabled_at is null;
  if not found or p_attributed_at < owner.created_at - interval '5 seconds' then return false; end if;
  select * into t from public.ticket_submissions where id = p_order_id for update;
  if not found or t.service_type <> 'representation' then return false; end if;
  -- Freeze attribution once payment starts being recorded; no post-purchase capture.
  if t.referral_payment_intent_id is not null or t.status <> 'awaiting_payment' then
    return t.ref_code = p_code;
  end if;
  if t.referral_attributed_at is not null and t.referral_attributed_at > p_attributed_at then return false; end if;
  kind := case coalesce(to_jsonb(t)->>'ticket_type','officer_issued')
    when 'officer_issued' then 'officer' when 'officer' then 'officer' when 'photo_radar' then 'camera' else null end;
  if kind is null then return false; end if;
  update public.ticket_submissions set ref_code = p_code,referral_attributed_at = p_attributed_at where id = p_order_id;
  insert into public.referrals(referrer_id,code,order_id,ticket_type,amount)
    values(owner.id,owner.code,t.id,kind,case kind when 'camera' then 20 else 50 end)
    on conflict(order_id) do update set referrer_id = excluded.referrer_id,code = excluded.code,updated_at = now()
    where referrals.status in ('pending','eligible','void') and referrals.paid_at is null;
  perform public.referral_recalculate(p_order_id);
  return true;
end;
$$;

create function public.referral_record_checkout_payment(p_order_id uuid,p_payment_intent_id text,p_stripe_customer_id text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare t public.ticket_submissions%rowtype; hold public.referral_payment_holds%rowtype;
begin
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' then raise exception 'Invalid payment reference'; end if;
  if p_stripe_customer_id is not null and p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Invalid customer reference'; end if;
  perform pg_advisory_xact_lock(hashtextextended('referral-payment:' || p_payment_intent_id,4219));
  select * into t from public.ticket_submissions where id = p_order_id for update;
  if not found or t.service_type <> 'representation' or not exists (
    select 1 from public.idr_checkout_intents i where i.ticket_submission_id = t.id and i.client_id = t.client_id
      and i.status = 'paid' and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
  ) then raise exception 'The representation checkout is not confirmed paid'; end if;
  if t.referral_payment_intent_id is not null and t.referral_payment_intent_id <> p_payment_intent_id then
    raise exception 'The order already has a different payment';
  end if;
  if t.referral_stripe_customer_id is not null and p_stripe_customer_id is not null and
     t.referral_stripe_customer_id <> p_stripe_customer_id then raise exception 'The order customer cannot change'; end if;
  select * into hold from public.referral_payment_holds where payment_intent_id = p_payment_intent_id;
  update public.ticket_submissions set referral_payment_intent_id = p_payment_intent_id,
    referral_stripe_customer_id = coalesce(referral_stripe_customer_id,p_stripe_customer_id),
    referral_refunded_at = coalesce(referral_refunded_at,hold.refunded_at),
    referral_disputed_at = coalesce(referral_disputed_at,hold.disputed_at) where id = p_order_id;
  perform public.referral_remember_identity('client',t.client_id,'stripe_customer',p_stripe_customer_id);
  perform public.referral_recalculate(p_order_id);
end;
$$;

create function public.referral_record_payment_hold(p_payment_intent_id text,p_refunded_at timestamptz default null,
  p_disputed_at timestamptz default null,p_source_event_id text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare t record;
begin
  if (p_refunded_at is null and p_disputed_at is null) or p_refunded_at > now() + interval '5 seconds'
     or p_disputed_at > now() + interval '5 seconds' then raise exception 'Invalid payment hold'; end if;
  -- Serialise with checkout linkage: a hold and first linkage arriving together
  -- must not each miss the other's uncommitted row and leave an unheld order.
  perform pg_advisory_xact_lock(hashtextextended('referral-payment:' || p_payment_intent_id,4219));
  insert into public.referral_payment_holds(payment_intent_id,refunded_at,disputed_at,source_event_id)
    values(p_payment_intent_id,p_refunded_at,p_disputed_at,left(p_source_event_id,160))
    on conflict(payment_intent_id) do update set
      refunded_at = coalesce(referral_payment_holds.refunded_at,excluded.refunded_at),
      disputed_at = coalesce(referral_payment_holds.disputed_at,excluded.disputed_at);
  for t in select id from public.ticket_submissions where referral_payment_intent_id = p_payment_intent_id loop
    update public.ticket_submissions set referral_refunded_at = coalesce(referral_refunded_at,p_refunded_at),
      referral_disputed_at = coalesce(referral_disputed_at,p_disputed_at) where id = t.id;
    perform public.referral_recalculate(t.id);
  end loop;
end;
$$;

create function public.referral_record_payment_check(p_order_id uuid,p_payment_intent_id text,
  p_settled_at timestamptz,p_stripe_customer_id text default null)
returns public.referrals language plpgsql security definer set search_path = public
as $$
declare t public.ticket_submissions%rowtype;
begin
  select * into t from public.ticket_submissions where id = p_order_id for update;
  if not found or p_payment_intent_id is null or t.referral_payment_intent_id is null or t.referral_payment_intent_id <> p_payment_intent_id then
    raise exception 'Payment check does not match the stored order'; end if;
  if p_settled_at > now() + interval '5 seconds' then raise exception 'Future settlement is not available'; end if;
  if t.referral_stripe_customer_id is not null and p_stripe_customer_id is distinct from t.referral_stripe_customer_id then
    raise exception 'Payment customer does not match the stored order'; end if;
  update public.ticket_submissions set referral_payment_settled_at = p_settled_at,
    referral_payment_checked_at = now(),referral_stripe_customer_id = p_stripe_customer_id where id = t.id;
  perform public.referral_remember_identity('client',t.client_id,'stripe_customer',p_stripe_customer_id);
  return public.referral_recalculate(t.id);
end;
$$;

create function public.referral_review_order(p_actor_id uuid,p_order_id uuid,p_decision text,
  p_alberta_in_scope boolean,p_fleet_account boolean,p_identity_reviewed boolean,p_plate text default null,p_notes text default null)
returns public.referrals language plpgsql security definer set search_path = public
as $$
declare t public.ticket_submissions%rowtype;
begin
  if not (public.has_role(p_actor_id,'admin') or public.has_role(p_actor_id,'case_manager')) then
    raise exception 'Staff access required' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('accepted','rejected') or p_fleet_account is null or p_alberta_in_scope is null or
    p_identity_reviewed is null or (p_decision = 'accepted' and not p_alberta_in_scope) then
    raise exception 'Confirm Alberta scope, fleet status and identity review'; end if;
  select * into t from public.ticket_submissions where id = p_order_id for update;
  if not found or not exists(select 1 from public.referrals where order_id = p_order_id) then raise exception 'Referral order not found'; end if;
  update public.ticket_submissions set
    referral_scope_confirmed = p_alberta_in_scope,referral_fleet_account = p_fleet_account,
    referral_accepted_at = case when p_decision = 'accepted' then coalesce(referral_accepted_at,now()) else null end,
    referral_rejected_at = case when p_decision = 'rejected' then now() else null end,
    referral_identity_checked_at = case when p_identity_reviewed then now() else null end,
    referral_plate = coalesce(nullif(upper(trim(p_plate)),''),referral_plate),
    referral_reviewed_by = p_actor_id,referral_review_notes = nullif(trim(p_notes),'') where id = p_order_id;
  perform public.referral_remember_identity('client',t.client_id,'plate',p_plate);
  insert into public.referral_audit_events(order_id,actor_id,event,details) values(p_order_id,p_actor_id,'scope_review',
    jsonb_build_object('decision',p_decision,'alberta_in_scope',p_alberta_in_scope,'fleet_account',p_fleet_account,
      'identity_reviewed',p_identity_reviewed,'notes',p_notes));
  return public.referral_recalculate(p_order_id);
end;
$$;

create function public.referral_save_profile(p_user_id uuid,p_legal_name text,p_address_line1 text,p_address_line2 text,
  p_city text,p_province text,p_postal_code text,p_payout_email text)
returns void language plpgsql security definer set search_path = public
as $$
declare owner public.referral_codes%rowtype;
begin
  owner := public.ensure_referral_code(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(owner.id::text,9173));
  insert into public.referral_payout_profiles(referrer_id,legal_name,address_line1,address_line2,city,province,postal_code,payout_email)
    values(owner.id,trim(p_legal_name),trim(p_address_line1),trim(coalesce(p_address_line2,'')),trim(p_city),upper(trim(p_province)),
      upper(trim(p_postal_code)),lower(trim(p_payout_email)))
    on conflict(referrer_id) do update set legal_name = excluded.legal_name,address_line1 = excluded.address_line1,
      address_line2 = excluded.address_line2,city = excluded.city,province = excluded.province,
      postal_code = excluded.postal_code,payout_email = excluded.payout_email,updated_at = now();
  perform public.referral_remember_identity('referrer',owner.id,'address',
    concat_ws(' ',trim(p_address_line1),nullif(trim(p_address_line2),''),trim(p_city),trim(p_postal_code)));
  perform public.referral_remember_identity('referrer',owner.id,'email',p_payout_email);
end;
$$;

create function public.referral_mark_paid(p_actor_id uuid,p_referral_id uuid,p_payout_reference text)
returns public.referrals language plpgsql security definer set search_path = public
as $$
declare r public.referrals%rowtype; t public.ticket_submissions%rowtype; owner public.referral_codes%rowtype;
  profile public.referral_payout_profiles%rowtype; payment_email text; paid_count integer;
begin
  if not public.has_role(p_actor_id,'admin') then raise exception 'Admin access required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_payout_reference,''))) not between 3 and 120 then raise exception 'Enter the completed Interac transfer reference'; end if;
  select * into r from public.referrals where id = p_referral_id;
  if not found then raise exception 'Referral not found'; end if;
  -- Serialise all payouts for this person, including different referred orders,
  -- so two concurrent first-payout requests cannot skip the second-payout rule.
  perform pg_advisory_xact_lock(hashtextextended(r.referrer_id::text,9173));
  select * into t from public.ticket_submissions where id = r.order_id for update;
  select * into r from public.referrals where id = p_referral_id for update;
  if r.status = 'paid' then
    if r.payout_reference = trim(p_payout_reference) then return r; end if;
    raise exception 'This referral already has a recorded payout';
  end if;
  r := public.referral_recalculate(r.order_id);
  if r.status <> 'eligible' or r.eligible_at is null or r.eligible_at > now() or r.hold_reason is not null then
    raise exception 'Referral is not ready for payout: %',coalesce(r.hold_reason,r.status); end if;
  if t.referral_payment_checked_at is null or t.referral_payment_checked_at < now() - interval '60 seconds' then
    raise exception 'Refresh Stripe settlement and refund status before recording the payout'; end if;
  select * into owner from public.referral_codes where id = r.referrer_id for update;
  select * into profile from public.referral_payout_profiles where referrer_id = r.referrer_id;
  select count(*) into paid_count from public.referral_payouts where referrer_id = r.referrer_id;
  if paid_count >= 1 and profile.referrer_id is null then raise exception 'Legal name and address are required before a second payout'; end if;
  payment_email := coalesce(profile.payout_email,
    (select email from auth.users where id = owner.user_id and email_confirmed_at is not null),
    (select email from public.clients where id = owner.client_id));
  if nullif(trim(payment_email),'') is null then raise exception 'The referrer needs a payout email'; end if;
  insert into public.referral_payouts(referral_id,referrer_id,amount,payout_reference,payout_email,legal_name,address_snapshot,paid_by)
    values(r.id,r.referrer_id,r.amount,trim(p_payout_reference),payment_email,profile.legal_name,
      case when profile.referrer_id is not null then jsonb_build_object('address_line1',profile.address_line1,
        'address_line2',profile.address_line2,'city',profile.city,'province',profile.province,'postal_code',profile.postal_code) else null end,p_actor_id);
  update public.referrals set status = 'paid',paid_at = now(),paid_by = p_actor_id,
    payout_reference = trim(p_payout_reference),updated_at = now() where id = r.id returning * into r;
  insert into public.referral_audit_events(order_id,actor_id,event,details) values(r.order_id,p_actor_id,'interac_recorded',
    jsonb_build_object('referral_id',r.id,'amount',r.amount,'payout_reference',r.payout_reference));
  return r;
end;
$$;

create function public.referral_recalculate_many(p_order_ids uuid[])
returns setof public.referrals language plpgsql security definer set search_path = public
as $$
declare order_id uuid; result public.referrals%rowtype;
begin
  if coalesce(array_length(p_order_ids,1),0) > 100 then raise exception 'Refresh at most 100 referrals'; end if;
  -- A fixed order prevents two dashboard refresh batches deadlocking each other.
  for order_id in select distinct unnest(p_order_ids) order by 1 loop
    result := public.referral_recalculate(order_id);
    if result.id is not null then return next result; end if;
  end loop;
end;
$$;

create function public.referral_record_declared_plate(p_order_id uuid,p_plate text)
returns void language plpgsql security definer set search_path = public
as $$
declare t public.ticket_submissions%rowtype;
begin
  if p_plate is null or p_plate !~ '^[A-Z0-9]{1,20}$' then raise exception 'Invalid declared plate'; end if;
  select * into t from public.ticket_submissions where id = p_order_id;
  if not found or t.service_type <> 'representation' then raise exception 'Representation order not found'; end if;
  perform public.referral_remember_identity('client',t.client_id,'plate',p_plate);
  perform public.referral_recalculate(t.id);
end;
$$;

create function public.referral_payee_details(p_referrer_ids uuid[])
returns table(referrer_id uuid,legal_name text,payout_email text,address_line1 text,address_line2 text,
  city text,province text,postal_code text,is_past_client boolean,paid_count bigint,year_to_date_paid numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if coalesce(array_length(p_referrer_ids,1),0) > 100 then raise exception 'Read at most 100 payees'; end if;
  return query
    select o.id,p.legal_name,coalesce(p.payout_email,u.email,c.email),p.address_line1,p.address_line2,p.city,p.province,p.postal_code,
      exists(select 1 from public.clients pc join public.idr_checkout_intents i on i.client_id = pc.id
        where (pc.id = o.client_id or pc.auth_user_id = o.user_id) and i.status = 'paid'
          and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')),
      (select count(*) from public.referral_payouts payout where payout.referrer_id = o.id),
      coalesce((select sum(payout.amount) from public.referral_payouts payout where payout.referrer_id = o.id
        and payout.paid_at >= (date_trunc('year',now() at time zone 'America/Edmonton') at time zone 'America/Edmonton')
        and payout.paid_at < ((date_trunc('year',now() at time zone 'America/Edmonton') + interval '1 year') at time zone 'America/Edmonton')),0)
    from public.referral_codes o
      left join public.referral_payout_profiles p on p.referrer_id = o.id
      left join auth.users u on u.id = o.user_id and u.email_confirmed_at is not null
      left join public.clients c on c.id = o.client_id
    where o.id = any(p_referrer_ids);
end;
$$;

-- Default PostgreSQL function EXECUTE includes PUBLIC, so explicitly close every
-- new function. Only authenticated edge code with the service key can call RPCs.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'referral_%' or p.proname in ('ensure_referral_code','ensure_client_referral_code','attach_referral_to_order'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;

comment on table public.referrals is 'One reward per paid, accepted representation file; officer $50 CAD, camera $20 CAD. Never pays a referee.';
comment on column public.ticket_submissions.referral_fleet_account is 'Staff-reviewed account pricing/fleet exclusion; null is unreviewed, never a client assertion.';
comment on column public.ticket_submissions.referral_payment_settled_at is 'Stripe balance_transaction.available_on, only when balance status is available; checkout completion is not settlement.';
comment on table public.referral_payouts is 'Records prior manual Interac transfers; does not send money. Private tax snapshots retained for reporting review.';

commit;
