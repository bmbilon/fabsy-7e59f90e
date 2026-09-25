-- Ontario Landlord and Tenant Board (LTB) intake pipeline.
--
-- Fabsy is the software vendor here. Each practice (tenant) owns its clients,
-- cases and documents; rows are scoped by practice_id and readable only by
-- that practice's members and Fabsy admins. Anonymous visitors never touch
-- these tables directly: the ltb-intake edge function writes with the service
-- role through the functions below.
--
-- Mirrors the Fabsy ticket pipeline: provisional client -> case -> private
-- document upload -> background extraction -> staff review queue + alert
-- outbox -> staff-managed funnel stages.
begin;

-- ---------------------------------------------------------------------------
-- Practices and membership
-- ---------------------------------------------------------------------------
create table public.ltb_practices (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (char_length(name) between 1 and 200),
  licensee_name text not null check (char_length(licensee_name) between 1 and 120),
  lso_licence text check (lso_licence is null or char_length(lso_licence) <= 20),
  alert_emails text[] not null default '{}'
    check (cardinality(alert_emails) <= 5),
  admin_base_url text not null default 'https://fabsy.ca'
    check (admin_base_url ~ '^https://[a-z0-9.-]+$'),
  created_at timestamptz not null default now()
);

insert into public.ltb_practices (id, name, licensee_name, alert_emails)
values ('anderhue-paralegal', 'AnderHue Paralegal Professional Corporation', 'Don Anderson',
        array['info@onlineparalegals.ca', 'brett@execom.ca'])
on conflict (id) do nothing;

create table public.ltb_practice_members (
  practice_id text not null references public.ltb_practices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('licensee', 'clerk')),
  created_at timestamptz not null default now(),
  primary key (practice_id, user_id)
);

-- Fabsy admins support every practice; practice members see only their own.
create function public.ltb_can_access(p_practice_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.ltb_practice_members m
      where m.practice_id = p_practice_id and m.user_id = auth.uid()
    )
  );
$$;

-- Practices the signed-in user can open, with their role there.
create function public.ltb_my_practices()
returns table (practice_id text, practice_name text, member_role text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.name,
    coalesce(m.role, case when public.has_role(auth.uid(), 'admin') then 'fabsy_admin' end)
  from public.ltb_practices p
  left join public.ltb_practice_members m on m.practice_id = p.id and m.user_id = auth.uid()
  where auth.uid() is not null
    and (m.user_id is not null or public.has_role(auth.uid(), 'admin'))
  order by p.name;
$$;

-- ---------------------------------------------------------------------------
-- Clients: the "register with us" record. Identification fields follow the
-- LSO client identification requirements (name, address, phone, occupation;
-- for organizations the business name, number and the person instructing).
-- ---------------------------------------------------------------------------
create table public.ltb_clients (
  id uuid primary key default gen_random_uuid(),
  practice_id text not null references public.ltb_practices(id),
  client_type text not null default 'individual' check (client_type in ('individual', 'organization')),
  first_name text check (char_length(first_name) <= 100),
  last_name text check (char_length(last_name) <= 100),
  organization_name text check (char_length(organization_name) <= 200),
  business_number text check (char_length(business_number) <= 40),
  contact_title text check (char_length(contact_title) <= 100),
  email text not null check (
    email = lower(email) and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text check (char_length(phone) <= 40),
  mailing_address text check (char_length(mailing_address) <= 300),
  city text check (char_length(city) <= 100),
  province text check (char_length(province) <= 50),
  postal_code text check (char_length(postal_code) <= 12),
  occupation text check (char_length(occupation) <= 120),
  registration_status text not null default 'provisional'
    check (registration_status in ('provisional', 'registered', 'verified')),
  registered_at timestamptz,
  registered_by uuid references auth.users(id) on delete set null,
  identity_verified_at timestamptz,
  identity_verified_by uuid references auth.users(id) on delete set null,
  identity_document_type text check (char_length(identity_document_type) <= 60),
  field_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(field_sources) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, email)
);

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------
create sequence public.ltb_case_number_seq;

create table public.ltb_cases (
  id uuid primary key default gen_random_uuid(),
  practice_id text not null references public.ltb_practices(id),
  client_id uuid not null references public.ltb_clients(id),
  case_number text not null unique default (
    'LTB-' || to_char(now() at time zone 'America/Toronto', 'YYYY') || '-'
    || lpad(nextval('public.ltb_case_number_seq')::text, 4, '0')),
  stage text not null default 'new_intake' check (stage in (
    'new_intake', 'under_review', 'quoted', 'retained', 'notice_served',
    'filed', 'hearing_scheduled', 'order_issued', 'closed', 'declined')),
  stage_changed_at timestamptz not null default now(),
  issue text not null default 'other' check (issue in (
    'arrears', 'persistent_late', 'n12_own_use', 'n5_damage', 'n5_conduct',
    'hearing_scheduled', 'other')),
  notice_served text not null default 'unsure' check (notice_served in ('no', 'yes', 'unsure')),
  rental_unit_address text check (char_length(rental_unit_address) <= 300),
  unit_city text check (char_length(unit_city) <= 100),
  tenant_names text[] not null default '{}' check (cardinality(tenant_names) <= 10),
  rent_amount_cents integer check (rent_amount_cents >= 0),
  rent_period text check (rent_period in ('monthly', 'weekly', 'daily', 'yearly')),
  rent_due_day smallint check (rent_due_day between 1 and 31),
  lease_start_date date,
  arrears_claimed_cents integer check (arrears_claimed_cents >= 0),
  arrears_reported_text text check (char_length(arrears_reported_text) <= 40),
  notice_form text check (notice_form in ('N4', 'N5', 'N7', 'N8', 'N12', 'N13', 'other')),
  notice_served_on date,
  notice_service_method text check (notice_service_method in (
    'hand', 'mailbox', 'mail', 'courier', 'email', 'other')),
  notice_termination_date date,
  hearing_date date,
  intake_review_status text not null default 'pending_scan' check (intake_review_status in (
    'pending_scan', 'scanning', 'needs_review', 'ready')),
  intake_scan_started_at timestamptz,
  review_notes text check (char_length(review_notes) <= 4000),
  client_notes text check (char_length(client_notes) <= 2000),
  field_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(field_sources) = 'object'),
  returning_client boolean not null default false,
  intake_token_hash text check (intake_token_hash ~ '^[0-9a-f]{64}$'),
  intake_finalized_at timestamptz,
  source text not null default 'ltb-landing' check (source in ('ltb-landing', 'staff', 'smoke-test')),
  user_agent text check (char_length(user_agent) <= 400),
  outcome text check (outcome in (
    'order_obtained', 'settled', 'tenant_paid', 'withdrawn', 'dismissed', 'declined', 'other')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ltb_cases_practice_stage_idx on public.ltb_cases (practice_id, stage, created_at desc);
create index ltb_cases_client_idx on public.ltb_cases (client_id);
create index ltb_cases_scan_idx on public.ltb_cases (intake_review_status, intake_scan_started_at)
  where intake_review_status in ('pending_scan', 'scanning');

-- ---------------------------------------------------------------------------
-- Documents (private bucket ltb-documents, path {case_id}/{document_id}.{ext})
-- ---------------------------------------------------------------------------
create table public.ltb_case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.ltb_cases(id) on delete cascade,
  practice_id text not null references public.ltb_practices(id),
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp|heic|heif)$'),
  original_name text check (char_length(original_name) <= 200),
  content_type text not null check (content_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_at timestamptz,
  kind text check (kind in ('lease', 'rent_ledger', 'notice', 'government_id', 'ltb_document', 'other')),
  extraction_status text not null default 'awaiting_upload' check (extraction_status in (
    'awaiting_upload', 'pending', 'extracted', 'skipped', 'failed')),
  extracted jsonb check (extracted is null or jsonb_typeof(extracted) = 'object'),
  extracted_at timestamptz,
  created_at timestamptz not null default now()
);
create index ltb_case_documents_case_idx on public.ltb_case_documents (case_id, created_at);

-- ---------------------------------------------------------------------------
-- Append-only case event log
-- ---------------------------------------------------------------------------
create table public.ltb_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.ltb_cases(id) on delete cascade,
  practice_id text not null references public.ltb_practices(id),
  actor_id uuid references auth.users(id) on delete set null,
  event text not null check (event ~ '^[a-z_]{3,60}$'),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  at timestamptz not null default now()
);
create index ltb_case_events_case_idx on public.ltb_case_events (case_id, at desc);

-- ---------------------------------------------------------------------------
-- Staff alert outbox (same claim / freeze / finish contract as
-- ticket_upload_alerts). One alert per case, sent once intake review status
-- is known.
-- ---------------------------------------------------------------------------
create table public.ltb_intake_alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.ltb_cases(id) on delete cascade,
  case_snapshot jsonb not null check (jsonb_typeof(case_snapshot) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'retry', 'sent', 'failed', 'indeterminate')),
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
  check (status <> 'sending' or (claim_id is not null and claim_expires_at is not null)),
  check (status <> 'sent' or (provider_email_id is not null and sent_at is not null))
);
create index ltb_intake_alerts_pending_idx on public.ltb_intake_alerts (next_attempt_at, created_at)
  where status in ('pending', 'retry', 'sending');

-- ---------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------
create function public.ltb_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger ltb_clients_touch before update on public.ltb_clients
  for each row execute function public.ltb_touch_updated_at();
create trigger ltb_cases_touch before update on public.ltb_cases
  for each row execute function public.ltb_touch_updated_at();

-- Staff edits through RLS are logged with the changed field names only.
-- Stage changes are logged separately by ltb_set_case_stage.
create function public.ltb_log_case_edit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  changed text[];
begin
  if auth.uid() is null then
    return new;
  end if;
  select coalesce(array_agg(n.key order by n.key), '{}') into changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('updated_at', 'stage', 'stage_changed_at', 'outcome', 'closed_at', 'field_sources');
  if cardinality(changed) > 0 then
    insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
    values (new.id, new.practice_id, auth.uid(), 'case_updated', jsonb_build_object('fields', to_jsonb(changed)));
  end if;
  return new;
end $$;
create trigger ltb_cases_log_edit after update on public.ltb_cases
  for each row execute function public.ltb_log_case_edit();

-- Client edits are logged against every open case of that client.
create function public.ltb_log_client_edit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  changed text[];
begin
  if auth.uid() is null then
    return new;
  end if;
  select coalesce(array_agg(n.key order by n.key), '{}') into changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('updated_at', 'field_sources', 'registration_status', 'registered_at',
      'registered_by', 'identity_verified_at', 'identity_verified_by', 'identity_document_type');
  if cardinality(changed) > 0 then
    insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
    select c.id, c.practice_id, auth.uid(), 'client_updated', jsonb_build_object('fields', to_jsonb(changed))
    from public.ltb_cases c where c.client_id = new.id;
  end if;
  return new;
end $$;
create trigger ltb_clients_log_edit after update on public.ltb_clients
  for each row execute function public.ltb_log_client_edit();

-- ---------------------------------------------------------------------------
-- Alert enqueue: fires once the intake review status is first known.
-- ---------------------------------------------------------------------------
create function public.ltb_case_snapshot(p_case_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'caseId', c.id, 'caseNumber', c.case_number, 'practiceId', c.practice_id,
    'practiceName', p.name, 'adminBaseUrl', p.admin_base_url,
    'recipients', to_jsonb(p.alert_emails),
    'clientName', nullif(trim(coalesce(cl.first_name, '') || ' ' || coalesce(cl.last_name, '')), ''),
    'organizationName', cl.organization_name,
    'email', cl.email, 'phone', cl.phone,
    'registrationStatus', cl.registration_status, 'returningClient', c.returning_client,
    'issue', c.issue, 'noticeServed', c.notice_served,
    'unitCity', c.unit_city, 'rentalUnitAddress', c.rental_unit_address,
    'tenantNames', to_jsonb(c.tenant_names),
    'rentAmountCents', c.rent_amount_cents, 'rentPeriod', c.rent_period,
    'arrearsClaimedCents', c.arrears_claimed_cents, 'arrearsReportedText', c.arrears_reported_text,
    'noticeForm', c.notice_form, 'noticeServedOn', c.notice_served_on,
    'noticeTerminationDate', c.notice_termination_date,
    'reviewStatus', c.intake_review_status, 'reviewNotes', c.review_notes,
    'documentCount', (select count(*) from public.ltb_case_documents d
                      where d.case_id = c.id and d.uploaded_at is not null),
    'createdAt', c.created_at)
  from public.ltb_cases c
  join public.ltb_clients cl on cl.id = c.client_id
  join public.ltb_practices p on p.id = c.practice_id
  where c.id = p_case_id;
$$;

create function public.ltb_queue_intake_alert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source <> 'smoke-test'
     and new.intake_review_status in ('ready', 'needs_review')
     and (tg_op = 'INSERT' or old.intake_review_status in ('pending_scan', 'scanning')) then
    insert into public.ltb_intake_alerts (case_id, case_snapshot)
    values (new.id, public.ltb_case_snapshot(new.id))
    on conflict (case_id) do nothing;
  end if;
  return new;
end $$;
create trigger ltb_queue_intake_alert
  after insert or update of intake_review_status on public.ltb_cases
  for each row execute function public.ltb_queue_intake_alert();

-- ---------------------------------------------------------------------------
-- Intake functions (service role only; called by the ltb-intake function)
-- ---------------------------------------------------------------------------

-- Creates or reuses the client and opens a case. A registered client's record
-- is never overwritten by an unauthenticated form: differences are left as
-- review notes for staff. A provisional client only gains empty fields.
create function public.ltb_register_intake(
  p_practice_id text, p_intake jsonb, p_token_hash text, p_documents jsonb default '[]'::jsonb
) returns table (case_id uuid, client_id uuid, case_number text, returning_client boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email text := lower(trim(coalesce(p_intake->>'email', '')));
  v_first text := nullif(left(trim(coalesce(p_intake->>'firstName', '')), 100), '');
  v_last text := nullif(left(trim(coalesce(p_intake->>'lastName', '')), 100), '');
  v_phone text := nullif(left(trim(coalesce(p_intake->>'phone', '')), 40), '');
  v_client public.ltb_clients%rowtype;
  v_case public.ltb_cases%rowtype;
  v_returning boolean := false;
  v_notes text[] := '{}';
  v_doc jsonb;
  v_has_docs boolean := jsonb_typeof(p_documents) = 'array' and jsonb_array_length(p_documents) > 0;
begin
  if not exists (select 1 from public.ltb_practices where id = p_practice_id) then
    raise exception 'LTB_PRACTICE_UNKNOWN';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'LTB_TOKEN_INVALID';
  end if;
  if jsonb_typeof(p_documents) is distinct from 'array' or jsonb_array_length(p_documents) > 6 then
    raise exception 'LTB_DOCUMENTS_INVALID';
  end if;

  select * into v_client from public.ltb_clients
    where practice_id = p_practice_id and email = v_email for update;
  if found then
    v_returning := v_client.registration_status <> 'provisional';
    if v_returning then
      if v_first is not null and lower(coalesce(v_client.first_name, '') || ' ' || coalesce(v_client.last_name, ''))
         <> lower(coalesce(v_first, '') || ' ' || coalesce(v_last, '')) then
        v_notes := v_notes || format('Returning client. Name entered on the form (%s %s) differs from the registered record.',
          v_first, coalesce(v_last, ''));
      end if;
      if v_phone is not null and coalesce(v_client.phone, '') <> v_phone then
        v_notes := v_notes || format('Returning client. Phone entered on the form (%s) differs from the registered record.', v_phone);
      end if;
    else
      update public.ltb_clients set
        first_name = coalesce(first_name, v_first),
        last_name = coalesce(last_name, v_last),
        phone = coalesce(phone, v_phone),
        city = coalesce(city, nullif(left(trim(coalesce(p_intake->>'city', '')), 100), ''))
      where id = v_client.id
      returning * into v_client;
    end if;
  else
    insert into public.ltb_clients (practice_id, email, first_name, last_name, phone, city, field_sources)
    values (p_practice_id, v_email, v_first, v_last, v_phone,
      nullif(left(trim(coalesce(p_intake->>'city', '')), 100), ''),
      jsonb_strip_nulls(jsonb_build_object(
        'first_name', case when v_first is not null then jsonb_build_object('source', 'form') end,
        'last_name', case when v_last is not null then jsonb_build_object('source', 'form') end,
        'phone', case when v_phone is not null then jsonb_build_object('source', 'form') end,
        'email', jsonb_build_object('source', 'form'))))
    returning * into v_client;
  end if;

  if not v_has_docs then
    v_notes := v_notes || 'No documents uploaded. Ask for the lease, rent ledger and any notice already served.'::text;
  end if;

  insert into public.ltb_cases (
    practice_id, client_id, issue, notice_served, unit_city, arrears_reported_text,
    client_notes, intake_token_hash, returning_client, source, user_agent,
    intake_review_status, intake_finalized_at, review_notes, field_sources)
  values (
    p_practice_id, v_client.id,
    coalesce(nullif(p_intake->>'issue', ''), 'other'),
    coalesce(nullif(p_intake->>'noticeServed', ''), 'unsure'),
    nullif(left(trim(coalesce(p_intake->>'city', '')), 100), ''),
    nullif(left(trim(coalesce(p_intake->>'owed', '')), 40), ''),
    nullif(left(trim(coalesce(p_intake->>'notes', '')), 2000), ''),
    p_token_hash, v_returning,
    coalesce(nullif(p_intake->>'source', ''), 'ltb-landing'),
    nullif(left(coalesce(p_intake->>'userAgent', ''), 400), ''),
    case when v_has_docs then 'pending_scan' else 'needs_review' end,
    case when v_has_docs then null else now() end,
    nullif(array_to_string(v_notes, E'\n'), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'unit_city', case when nullif(trim(coalesce(p_intake->>'city', '')), '') is not null
                   then jsonb_build_object('source', 'form') end)))
  returning * into v_case;

  for v_doc in select * from jsonb_array_elements(p_documents) loop
    insert into public.ltb_case_documents (id, case_id, practice_id, storage_path, original_name, content_type, size_bytes)
    values (
      (v_doc->>'id')::uuid, v_case.id, p_practice_id,
      v_case.id::text || '/' || (v_doc->>'id') || '.' || (v_doc->>'extension'),
      nullif(left(coalesce(v_doc->>'name', ''), 200), ''),
      v_doc->>'contentType', (v_doc->>'size')::integer);
  end loop;

  insert into public.ltb_case_events (case_id, practice_id, event, detail)
  values (v_case.id, p_practice_id, 'intake_received', jsonb_build_object(
    'returningClient', v_returning, 'documents', jsonb_array_length(p_documents), 'source', v_case.source));

  return query select v_case.id, v_client.id, v_case.case_number, v_returning;
end $$;

-- Marks confirmed uploads. Returns the case review status afterwards.
create function public.ltb_finalize_intake(p_case_id uuid, p_token_hash text, p_uploaded uuid[])
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.ltb_cases%rowtype;
  v_uploaded integer;
begin
  select * into v_case from public.ltb_cases where id = p_case_id for update;
  if not found or v_case.intake_token_hash is distinct from p_token_hash then
    raise exception 'LTB_INTAKE_UNAUTHORIZED';
  end if;
  if v_case.intake_finalized_at is not null then
    return v_case.intake_review_status;
  end if;

  update public.ltb_case_documents
    set uploaded_at = coalesce(uploaded_at, now()), extraction_status = 'pending'
    where case_id = p_case_id and id = any(coalesce(p_uploaded, '{}'))
      and extraction_status = 'awaiting_upload';
  select count(*) into v_uploaded from public.ltb_case_documents
    where case_id = p_case_id and uploaded_at is not null;

  if v_uploaded = 0 then
    update public.ltb_cases set
      intake_finalized_at = now(),
      intake_review_status = 'needs_review',
      review_notes = concat_ws(E'\n', review_notes,
        'The client chose documents but none finished uploading. Ask them to email the lease and rent ledger.')
    where id = p_case_id
    returning * into v_case;
  else
    update public.ltb_cases set intake_finalized_at = now() where id = p_case_id returning * into v_case;
  end if;

  insert into public.ltb_case_events (case_id, practice_id, event, detail)
  values (p_case_id, v_case.practice_id, 'documents_uploaded', jsonb_build_object('count', v_uploaded));
  return v_case.intake_review_status;
end $$;

-- Claims a finalized intake for background extraction.
create function public.ltb_claim_intake_scan(p_case_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  affected integer;
begin
  update public.ltb_cases
    set intake_review_status = 'scanning', intake_scan_started_at = now()
    where id = p_case_id and intake_review_status = 'pending_scan' and intake_finalized_at is not null;
  get diagnostics affected = row_count;
  return affected = 1;
end $$;

-- Interrupted scans and abandoned uploads become explicit staff tasks, which
-- also releases their alert.
create function public.ltb_sweep_stalled_intakes()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n1 integer;
  n2 integer;
begin
  update public.ltb_cases set
    intake_review_status = 'needs_review',
    review_notes = concat_ws(E'\n', review_notes,
      'Automatic document reading did not finish. Review the uploaded documents directly.')
  where intake_review_status = 'scanning' and intake_scan_started_at < now() - interval '3 minutes';
  get diagnostics n1 = row_count;

  update public.ltb_cases set
    intake_finalized_at = coalesce(intake_finalized_at, now()),
    intake_review_status = 'needs_review',
    review_notes = concat_ws(E'\n', review_notes,
      'The client started uploading documents but did not finish. Follow up for the lease and rent ledger.')
  where intake_review_status = 'pending_scan' and intake_finalized_at is null
    and created_at < now() - interval '15 minutes';
  get diagnostics n2 = row_count;
  return n1 + n2;
end $$;

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------
create function public.ltb_set_case_stage(
  p_case_id uuid, p_stage text, p_outcome text default null, p_note text default null
) returns public.ltb_cases
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.ltb_cases%rowtype;
begin
  select * into v_case from public.ltb_cases where id = p_case_id for update;
  if not found or not public.ltb_can_access(v_case.practice_id) then
    raise exception 'LTB_CASE_NOT_FOUND';
  end if;
  if p_stage not in ('new_intake', 'under_review', 'quoted', 'retained', 'notice_served',
                     'filed', 'hearing_scheduled', 'order_issued', 'closed', 'declined') then
    raise exception 'LTB_STAGE_INVALID';
  end if;
  if p_stage = 'closed' and p_outcome is null then
    raise exception 'LTB_OUTCOME_REQUIRED';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'LTB_NOTE_TOO_LONG';
  end if;
  if v_case.stage = p_stage and v_case.outcome is not distinct from coalesce(p_outcome, v_case.outcome) then
    return v_case;
  end if;

  update public.ltb_cases set
    stage = p_stage,
    stage_changed_at = now(),
    outcome = case when p_stage = 'closed' then p_outcome
                   when p_stage = 'declined' then 'declined'
                   else null end,
    closed_at = case when p_stage in ('closed', 'declined') then coalesce(closed_at, now()) else null end
  where id = p_case_id
  returning * into v_case;

  insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
  values (p_case_id, v_case.practice_id, auth.uid(), 'stage_changed',
    jsonb_strip_nulls(jsonb_build_object('stage', p_stage, 'outcome', v_case.outcome, 'note', p_note)));
  return v_case;
end $$;

create function public.ltb_set_client_registration(
  p_client_id uuid, p_status text, p_identity_document_type text default null
) returns public.ltb_clients
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client public.ltb_clients%rowtype;
begin
  select * into v_client from public.ltb_clients where id = p_client_id for update;
  if not found or not public.ltb_can_access(v_client.practice_id) then
    raise exception 'LTB_CLIENT_NOT_FOUND';
  end if;
  if p_status not in ('provisional', 'registered', 'verified') then
    raise exception 'LTB_REGISTRATION_STATUS_INVALID';
  end if;
  if p_status in ('registered', 'verified') and (
      coalesce(v_client.first_name, '') = '' and coalesce(v_client.organization_name, '') = ''
      or coalesce(v_client.mailing_address, '') = '' or coalesce(v_client.phone, '') = '') then
    raise exception 'LTB_REGISTRATION_INCOMPLETE';
  end if;
  if p_status = 'verified' and coalesce(p_identity_document_type, v_client.identity_document_type, '') = '' then
    raise exception 'LTB_IDENTITY_DOCUMENT_REQUIRED';
  end if;

  update public.ltb_clients set
    registration_status = p_status,
    registered_at = case when p_status = 'provisional' then null else coalesce(registered_at, now()) end,
    registered_by = case when p_status = 'provisional' then null else coalesce(registered_by, auth.uid()) end,
    identity_verified_at = case when p_status = 'verified' then coalesce(identity_verified_at, now()) else null end,
    identity_verified_by = case when p_status = 'verified' then coalesce(identity_verified_by, auth.uid()) else null end,
    identity_document_type = case when p_status = 'verified'
      then left(coalesce(p_identity_document_type, identity_document_type), 60) else identity_document_type end
  where id = p_client_id
  returning * into v_client;

  insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
  select c.id, c.practice_id, auth.uid(), 'client_registration_changed', jsonb_build_object('status', p_status)
  from public.ltb_cases c where c.client_id = p_client_id;
  return v_client;
end $$;

-- ---------------------------------------------------------------------------
-- Alert outbox functions (service role only)
-- ---------------------------------------------------------------------------
create function public.claim_ltb_intake_alerts(p_limit integer default 10)
returns setof public.ltb_intake_alerts
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'LTB_ALERT_LIMIT_INVALID';
  end if;
  update public.ltb_intake_alerts
    set status = 'indeterminate', failure_code = 'idempotency_window_elapsed',
        claim_id = null, claim_expires_at = null
    where status in ('retry', 'sending') and first_attempt_at <= clock_timestamp() - interval '23 hours'
      and (status <> 'sending' or claim_expires_at <= clock_timestamp());
  return query
  with candidates as (
    select id from public.ltb_intake_alerts
    where ((status in ('pending', 'retry') and next_attempt_at <= clock_timestamp())
      or (status = 'sending' and claim_expires_at <= clock_timestamp()))
      and (first_attempt_at is null or first_attempt_at > clock_timestamp() - interval '23 hours')
    order by created_at, id limit p_limit for update skip locked
  )
  update public.ltb_intake_alerts a
    set status = 'sending', claim_id = gen_random_uuid(),
        claim_expires_at = clock_timestamp() + interval '3 minutes',
        first_attempt_at = coalesce(first_attempt_at, clock_timestamp()),
        attempt_count = attempt_count + 1, failure_code = null
    from candidates c where a.id = c.id returning a.*;
end $$;

create function public.freeze_ltb_intake_alert_email(p_id uuid, p_claim_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  frozen jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or
     jsonb_typeof(p_payload->'to') is distinct from 'array' or
     jsonb_array_length(p_payload->'to') not between 1 and 5 or
     coalesce(p_payload->>'html', '') = '' or coalesce(p_payload->>'subject', '') = '' then
    raise exception 'LTB_ALERT_PAYLOAD_INVALID';
  end if;
  update public.ltb_intake_alerts
    set email_payload = coalesce(email_payload, p_payload)
    where id = p_id and claim_id = p_claim_id and status = 'sending'
      and claim_expires_at > clock_timestamp()
    returning email_payload into frozen;
  if not found then
    raise exception 'LTB_ALERT_CLAIM_LOST';
  end if;
  return frozen;
end $$;

create function public.finish_ltb_intake_alert(
  p_id uuid, p_claim_id uuid, p_status text,
  p_provider_email_id text default null, p_failure_code text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  affected integer;
begin
  if p_status not in ('sent', 'retry', 'failed') or
     (p_status = 'sent' and (coalesce(p_provider_email_id, '') = '' or p_failure_code is not null)) or
     (p_status <> 'sent' and coalesce(p_failure_code, '') !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'LTB_ALERT_OUTCOME_INVALID';
  end if;
  update public.ltb_intake_alerts
    set status = p_status, provider_email_id = p_provider_email_id,
        sent_at = case when p_status = 'sent' then clock_timestamp() else null end,
        failure_code = p_failure_code,
        next_attempt_at = clock_timestamp()
          + make_interval(secs => least(3600, 30 * power(2, least(attempt_count, 7)))::integer),
        claim_id = null, claim_expires_at = null
    where id = p_id and claim_id = p_claim_id and status = 'sending';
  get diagnostics affected = row_count;
  return affected = 1;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------
alter table public.ltb_practices enable row level security;
alter table public.ltb_practice_members enable row level security;
alter table public.ltb_clients enable row level security;
alter table public.ltb_cases enable row level security;
alter table public.ltb_case_documents enable row level security;
alter table public.ltb_case_events enable row level security;
alter table public.ltb_intake_alerts enable row level security;
alter table public.ltb_intake_alerts force row level security;

revoke all on public.ltb_practices, public.ltb_practice_members, public.ltb_clients,
  public.ltb_cases, public.ltb_case_documents, public.ltb_case_events, public.ltb_intake_alerts
  from public, anon, authenticated;
revoke all on sequence public.ltb_case_number_seq from public, anon, authenticated;

grant select on public.ltb_practices, public.ltb_practice_members, public.ltb_case_documents,
  public.ltb_case_events to authenticated;
grant select on public.ltb_clients, public.ltb_cases to authenticated;
-- Staff may correct extracted facts; identity status changes go through
-- ltb_set_client_registration and stage changes through ltb_set_case_stage.
grant update (client_type, first_name, last_name, organization_name, business_number, contact_title,
  phone, mailing_address, city, province, postal_code, occupation, field_sources)
  on public.ltb_clients to authenticated;
grant update (issue, notice_served, rental_unit_address, unit_city, tenant_names, rent_amount_cents,
  rent_period, rent_due_day, lease_start_date, arrears_claimed_cents, notice_form, notice_served_on,
  notice_service_method, notice_termination_date, hearing_date, review_notes, field_sources,
  intake_review_status)
  on public.ltb_cases to authenticated;

grant all on public.ltb_practices, public.ltb_practice_members, public.ltb_clients, public.ltb_cases,
  public.ltb_case_documents, public.ltb_case_events, public.ltb_intake_alerts to service_role;
grant usage, select on sequence public.ltb_case_number_seq to service_role;

create policy "LTB members read their practice" on public.ltb_practices
  for select to authenticated using (public.ltb_can_access(id));
create policy "LTB members read practice membership" on public.ltb_practice_members
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "LTB members read clients" on public.ltb_clients
  for select to authenticated using (public.ltb_can_access(practice_id));
create policy "LTB members correct clients" on public.ltb_clients
  for update to authenticated using (public.ltb_can_access(practice_id))
  with check (public.ltb_can_access(practice_id));
create policy "LTB members read cases" on public.ltb_cases
  for select to authenticated using (public.ltb_can_access(practice_id));
create policy "LTB members correct cases" on public.ltb_cases
  for update to authenticated using (public.ltb_can_access(practice_id))
  with check (public.ltb_can_access(practice_id) and intake_review_status in ('needs_review', 'ready'));
create policy "LTB members read documents" on public.ltb_case_documents
  for select to authenticated using (public.ltb_can_access(practice_id));
create policy "LTB members read case events" on public.ltb_case_events
  for select to authenticated using (public.ltb_can_access(practice_id));

revoke all on function public.ltb_can_access(text) from public, anon;
grant execute on function public.ltb_can_access(text) to authenticated, service_role;
revoke all on function public.ltb_my_practices() from public, anon;
grant execute on function public.ltb_my_practices() to authenticated;
revoke all on function public.ltb_set_case_stage(uuid, text, text, text) from public, anon;
grant execute on function public.ltb_set_case_stage(uuid, text, text, text) to authenticated;
revoke all on function public.ltb_set_client_registration(uuid, text, text) from public, anon;
grant execute on function public.ltb_set_client_registration(uuid, text, text) to authenticated;

revoke all on function public.ltb_case_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.ltb_register_intake(text, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.ltb_finalize_intake(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.ltb_claim_intake_scan(uuid) from public, anon, authenticated;
revoke all on function public.ltb_sweep_stalled_intakes() from public, anon, authenticated;
revoke all on function public.claim_ltb_intake_alerts(integer) from public, anon, authenticated;
revoke all on function public.freeze_ltb_intake_alert_email(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_ltb_intake_alert(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.ltb_touch_updated_at() from public, anon, authenticated;
revoke all on function public.ltb_log_case_edit() from public, anon, authenticated;
revoke all on function public.ltb_log_client_edit() from public, anon, authenticated;
revoke all on function public.ltb_queue_intake_alert() from public, anon, authenticated;
grant execute on function public.ltb_case_snapshot(uuid) to service_role;
grant execute on function public.ltb_register_intake(text, jsonb, text, jsonb) to service_role;
grant execute on function public.ltb_finalize_intake(uuid, text, uuid[]) to service_role;
grant execute on function public.ltb_claim_intake_scan(uuid) to service_role;
grant execute on function public.ltb_sweep_stalled_intakes() to service_role;
grant execute on function public.claim_ltb_intake_alerts(integer) to service_role;
grant execute on function public.freeze_ltb_intake_alert_email(uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_ltb_intake_alert(uuid, uuid, text, text, text) to service_role;

comment on table public.ltb_clients is
  'LTB practice clients. Practice data processed by Fabsy as software vendor; not Fabsy Alberta clients.';
comment on table public.ltb_intake_alerts is
  'Private per-case staff email outbox for the owning practice. Snapshot holds contact and intake summary only; no documents.';

-- ---------------------------------------------------------------------------
-- Private document storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ltb-documents', 'ltb-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "LTB members read case documents" on storage.objects;
create policy "LTB members read case documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ltb-documents' and exists (
      select 1 from public.ltb_case_documents d
      where d.storage_path = storage.objects.name and public.ltb_can_access(d.practice_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Alert worker schedule (same private scheduler credential as other workers)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron')
    and exists(select 1 from pg_extension where extname = 'pg_net')
    and exists(select 1 from pg_namespace where nspname = 'vault') then
    if exists(select 1 from vault.secrets where name = 'idr_project_url')
      and exists(select 1 from vault.secrets where name = 'idr_cron_secret') then
      perform cron.schedule('fabsy-ltb-intake-alerts', '* * * * *', $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'idr_project_url') || '/functions/v1/process-ltb-intake-alerts',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'idr_cron_secret')),
          body := '{}'::jsonb, timeout_milliseconds := 150000
        );
      $job$);
    end if;
  end if;
end $$;

commit;
