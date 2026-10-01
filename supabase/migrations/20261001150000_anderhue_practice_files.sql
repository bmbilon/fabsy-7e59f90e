-- AnderHue practice files: traffic tickets and other matters beside the LTB
-- pipeline, one client portal across all three practice areas, and one email
-- outbox for client updates and staff alerts.
--
-- Build contract: ontario/anderhue-paralegal-site/ARCHITECTURE.md, section 3.
-- Stages, outcomes and client copy live in
-- supabase/functions/_shared/practice-catalog.ts. The SQL keeps its own copy of
-- every value list (CHECK constraints and the practice_stages,
-- practice_notify_stages and practice_outcomes helpers). The marker lines
-- below are compared with the catalog by scripts/test-practice-files.mjs and
-- scripts/sql-harness/catalog-markers.mjs, and with the SQL behaviour by
-- supabase/tests/practice-files.test.sql. Change all three together.
--
-- catalog:stages:ltb=new_intake,under_review,quoted,retained,notice_served,filed,hearing_scheduled,order_issued,closed,declined
-- catalog:stages:traffic=new_intake,under_review,quoted,retained,option_filed,disclosure_requested,resolution_meeting,offer_received,trial_scheduled,closed,declined
-- catalog:stages:general=new_intake,under_review,quoted,retained,in_progress,closed,declined
-- catalog:notify:ltb=under_review,quoted,retained,notice_served,filed,hearing_scheduled,order_issued,closed,declined
-- catalog:notify:traffic=under_review,quoted,retained,option_filed,disclosure_requested,resolution_meeting,offer_received,trial_scheduled,closed,declined
-- catalog:notify:general=under_review,quoted,retained,in_progress,closed,declined
-- catalog:outcomes:traffic=withdrawn,amended,not_guilty,convicted,client_paid,other
-- catalog:outcomes:general=resolved,settled,judgment,withdrawn,referred_out,other
--
-- Fabsy is the software vendor only. AnderHue Paralegal owns the clients,
-- files and documents. Every row is scoped by practice_id and readable only by
-- that practice's members (and Fabsy admins) through ltb_can_access. Anonymous
-- visitors never touch these tables: the practice-intake and practice-portal
-- edge functions call the service-role functions below, and client uploads go
-- through service-role signed upload URLs. Staff write only through the staff
-- functions, a few granted columns and storage uploads to registered paths.
--
-- Client emails are queued only while ltb_practices.client_updates_enabled is
-- on (the go-live switch) and never for smoke tests. Staff alerts are always
-- queued when the practice has alert recipients.
begin;

-- ---------------------------------------------------------------------------
-- Practice settings (client-facing identity and the client email switch)
-- ---------------------------------------------------------------------------
alter table public.ltb_practices
  add column display_name text check (char_length(display_name) between 1 and 120),
  add column site_url text not null default 'https://anderhue.ca'
    check (site_url ~ '^https://[a-z0-9.-]+$'),
  add column public_email text check (
    public_email = lower(public_email) and char_length(public_email) <= 254
    and public_email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'),
  add column phone text check (char_length(phone) between 1 and 40),
  -- Senders are "Display Name <address>" or a bare address, with no control
  -- characters (a stored value can never inject an email header) and no
  -- characters that would need quoting in an unquoted display name.
  add column client_email_from text check (char_length(client_email_from) <= 200 and client_email_from ~
    '^([^<>",;:[:cntrl:]]{1,120} )?<[^<>@[:space:][:cntrl:]]+@[^<>@[:space:][:cntrl:]]+\.[^<>@[:space:][:cntrl:]]+>$|^[^<>@[:space:][:cntrl:]]+@[^<>@[:space:][:cntrl:]]+\.[^<>@[:space:][:cntrl:]]+$'),
  add column client_reply_to text check (
    client_reply_to = lower(client_reply_to) and char_length(client_reply_to) <= 254
    and client_reply_to ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'),
  -- Staff alert sender; null means the Fabsy Case Desk default.
  add column notice_from text check (char_length(notice_from) <= 200 and notice_from ~
    '^([^<>",;:[:cntrl:]]{1,120} )?<[^<>@[:space:][:cntrl:]]+@[^<>@[:space:][:cntrl:]]+\.[^<>@[:space:][:cntrl:]]+>$|^[^<>@[:space:][:cntrl:]]+@[^<>@[:space:][:cntrl:]]+\.[^<>@[:space:][:cntrl:]]+$'),
  -- Go-live switch: while false no client notice is queued at all.
  add column client_updates_enabled boolean not null default false;

-- Client emails cannot be switched on before the practice has a sender and a
-- reply-to address (the notice worker would otherwise fail every send).
alter table public.ltb_practices add constraint ltb_practices_client_sender_check
  check (not client_updates_enabled or (client_email_from is not null and client_reply_to is not null));

update public.ltb_practices set
  display_name = 'AnderHue Paralegal',
  site_url = 'https://anderhue.ca',
  public_email = 'hello@anderhue.ca',
  phone = '(289) 985-0166',
  client_email_from = 'AnderHue Paralegal <files@anderhue.ca>',
  client_reply_to = 'hello@anderhue.ca',
  notice_from = null,
  client_updates_enabled = false,
  admin_base_url = 'https://anderhue.ca'
where id = 'anderhue-paralegal';

-- Portal links issued before this instant are rejected by practice-portal.
-- The (id, practice_id) key lets practice files prove their client belongs to
-- the same practice.
alter table public.ltb_clients
  add column portal_revoked_before timestamptz,
  add constraint ltb_clients_id_practice_key unique (id, practice_id);

-- Client portal state on landlord files (same columns as practice_matters).
-- portal_visible: a public intake for a client who already has a file stays
-- out of the client portal (and sends no receipt) until staff take it forward,
-- so a stranger cannot plant files in someone else's portal.
alter table public.ltb_cases
  add column client_request_message text check (char_length(client_request_message) between 1 and 1000),
  add column client_request_at timestamptz,
  add column client_uploaded_at timestamptz,
  add column portal_visible boolean not null default true,
  add constraint ltb_cases_client_request_check
    check ((client_request_message is null) = (client_request_at is null));

-- A landlord file's client must belong to the same practice. The composite key
-- replaces the original client_id key (it implies it) under the same name, so
-- PostgREST still sees exactly one ltb_cases -> ltb_clients relationship and
-- existing ltb_clients(...) embeds keep working. Added NOT VALID and then
-- validated, the usual pattern for checking existing rows.
alter table public.ltb_cases drop constraint ltb_cases_client_id_fkey;
alter table public.ltb_cases add constraint ltb_cases_client_id_fkey foreign key (client_id, practice_id)
  references public.ltb_clients (id, practice_id) not valid;
alter table public.ltb_cases validate constraint ltb_cases_client_id_fkey;

-- Existing rows are intake uploads, so they keep the 'client' default.
alter table public.ltb_case_documents
  add column uploaded_by text not null default 'client' check (uploaded_by in ('client', 'staff')),
  add column shared_with_client boolean not null default false;

-- ---------------------------------------------------------------------------
-- File numbers: PREFIX-YYYY-NNNN, four digits until 9999 and plain digits
-- after (the old lpad default silently truncated 10000 to '1000').
-- Mirrors formatMatterNumber in practice-catalog.ts.
-- ---------------------------------------------------------------------------
create function public.practice_format_number(p_prefix text, p_year text, p_n bigint)
returns text language sql immutable strict security definer set search_path = public, pg_temp as $$
  select p_prefix || '-' || p_year || '-'
    || case when p_n between 0 and 9999 then lpad(p_n::text, 4, '0') else p_n::text end;
$$;

-- Existing case numbers are untouched; new cases keep the same sequence.
alter table public.ltb_cases alter column case_number set default
  public.practice_format_number('LTB', to_char(now() at time zone 'America/Toronto', 'YYYY'),
    nextval('public.ltb_case_number_seq'));

-- ---------------------------------------------------------------------------
-- Catalog value lists (copies of practice-catalog.ts, see the markers above)
-- ---------------------------------------------------------------------------
create function public.practice_stages(p_area text)
returns text[] language sql immutable security definer set search_path = public, pg_temp as $$
  select case p_area
    when 'ltb' then array['new_intake', 'under_review', 'quoted', 'retained', 'notice_served', 'filed',
      'hearing_scheduled', 'order_issued', 'closed', 'declined']
    when 'traffic' then array['new_intake', 'under_review', 'quoted', 'retained', 'option_filed',
      'disclosure_requested', 'resolution_meeting', 'offer_received', 'trial_scheduled', 'closed', 'declined']
    when 'general' then array['new_intake', 'under_review', 'quoted', 'retained', 'in_progress', 'closed',
      'declined']
  end;
$$;

-- Stages whose arrival emails the client (catalog notify: true).
create function public.practice_notify_stages(p_area text)
returns text[] language sql immutable security definer set search_path = public, pg_temp as $$
  select case p_area
    when 'ltb' then array['under_review', 'quoted', 'retained', 'notice_served', 'filed', 'hearing_scheduled',
      'order_issued', 'closed', 'declined']
    when 'traffic' then array['under_review', 'quoted', 'retained', 'option_filed', 'disclosure_requested',
      'resolution_meeting', 'offer_received', 'trial_scheduled', 'closed', 'declined']
    when 'general' then array['under_review', 'quoted', 'retained', 'in_progress', 'closed', 'declined']
  end;
$$;

-- Outcomes staff may pick when closing a file. 'declined' is never picked: it
-- is stored automatically when a file is declined.
create function public.practice_outcomes(p_area text)
returns text[] language sql immutable security definer set search_path = public, pg_temp as $$
  select case p_area
    when 'ltb' then array['order_obtained', 'settled', 'tenant_paid', 'withdrawn', 'dismissed', 'other']
    when 'traffic' then array['withdrawn', 'amended', 'not_guilty', 'convicted', 'client_paid', 'other']
    when 'general' then array['resolved', 'settled', 'judgment', 'withdrawn', 'referred_out', 'other']
  end;
$$;

-- ---------------------------------------------------------------------------
-- Input helpers
-- ---------------------------------------------------------------------------

-- Same address rule as ltb_clients.email, minus control characters.
create function public.practice_is_email(p_value text)
returns boolean language sql immutable security definer set search_path = public, pg_temp as $$
  select coalesce(p_value = lower(p_value) and char_length(p_value) <= 254 and p_value !~ '[[:cntrl:]]'
    and p_value ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$', false);
$$;

-- Notice recipients: 1 to 5 distinct valid addresses.
create function public.practice_valid_recipients(p_recipients text[])
returns boolean language sql immutable security definer set search_path = public, pg_temp as $$
  select coalesce(cardinality(p_recipients) between 1 and 5
    and (select bool_and(public.practice_is_email(r)) from unnest(p_recipients) r)
    and (select count(distinct r) from unnest(p_recipients) r) = cardinality(p_recipients), false);
$$;

-- Trims, removes control characters (single-line fields turn line breaks into
-- spaces) and caps the length. Empty input becomes null. Zero-width and
-- bidirectional formatting characters are removed first, so a name such as
-- "scan<RLO>fdp.exe" cannot display as something it is not.
create function public.practice_clean_text(p_value text, p_max integer, p_multiline boolean default false)
returns text language sql immutable security definer set search_path = public, pg_temp as $$
  select nullif(btrim(left(btrim(
    case when p_multiline then regexp_replace(v.visible, '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g')
         else regexp_replace(v.visible, '[[:cntrl:]]+', ' ', 'g') end, E' \t\r\n'), p_max), E' \t\r\n'), '')
  from (select regexp_replace(p_value, '[​-‏‪-‮⁠-⁩﻿]', '', 'g') as visible) v;
$$;

-- Strict YYYY-MM-DD dates. Empty means null; anything else invalid raises.
create function public.practice_parse_date(p_value text)
returns date language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_date date;
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  if p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'PRACTICE_INTAKE_INVALID';
  end if;
  begin
    v_date := p_value::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'PRACTICE_INTAKE_INVALID';
  end;
  if v_date not between date '1900-01-01' and date '2100-12-31' then
    raise exception 'PRACTICE_INTAKE_INVALID';
  end if;
  return v_date;
end $$;

-- Validates upload specs ({id, extension, contentType, size, name}) for
-- intake, portal and staff uploads. The extension always follows the content
-- type (catalog UPLOAD_LIMITS); ids are generated when the caller has none.
create function public.practice_parse_documents(p_documents jsonb, p_ids_required boolean)
returns table (ordinal integer, document_id uuid, extension text, content_type text, size_bytes integer,
  original_name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item jsonb;
  v_index integer := 0;
  v_seen uuid[] := '{}';
begin
  if jsonb_typeof(p_documents) is distinct from 'array' then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;
  for v_item in select value from jsonb_array_elements(p_documents) loop
    v_index := v_index + 1;
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item->'contentType') is distinct from 'string' then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    end if;
    content_type := v_item->>'contentType';
    extension := case content_type
      when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
      when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' end;
    if extension is null then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    end if;
    if jsonb_typeof(v_item->'extension') is not null and jsonb_typeof(v_item->'extension') <> 'null'
       and (jsonb_typeof(v_item->'extension') <> 'string' or v_item->>'extension' <> extension) then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    end if;
    if jsonb_typeof(v_item->'size') is distinct from 'number' or (v_item->>'size') !~ '^[0-9]{1,8}$' then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    end if;
    size_bytes := (v_item->>'size')::integer;
    if size_bytes not between 1 and 10485760 then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    end if;
    if jsonb_typeof(v_item->'id') is null or jsonb_typeof(v_item->'id') = 'null' then
      if p_ids_required then
        raise exception 'PRACTICE_DOCUMENT_INVALID';
      end if;
      document_id := gen_random_uuid();
    elsif jsonb_typeof(v_item->'id') <> 'string'
       or (v_item->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    else
      document_id := (v_item->>'id')::uuid;
    end if;
    if document_id = any (v_seen) then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    end if;
    v_seen := v_seen || document_id;
    if jsonb_typeof(v_item->'name') not in ('string', 'null') then
      raise exception 'PRACTICE_DOCUMENT_INVALID';
    end if;
    original_name := public.practice_clean_text(v_item->>'name', 200);
    ordinal := v_index;
    return next;
  end loop;
end $$;

-- Traffic and other-matter details shared by public intake ('form') and
-- staff-opened files ('staff'). Unknown vocabulary values raise: the edge
-- functions map them to 'other' / 'unsure' before calling.
create function public.practice_parse_matter_details(p_area text, p_values jsonb, p_source text)
returns table (ticket_type text, ticket_city text, ticket_received_on date, option_chosen text,
  option_deadline date, category text, deadline_date date, other_party text, client_city text,
  field_sources jsonb, review_note text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from jsonb := jsonb_build_object('source', p_source);
begin
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'PRACTICE_INTAKE_INVALID';
  end if;
  if p_area = 'traffic' then
    ticket_type := nullif(btrim(p_values->>'ticketType'), '');
    if ticket_type not in ('speeding', 'camera', 'red_light_stop', 'careless', 'distracted', 'no_insurance',
                           'licence_plate', 'commercial', 'other') then
      raise exception 'PRACTICE_INTAKE_INVALID';
    end if;
    ticket_city := public.practice_clean_text(p_values->>'ticketCity', 100);
    ticket_received_on := public.practice_parse_date(p_values->>'ticketReceivedOn');
    option_chosen := nullif(btrim(p_values->>'optionChosen'), '');
    if option_chosen not in ('none', 'trial', 'meeting', 'paid', 'unsure') then
      raise exception 'PRACTICE_INTAKE_INVALID';
    end if;
    if ticket_received_on is not null then
      -- Most Ontario offence notices allow 15 days to choose an option
      -- (catalog TICKET_RESPONSE_DAYS). A triage estimate; the notice governs.
      option_deadline := ticket_received_on + 15;
      review_note := format('Response deadline %s is an estimate (15 days after the ticket was received on %s). '
        'Confirm it on the notice.', to_char(option_deadline, 'YYYY-MM-DD'), to_char(ticket_received_on, 'YYYY-MM-DD'));
    end if;
    field_sources := jsonb_strip_nulls(jsonb_build_object(
      'ticket_type', case when ticket_type is not null then v_from end,
      'ticket_city', case when ticket_city is not null then v_from end,
      'ticket_received_on', case when ticket_received_on is not null then v_from end,
      'option_chosen', case when option_chosen is not null then v_from end,
      'option_deadline', case when option_deadline is not null
                         then v_from || jsonb_build_object('confidence', 'low') end));
    option_chosen := coalesce(option_chosen, 'unsure');
  elsif p_area = 'general' then
    option_chosen := 'unsure';
    category := nullif(btrim(p_values->>'category'), '');
    if category not in ('small_claims', 'tribunal', 'offence', 'notary', 'other') then
      raise exception 'PRACTICE_INTAKE_INVALID';
    end if;
    deadline_date := public.practice_parse_date(p_values->>'deadline');
    other_party := public.practice_clean_text(p_values->>'otherParty', 200);
    client_city := public.practice_clean_text(p_values->>'clientCity', 100);
    field_sources := jsonb_strip_nulls(jsonb_build_object(
      'category', case when category is not null then v_from end,
      'deadline_date', case when deadline_date is not null then v_from end,
      'other_party', case when other_party is not null then v_from end,
      'client_city', case when client_city is not null then v_from end));
  else
    raise exception 'PRACTICE_AREA_INVALID';
  end if;
  return next;
end $$;

-- Stage-notice event keys use whole milliseconds of stage_changed_at.
create function public.practice_epoch_ms(p_at timestamptz)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select floor(extract(epoch from p_at) * 1000)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- Practice matters: traffic tickets (TKT-) and other matters (MAT-)
-- ---------------------------------------------------------------------------
create sequence public.practice_traffic_number_seq;
create sequence public.practice_general_number_seq;

create table public.practice_matters (
  id uuid primary key default gen_random_uuid(),
  practice_id text not null references public.ltb_practices(id),
  client_id uuid not null,
  area text not null check (area in ('traffic', 'general')),
  -- Assigned by practice_assign_matter_number; immutable afterwards.
  matter_number text not null unique,
  stage text not null default 'new_intake',
  stage_changed_at timestamptz not null default now(),
  outcome text,
  closed_at timestamptz,
  intake_review_status text not null default 'pending_scan' check (intake_review_status in (
    'pending_scan', 'scanning', 'needs_review', 'ready')),
  intake_scan_started_at timestamptz,
  client_notes text check (char_length(client_notes) <= 2000),
  review_notes text check (char_length(review_notes) <= 4000),
  field_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(field_sources) = 'object'),
  returning_client boolean not null default false,
  intake_token_hash text check (intake_token_hash ~ '^[0-9a-f]{64}$'),
  intake_finalized_at timestamptz,
  source text not null default 'anderhue-site' check (source in ('anderhue-site', 'staff', 'smoke-test')),
  user_agent text check (char_length(user_agent) <= 400),
  -- Traffic tickets
  ticket_type text check (ticket_type in ('speeding', 'camera', 'red_light_stop', 'careless', 'distracted',
    'no_insurance', 'licence_plate', 'commercial', 'other')),
  ticket_city text check (char_length(ticket_city) <= 100),
  ticket_received_on date,
  option_chosen text not null default 'unsure' check (option_chosen in ('none', 'trial', 'meeting', 'paid', 'unsure')),
  offence_number text check (char_length(offence_number) <= 40),
  offence_date date,
  offence_description text check (char_length(offence_description) <= 300),
  statute_section text check (char_length(statute_section) <= 80),
  set_fine_cents integer check (set_fine_cents >= 0),
  total_payable_cents integer check (total_payable_cents >= 0),
  court_location text check (char_length(court_location) <= 200),
  option_deadline date,
  disclosure_requested_on date,
  meeting_date date,
  trial_date date,
  -- Other matters
  category text check (category in ('small_claims', 'tribunal', 'offence', 'notary', 'other')),
  deadline_date date,
  other_party text check (char_length(other_party) <= 200),
  client_city text check (char_length(client_city) <= 100),
  -- Client portal (portal_visible: see ltb_cases.portal_visible)
  client_request_message text check (char_length(client_request_message) between 1 and 1000),
  client_request_at timestamptz,
  client_uploaded_at timestamptz,
  portal_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_matters_stage_check check (
    (area = 'traffic' and stage in ('new_intake', 'under_review', 'quoted', 'retained', 'option_filed',
      'disclosure_requested', 'resolution_meeting', 'offer_received', 'trial_scheduled', 'closed', 'declined'))
    or (area = 'general' and stage in ('new_intake', 'under_review', 'quoted', 'retained', 'in_progress',
      'closed', 'declined'))),
  constraint practice_matters_outcome_check check (
    outcome is null
    or (area = 'traffic' and outcome in ('withdrawn', 'amended', 'not_guilty', 'convicted', 'client_paid',
      'other', 'declined'))
    or (area = 'general' and outcome in ('resolved', 'settled', 'judgment', 'withdrawn', 'referred_out',
      'other', 'declined'))),
  -- A closed file has a picked outcome, a declined file the 'declined'
  -- outcome, an open file neither (practice_set_stage keeps this true).
  constraint practice_matters_closure_check check (case stage
    when 'closed' then outcome is not null and outcome <> 'declined' and closed_at is not null
    when 'declined' then outcome = 'declined' and closed_at is not null
    else outcome is null and closed_at is null end),
  constraint practice_matters_area_fields_check check (
    (area = 'traffic' and category is null) or (area = 'general' and ticket_type is null)),
  constraint practice_matters_client_request_check check (
    (client_request_message is null) = (client_request_at is null)),
  -- The client must belong to the same practice as the file.
  constraint practice_matters_client_fkey foreign key (client_id, practice_id)
    references public.ltb_clients (id, practice_id),
  constraint practice_matters_id_practice_key unique (id, practice_id)
);
-- Staff boards: one area of one practice, by stage, newest first.
create index practice_matters_board_idx on public.practice_matters (practice_id, area, stage, created_at desc);
create index practice_matters_client_idx on public.practice_matters (client_id);
create index practice_matters_scan_idx on public.practice_matters (intake_review_status, intake_scan_started_at)
  where intake_review_status in ('pending_scan', 'scanning');

-- ---------------------------------------------------------------------------
-- Matter documents (private bucket practice-documents, path
-- {matter_id}/{document_id}.{ext}) and the append-only matter event log.
-- Both carry the matter's practice_id (enforced by the composite key), which
-- is what their row level security checks.
-- ---------------------------------------------------------------------------
create table public.practice_matter_documents (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null,
  practice_id text not null,
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp|heic|heif)$'),
  original_name text check (char_length(original_name) <= 200),
  content_type text not null check (content_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_at timestamptz,
  kind text check (kind in ('ticket', 'court_document', 'disclosure', 'correspondence', 'evidence', 'notice',
    'government_id', 'other')),
  extraction_status text not null default 'awaiting_upload' check (extraction_status in (
    'awaiting_upload', 'pending', 'extracted', 'skipped', 'failed')),
  extracted jsonb check (extracted is null or jsonb_typeof(extracted) = 'object'),
  extracted_at timestamptz,
  uploaded_by text not null default 'client' check (uploaded_by in ('client', 'staff')),
  shared_with_client boolean not null default false,
  created_at timestamptz not null default now(),
  -- The object name is fixed by the row: its own matter folder, its own id and
  -- the extension of its content type.
  constraint practice_matter_documents_path_check check (storage_path = matter_id::text || '/' || id::text || '.'
    || case content_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
         when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' end),
  constraint practice_matter_documents_matter_fkey foreign key (matter_id, practice_id)
    references public.practice_matters (id, practice_id) on delete cascade
);
create index practice_matter_documents_matter_idx on public.practice_matter_documents (matter_id, created_at);

create table public.practice_matter_events (
  id bigint generated always as identity primary key,
  matter_id uuid not null,
  practice_id text not null,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null check (event ~ '^[a-z_]{3,60}$'),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  at timestamptz not null default now(),
  constraint practice_matter_events_matter_fkey foreign key (matter_id, practice_id)
    references public.practice_matters (id, practice_id) on delete cascade
);
create index practice_matter_events_matter_idx on public.practice_matter_events (matter_id, at desc);

-- ---------------------------------------------------------------------------
-- Notice outbox: client updates and staff alerts for all three areas. Same
-- claim / freeze / finish contract as ltb_intake_alerts, plus 'superseded'
-- (a stage update overtaken before it was sent) and 'cancelled' (staff).
-- ---------------------------------------------------------------------------
create table public.practice_notices (
  id uuid primary key default gen_random_uuid(),
  practice_id text not null references public.ltb_practices(id),
  area text check (area in ('ltb', 'traffic', 'general')),
  -- ltb_cases.id or practice_matters.id, depending on area.
  case_id uuid,
  client_id uuid references public.ltb_clients(id),
  audience text not null check (audience in ('client', 'staff')),
  kind text not null check (kind in ('intake_received', 'stage_changed', 'documents_requested', 'document_shared',
    'portal_link', 'upload_invite', 'staff_new_intake', 'staff_client_uploaded')),
  event_key text not null unique check (char_length(event_key) <= 200 and event_key ~ '^[a-z-]+(/[a-z0-9_-]+)+$'),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  recipients text[] not null check (public.practice_valid_recipients(recipients)),
  status text not null default 'pending' check (status in (
    'pending', 'sending', 'retry', 'sent', 'failed', 'indeterminate', 'superseded', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  claim_id uuid,
  claim_expires_at timestamptz,
  email_payload jsonb check (email_payload is null or jsonb_typeof(email_payload) = 'object'),
  provider_email_id text,
  sent_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  constraint practice_notices_kind_audience_check check (
    (audience = 'client' and client_id is not null and kind in ('intake_received', 'stage_changed',
      'documents_requested', 'document_shared', 'portal_link', 'upload_invite'))
    or (audience = 'staff' and kind in ('staff_new_intake', 'staff_client_uploaded'))),
  -- Only a portal link stands apart from any file.
  constraint practice_notices_case_check check (
    (kind = 'portal_link' and area is null and case_id is null)
    or (kind <> 'portal_link' and area is not null and case_id is not null)),
  constraint practice_notices_stage_detail_check check (kind <> 'stage_changed' or detail ? 'stage'),
  check (status <> 'sending' or (claim_id is not null and claim_expires_at is not null)),
  check (status <> 'sent' or (provider_email_id is not null and sent_at is not null))
);
create index practice_notices_pending_idx on public.practice_notices (next_attempt_at, created_at)
  where status in ('pending', 'retry', 'sending');
create index practice_notices_case_idx on public.practice_notices (case_id, created_at desc)
  where case_id is not null;
-- Receipt throttling looks up a client's recent receipts.
create index practice_notices_client_kind_idx on public.practice_notices (client_id, kind, created_at desc)
  where client_id is not null;

-- ---------------------------------------------------------------------------
-- Rate limiter for the public edge functions (mirror of
-- ticket_intake_draft_rate_limits). The functions send only a keyed hash of
-- what they limit (for example an HMAC of action and network address); raw
-- addresses are never stored. Counting happens in one row-locked upsert, so
-- parallel requests cannot slip past the limit.
-- ---------------------------------------------------------------------------
create table public.practice_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  hits integer not null check (hits >= 1),
  updated_at timestamptz not null default now()
);
create index practice_rate_limits_updated_idx on public.practice_rate_limits (updated_at);

-- ---------------------------------------------------------------------------
-- File helpers. Every function that works across areas picks its table with
-- an explicit branch; nothing builds SQL from input.
-- ---------------------------------------------------------------------------
create function public.practice_case_ref(p_area text, p_case_id uuid)
returns table (practice_id text, client_id uuid, stage text, source text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_area = 'ltb' then
    return query select c.practice_id, c.client_id, c.stage, c.source
      from public.ltb_cases c where c.id = p_case_id;
  elsif p_area in ('traffic', 'general') then
    return query select m.practice_id, m.client_id, m.stage, m.source
      from public.practice_matters m where m.id = p_case_id and m.area = p_area;
  end if;
end $$;

-- Same as practice_case_ref, but locks the file row for the rest of the
-- transaction (stage changes, requests and uploads serialize on it).
create function public.practice_lock_case(p_area text, p_case_id uuid)
returns table (practice_id text, client_id uuid, stage text, outcome text, source text, portal_visible boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_area = 'ltb' then
    return query select c.practice_id, c.client_id, c.stage, c.outcome, c.source, c.portal_visible
      from public.ltb_cases c where c.id = p_case_id for update;
  elsif p_area in ('traffic', 'general') then
    return query select m.practice_id, m.client_id, m.stage, m.outcome, m.source, m.portal_visible
      from public.practice_matters m where m.id = p_case_id and m.area = p_area for update;
  end if;
end $$;

-- Puts a held file into the client portal. Called when staff deliberately
-- engage the client on it (asking for documents, sharing one); a stage move
-- out of new_intake does the same through practice_reveal_on_stage.
create function public.practice_reveal_file(p_area text, p_case_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_area = 'ltb' then
    update public.ltb_cases c set portal_visible = true where c.id = p_case_id and not c.portal_visible;
  elsif p_area in ('traffic', 'general') then
    update public.practice_matters m set portal_visible = true
      where m.id = p_case_id and m.area = p_area and not m.portal_visible;
  end if;
end $$;

create function public.practice_lock_document(p_area text, p_document_id uuid)
returns table (case_id uuid, practice_id text, storage_path text, original_name text, uploaded_by text,
  uploaded_at timestamptz, shared_with_client boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_area = 'ltb' then
    return query select d.case_id, d.practice_id, d.storage_path, d.original_name, d.uploaded_by, d.uploaded_at,
        d.shared_with_client
      from public.ltb_case_documents d where d.id = p_document_id for update;
  elsif p_area in ('traffic', 'general') then
    return query select d.matter_id, d.practice_id, d.storage_path, d.original_name, d.uploaded_by, d.uploaded_at,
        d.shared_with_client
      from public.practice_matter_documents d
      join public.practice_matters m on m.id = d.matter_id
      where d.id = p_document_id and m.area = p_area for update of d;
  end if;
end $$;

create function public.practice_log_event(p_area text, p_case_id uuid, p_practice_id text, p_actor uuid,
  p_event text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_area = 'ltb' then
    insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
    values (p_case_id, p_practice_id, p_actor, p_event, coalesce(p_detail, '{}'::jsonb));
  elsif p_area in ('traffic', 'general') then
    insert into public.practice_matter_events (matter_id, practice_id, actor_id, event, detail)
    values (p_case_id, p_practice_id, p_actor, p_event, coalesce(p_detail, '{}'::jsonb));
  else
    raise exception 'PRACTICE_AREA_INVALID';
  end if;
end $$;

-- Creates or reuses the practice client, with the ltb_register_intake rules:
-- a registered client is never changed by an unauthenticated form or a staff
-- shortcut (differences become review notes); a provisional client only gains
-- empty fields. Race-safe through the (practice_id, email) unique key.
create function public.practice_upsert_client(p_practice_id text, p_email text, p_first_name text,
  p_last_name text, p_organization_name text, p_phone text, p_city text, p_source text)
returns table (client_id uuid, returning_client boolean, notes text[])
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client public.ltb_clients%rowtype;
  v_from jsonb := jsonb_build_object('source', p_source);
  v_by text := case when p_source = 'staff' then 'entered by staff' else 'entered on the form' end;
  v_notes text[] := '{}';
begin
  insert into public.ltb_clients (practice_id, email, client_type, first_name, last_name, organization_name,
    phone, city, field_sources)
  values (p_practice_id, p_email,
    case when p_organization_name is not null then 'organization' else 'individual' end,
    p_first_name, p_last_name, p_organization_name, p_phone, p_city,
    jsonb_strip_nulls(jsonb_build_object(
      'email', v_from,
      'first_name', case when p_first_name is not null then v_from end,
      'last_name', case when p_last_name is not null then v_from end,
      'organization_name', case when p_organization_name is not null then v_from end,
      'phone', case when p_phone is not null then v_from end,
      'city', case when p_city is not null then v_from end)))
  on conflict (practice_id, email) do nothing
  returning * into v_client;
  if found then
    return query select v_client.id, false, v_notes;
    return;
  end if;

  select * into v_client from public.ltb_clients c
    where c.practice_id = p_practice_id and c.email = p_email for update;
  if v_client.registration_status <> 'provisional' then
    if p_first_name is not null and lower(coalesce(v_client.first_name, '') || ' ' || coalesce(v_client.last_name, ''))
       <> lower(p_first_name || ' ' || coalesce(p_last_name, '')) then
      v_notes := v_notes || format('Returning client. Name %s (%s) differs from the registered record.',
        v_by, concat_ws(' ', p_first_name, p_last_name));
    end if;
    if p_organization_name is not null and lower(coalesce(v_client.organization_name, '')) <> lower(p_organization_name) then
      v_notes := v_notes || format('Returning client. Organization %s (%s) differs from the registered record.',
        v_by, p_organization_name);
    end if;
    if p_phone is not null and coalesce(v_client.phone, '') <> p_phone then
      v_notes := v_notes || format('Returning client. Phone %s (%s) differs from the registered record.', v_by, p_phone);
    end if;
    return query select v_client.id, true, v_notes;
    return;
  end if;

  update public.ltb_clients c set
    first_name = coalesce(c.first_name, p_first_name),
    last_name = coalesce(c.last_name, p_last_name),
    organization_name = coalesce(c.organization_name, p_organization_name),
    phone = coalesce(c.phone, p_phone),
    city = coalesce(c.city, p_city),
    field_sources = c.field_sources || jsonb_strip_nulls(jsonb_build_object(
      'first_name', case when c.first_name is null and p_first_name is not null then v_from end,
      'last_name', case when c.last_name is null and p_last_name is not null then v_from end,
      'organization_name', case when c.organization_name is null and p_organization_name is not null then v_from end,
      'phone', case when c.phone is null and p_phone is not null then v_from end,
      'city', case when c.city is null and p_city is not null then v_from end))
  where c.id = v_client.id;
  return query select v_client.id, false, v_notes;
end $$;

-- ---------------------------------------------------------------------------
-- Notice snapshot (ARCHITECTURE.md 3.5) and enqueue
-- ---------------------------------------------------------------------------

-- documentCount counts only documents the client can see (their uploads and
-- shared practice documents), so a client email never reveals internal files.
create function public.practice_notice_snapshot(p_area text, p_case_id uuid, p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_case_client_id uuid;
  v_file jsonb;
  v_snapshot jsonb;
begin
  if p_case_id is not null then
    if p_area = 'ltb' then
      select c.client_id, jsonb_build_object(
          'area', 'ltb', 'id', c.id, 'number', c.case_number, 'stage', c.stage, 'outcome', c.outcome,
          'issue', c.issue, 'ticketType', null, 'category', null, 'city', c.unit_city,
          'createdAt', c.created_at, 'reviewStatus', c.intake_review_status,
          'documentCount', (select count(*) from public.ltb_case_documents d
                            where d.case_id = c.id and d.uploaded_at is not null
                              and (d.uploaded_by = 'client' or d.shared_with_client)),
          'clientNotes', c.client_notes,
          'keyDates', jsonb_build_object(
            'noticeTerminationDate', c.notice_termination_date, 'hearingDate', c.hearing_date,
            'optionDeadline', null, 'offenceDate', null, 'meetingDate', null, 'trialDate', null,
            'deadlineDate', null),
          'request', case when c.client_request_message is not null then jsonb_build_object(
            'message', c.client_request_message, 'at', c.client_request_at) end)
        into v_case_client_id, v_file
      from public.ltb_cases c where c.id = p_case_id;
    elsif p_area in ('traffic', 'general') then
      select m.client_id, jsonb_build_object(
          'area', m.area, 'id', m.id, 'number', m.matter_number, 'stage', m.stage, 'outcome', m.outcome,
          'issue', null, 'ticketType', m.ticket_type, 'category', m.category,
          'city', case when m.area = 'traffic' then m.ticket_city else m.client_city end,
          'createdAt', m.created_at, 'reviewStatus', m.intake_review_status,
          'documentCount', (select count(*) from public.practice_matter_documents d
                            where d.matter_id = m.id and d.uploaded_at is not null
                              and (d.uploaded_by = 'client' or d.shared_with_client)),
          'clientNotes', m.client_notes,
          'keyDates', jsonb_build_object(
            'noticeTerminationDate', null, 'hearingDate', null,
            'optionDeadline', m.option_deadline, 'offenceDate', m.offence_date, 'meetingDate', m.meeting_date,
            'trialDate', m.trial_date, 'deadlineDate', m.deadline_date),
          'request', case when m.client_request_message is not null then jsonb_build_object(
            'message', m.client_request_message, 'at', m.client_request_at) end)
        into v_case_client_id, v_file
      from public.practice_matters m where m.id = p_case_id and m.area = p_area;
    end if;
  end if;

  select jsonb_build_object(
      'practice', jsonb_build_object(
        'id', p.id, 'name', p.name, 'displayName', p.display_name, 'licenseeName', p.licensee_name,
        'phone', p.phone, 'publicEmail', p.public_email, 'siteUrl', p.site_url,
        'clientEmailFrom', p.client_email_from, 'clientReplyTo', p.client_reply_to, 'noticeFrom', p.notice_from),
      'client', jsonb_build_object(
        'id', cl.id, 'firstName', cl.first_name, 'lastName', cl.last_name,
        'organizationName', cl.organization_name, 'email', cl.email),
      'file', v_file)
    into v_snapshot
  from public.ltb_clients cl
  join public.ltb_practices p on p.id = cl.practice_id
  where cl.id = coalesce(p_client_id, v_case_client_id);
  return v_snapshot;
end $$;

-- Queues one notice. Audience follows the kind. Client notices need the
-- practice's client_updates_enabled switch, a valid client address and a file
-- the client can see in the portal; staff notices go to the practice
-- alert_emails. Smoke tests never queue anything, and a client receives at
-- most two intake receipts a day (public intakes are anonymous). The event key
-- makes every notice idempotent. Returns the new id, or null when nothing was
-- queued (switched off, no recipient, held file, throttled, smoke test,
-- duplicate).
create function public.practice_enqueue_notice(p_practice_id text, p_area text, p_case_id uuid, p_client_id uuid,
  p_kind text, p_event_key text, p_detail jsonb default '{}'::jsonb, p_delay_seconds integer default 0,
  p_actor uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_audience text;
  v_case record;
  v_client_id uuid := p_client_id;
  v_practice public.ltb_practices%rowtype;
  v_email text;
  v_recipients text[];
  v_snapshot jsonb;
  v_id uuid;
begin
  if p_kind in ('intake_received', 'stage_changed', 'documents_requested', 'document_shared', 'portal_link',
                'upload_invite') then
    v_audience := 'client';
  elsif p_kind in ('staff_new_intake', 'staff_client_uploaded') then
    v_audience := 'staff';
  else
    raise exception 'PRACTICE_NOTICE_INVALID';
  end if;
  if p_event_key is null or char_length(p_event_key) > 200 or p_event_key !~ '^[a-z-]+(/[a-z0-9_-]+)+$'
     or coalesce(p_delay_seconds, 0) not between 0 and 3600
     or jsonb_typeof(coalesce(p_detail, '{}'::jsonb)) <> 'object' then
    raise exception 'PRACTICE_NOTICE_INVALID';
  end if;

  if p_kind = 'portal_link' then
    if p_area is not null or p_case_id is not null or p_client_id is null then
      raise exception 'PRACTICE_NOTICE_INVALID';
    end if;
  else
    select * into v_case from public.practice_case_ref(p_area, p_case_id);
    if not found then
      raise exception 'PRACTICE_CASE_NOT_FOUND';
    end if;
    if v_case.practice_id <> p_practice_id or v_case.client_id <> coalesce(p_client_id, v_case.client_id) then
      raise exception 'PRACTICE_NOTICE_INVALID';
    end if;
    if v_case.source = 'smoke-test' then
      return null;
    end if;
    v_client_id := v_case.client_id;
  end if;

  select * into v_practice from public.ltb_practices p where p.id = p_practice_id;
  if not found then
    raise exception 'PRACTICE_NOTICE_INVALID';
  end if;

  if v_audience = 'client' then
    if not v_practice.client_updates_enabled then
      return null;
    end if;
    select c.email into v_email from public.ltb_clients c
      where c.id = v_client_id and c.practice_id = p_practice_id;
    if not found then
      raise exception 'PRACTICE_NOTICE_INVALID';
    end if;
    if not public.practice_is_email(v_email) then
      return null;
    end if;
    if p_case_id is not null and not coalesce(case when p_area = 'ltb'
        then (select c.portal_visible from public.ltb_cases c where c.id = p_case_id)
        else (select m.portal_visible from public.practice_matters m where m.id = p_case_id) end, false) then
      return null;
    end if;
    if p_kind = 'intake_received' and (
        select count(*) from public.practice_notices x
        where x.client_id = v_client_id and x.kind = 'intake_received'
          and x.created_at > now() - interval '24 hours') >= 2 then
      return null;
    end if;
    v_recipients := array[v_email];
  else
    select coalesce(array_agg(e.address order by e.first_seen), '{}') into v_recipients
    from (
      select lower(btrim(a.address)) as address, min(a.ord) as first_seen
      from unnest(v_practice.alert_emails) with ordinality a(address, ord)
      group by 1
    ) e
    where public.practice_is_email(e.address);
    if cardinality(v_recipients) = 0 then
      return null;
    end if;
    v_recipients := v_recipients[1:5];
  end if;

  v_snapshot := public.practice_notice_snapshot(p_area, p_case_id, v_client_id);
  -- The client's own notes are for staff alerts only.
  if v_audience = 'client' and jsonb_typeof(v_snapshot->'file') = 'object' then
    v_snapshot := jsonb_set(v_snapshot, '{file,clientNotes}', 'null'::jsonb);
  end if;
  -- Staff alerts also carry the contact phone, internal review notes and the
  -- returning-client flag, so the practice can act from the email alone.
  -- Client notices never hold these.
  if v_audience = 'staff' then
    v_snapshot := jsonb_set(v_snapshot, '{client,phone}',
      coalesce((select to_jsonb(c.phone) from public.ltb_clients c where c.id = v_client_id), 'null'::jsonb));
    if jsonb_typeof(v_snapshot->'file') = 'object' then
      v_snapshot := v_snapshot || jsonb_build_object('file', (v_snapshot->'file') || coalesce(
        case when p_area = 'ltb' then
          (select jsonb_build_object('reviewNotes', c.review_notes, 'returningClient', c.returning_client)
             from public.ltb_cases c where c.id = p_case_id)
        else
          (select jsonb_build_object('reviewNotes', m.review_notes, 'returningClient', m.returning_client)
             from public.practice_matters m where m.id = p_case_id)
        end, '{}'::jsonb));
    end if;
  end if;

  insert into public.practice_notices (practice_id, area, case_id, client_id, audience, kind, event_key, detail,
    snapshot, recipients, next_attempt_at, created_by)
  values (p_practice_id, p_area, p_case_id, v_client_id, v_audience, p_kind, p_event_key,
    coalesce(p_detail, '{}'::jsonb), v_snapshot, v_recipients,
    now() + make_interval(secs => coalesce(p_delay_seconds, 0)), p_actor)
  on conflict (event_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Matter housekeeping triggers
-- ---------------------------------------------------------------------------
create function public.practice_assign_matter_number()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.area = 'traffic' then
    new.matter_number := public.practice_format_number('TKT',
      to_char(now() at time zone 'America/Toronto', 'YYYY'), nextval('public.practice_traffic_number_seq'));
  elsif new.area = 'general' then
    new.matter_number := public.practice_format_number('MAT',
      to_char(now() at time zone 'America/Toronto', 'YYYY'), nextval('public.practice_general_number_seq'));
  else
    raise exception 'PRACTICE_AREA_INVALID';
  end if;
  return new;
end $$;
create trigger practice_matters_number before insert on public.practice_matters
  for each row execute function public.practice_assign_matter_number();

-- File numbers, areas and owning practice never change: links, event keys and
-- stage lists all depend on them.
create function public.practice_guard_matter_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.matter_number is distinct from old.matter_number then
    raise exception 'PRACTICE_NUMBER_IMMUTABLE';
  end if;
  raise exception 'PRACTICE_MATTER_IMMUTABLE';
end $$;
create trigger practice_matters_guard before update on public.practice_matters
  for each row when (new.matter_number is distinct from old.matter_number or new.area is distinct from old.area
    or new.practice_id is distinct from old.practice_id)
  execute function public.practice_guard_matter_identity();

create trigger practice_matters_touch before update on public.practice_matters
  for each row execute function public.ltb_touch_updated_at();

-- Portal hold. Public intakes are anonymous, so a new public file for a client
-- who already has a file (in any area) is held out of the client portal until
-- staff take it forward; it sends no receipt meanwhile. A client's first file,
-- staff-opened files and smoke tests are not held.
create function public.practice_hold_returning_intake()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source in ('ltb-landing', 'anderhue-site') and (
      exists (select 1 from public.ltb_cases c where c.client_id = new.client_id and c.id <> new.id)
      or exists (select 1 from public.practice_matters m where m.client_id = new.client_id and m.id <> new.id)) then
    new.portal_visible := false;
  end if;
  return new;
end $$;
create trigger ltb_cases_portal_hold before insert on public.ltb_cases
  for each row execute function public.practice_hold_returning_intake();
create trigger practice_matters_portal_hold before insert on public.practice_matters
  for each row execute function public.practice_hold_returning_intake();

-- Moving a held file out of new_intake is the staff decision that it is real,
-- whichever path moves it (practice_set_stage or the legacy LTB RPC).
create function public.practice_reveal_on_stage()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.portal_visible := true;
  return new;
end $$;
create trigger ltb_cases_portal_reveal before update of stage on public.ltb_cases
  for each row when (not new.portal_visible and new.stage is distinct from old.stage and new.stage <> 'new_intake')
  execute function public.practice_reveal_on_stage();
create trigger practice_matters_portal_reveal before update of stage on public.practice_matters
  for each row when (not new.portal_visible and new.stage is distinct from old.stage and new.stage <> 'new_intake')
  execute function public.practice_reveal_on_stage();

-- Staff edits through RLS are logged with the changed field names only, like
-- ltb_log_case_edit. Stage, outcome and portal request changes are logged by
-- the functions that make them.
create function public.practice_log_matter_edit()
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
    and n.key not in ('updated_at', 'stage', 'stage_changed_at', 'outcome', 'closed_at', 'field_sources',
      'client_request_message', 'client_request_at', 'client_uploaded_at', 'portal_visible');
  if cardinality(changed) > 0 then
    insert into public.practice_matter_events (matter_id, practice_id, actor_id, event, detail)
    values (new.id, new.practice_id, auth.uid(), 'case_updated', jsonb_build_object('fields', to_jsonb(changed)));
  end if;
  return new;
end $$;
create trigger practice_matters_log_edit after update on public.practice_matters
  for each row execute function public.practice_log_matter_edit();

-- LTB edit logging, extended for the shared client registry: portal request
-- and visibility columns are logged by the practice functions instead, the
-- portal revocation stamp by practice_revoke_portal_access, and client edits
-- and registration changes now reach every file of the client, not only
-- landlord files.
create or replace function public.ltb_log_case_edit()
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
    and n.key not in ('updated_at', 'stage', 'stage_changed_at', 'outcome', 'closed_at', 'field_sources',
      'client_request_message', 'client_request_at', 'client_uploaded_at', 'portal_visible');
  if cardinality(changed) > 0 then
    insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
    values (new.id, new.practice_id, auth.uid(), 'case_updated', jsonb_build_object('fields', to_jsonb(changed)));
  end if;
  return new;
end $$;

create or replace function public.ltb_log_client_edit()
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
      'registered_by', 'identity_verified_at', 'identity_verified_by', 'identity_document_type',
      'portal_revoked_before');
  if cardinality(changed) > 0 then
    insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
    select c.id, c.practice_id, auth.uid(), 'client_updated', jsonb_build_object('fields', to_jsonb(changed))
    from public.ltb_cases c where c.client_id = new.id;
    insert into public.practice_matter_events (matter_id, practice_id, actor_id, event, detail)
    select m.id, m.practice_id, auth.uid(), 'client_updated', jsonb_build_object('fields', to_jsonb(changed))
    from public.practice_matters m where m.client_id = new.id;
  end if;
  return new;
end $$;

create or replace function public.ltb_set_client_registration(
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
  insert into public.practice_matter_events (matter_id, practice_id, actor_id, event, detail)
  select m.id, m.practice_id, auth.uid(), 'client_registration_changed', jsonb_build_object('status', p_status)
  from public.practice_matters m where m.client_id = p_client_id;
  return v_client;
end $$;

-- ---------------------------------------------------------------------------
-- Notice triggers (ltb_cases and practice_matters share the column names they
-- read; the area comes from the table)
-- ---------------------------------------------------------------------------

-- Client update on every move into a notifying stage made through
-- practice_set_stage, which sets two transaction-local settings before its
-- update: practice.notify ('on' or 'off', always set) and
-- practice.client_message (staff's personal line, empty for none). Only 'on'
-- queues an email: other paths, such as the legacy ltb_set_case_stage, have no
-- preview or undo and so never email clients. Sending waits 90 seconds
-- (STAGE_NOTICE_DELAY_SECONDS) so a slip can be undone; claim_practice_notices
-- supersedes overtaken updates.
create function public.practice_queue_stage_notice()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_area text;
begin
  if new.source = 'smoke-test' or coalesce(current_setting('practice.notify', true), '') <> 'on' then
    return new;
  end if;
  if tg_table_name = 'ltb_cases' then
    v_area := 'ltb';
  else
    v_area := new.area;
  end if;
  if new.stage = any (public.practice_notify_stages(v_area)) then
    perform public.practice_enqueue_notice(new.practice_id, v_area, new.id, new.client_id, 'stage_changed',
      format('stage/%s/%s/%s/%s', v_area, new.id, new.stage, public.practice_epoch_ms(new.stage_changed_at)),
      jsonb_strip_nulls(jsonb_build_object('stage', new.stage, 'outcome', new.outcome,
        'message', nullif(current_setting('practice.client_message', true), ''))),
      90, auth.uid());
  end if;
  return new;
end $$;
create trigger ltb_cases_stage_notice after update of stage on public.ltb_cases
  for each row when (new.stage is distinct from old.stage)
  execute function public.practice_queue_stage_notice();
create trigger practice_matters_stage_notice after update of stage on public.practice_matters
  for each row when (new.stage is distinct from old.stage)
  execute function public.practice_queue_stage_notice();

-- "We have your file" once a public intake is finalized (or opened already
-- finalized when no documents were chosen). Staff-opened files and smoke tests
-- are not public intakes, and a file held out of the portal sends no receipt.
create function public.practice_queue_intake_receipt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_area text;
begin
  if new.intake_finalized_at is null
     or (tg_op = 'UPDATE' and old.intake_finalized_at is not null)
     or new.source not in ('ltb-landing', 'anderhue-site')
     or not new.portal_visible then
    return new;
  end if;
  if tg_table_name = 'ltb_cases' then
    v_area := 'ltb';
  else
    v_area := new.area;
  end if;
  perform public.practice_enqueue_notice(new.practice_id, v_area, new.id, new.client_id, 'intake_received',
    format('intake/%s/%s', v_area, new.id), '{}'::jsonb, 0, null);
  return new;
end $$;
create trigger ltb_cases_intake_receipt after insert or update of intake_finalized_at on public.ltb_cases
  for each row execute function public.practice_queue_intake_receipt();
create trigger practice_matters_intake_receipt after insert or update of intake_finalized_at on public.practice_matters
  for each row execute function public.practice_queue_intake_receipt();

-- Staff alert once the intake review status is first known (mirror of
-- ltb_queue_intake_alert; landlord files keep their own alert outbox).
create function public.practice_queue_staff_intake_notice()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.source <> 'smoke-test'
     and new.intake_review_status in ('ready', 'needs_review')
     and (tg_op = 'INSERT' or old.intake_review_status in ('pending_scan', 'scanning')) then
    perform public.practice_enqueue_notice(new.practice_id, new.area, new.id, new.client_id, 'staff_new_intake',
      'staff-intake/' || new.id, '{}'::jsonb, 0, null);
  end if;
  return new;
end $$;
create trigger practice_matters_staff_alert after insert or update of intake_review_status on public.practice_matters
  for each row execute function public.practice_queue_staff_intake_notice();

-- ---------------------------------------------------------------------------
-- Intake functions (service role only; called by practice-intake)
-- ---------------------------------------------------------------------------

-- Creates or reuses the client and opens a traffic or other-matter file with
-- its declared uploads. No documents: the file is finalized at once and goes
-- to staff review with a note.
create function public.practice_register_intake(
  p_practice_id text, p_area text, p_intake jsonb, p_token_hash text, p_documents jsonb default '[]'::jsonb
) returns table (matter_id uuid, client_id uuid, matter_number text, returning_client boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email text;
  v_client record;
  v_details record;
  v_documents jsonb;
  v_matter public.practice_matters%rowtype;
  v_has_docs boolean;
  v_notes text[];
begin
  if not exists (select 1 from public.ltb_practices p where p.id = p_practice_id) then
    raise exception 'PRACTICE_PRACTICE_UNKNOWN';
  end if;
  if p_area is null or p_area not in ('traffic', 'general') then
    raise exception 'PRACTICE_AREA_INVALID';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'PRACTICE_TOKEN_INVALID';
  end if;
  if jsonb_typeof(p_intake) is distinct from 'object' then
    raise exception 'PRACTICE_INTAKE_INVALID';
  end if;
  if jsonb_typeof(p_documents) is distinct from 'array' then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;
  if jsonb_array_length(p_documents) > 6 then
    raise exception 'PRACTICE_UPLOAD_LIMIT';
  end if;
  v_email := lower(btrim(coalesce(p_intake->>'email', '')));
  if not public.practice_is_email(v_email) then
    raise exception 'PRACTICE_EMAIL_INVALID';
  end if;
  select * into v_details from public.practice_parse_matter_details(p_area, p_intake, 'form');
  -- Every input is validated before anything is written (no file number is
  -- spent on a rejected intake).
  select coalesce(jsonb_agg(to_jsonb(d) order by d.ordinal), '[]'::jsonb) into v_documents
    from public.practice_parse_documents(p_documents, true) d;
  if exists (select 1 from public.practice_matter_documents x
             where x.id in (select (e->>'document_id')::uuid from jsonb_array_elements(v_documents) e)) then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;
  v_has_docs := jsonb_array_length(v_documents) > 0;

  select * into v_client from public.practice_upsert_client(p_practice_id, v_email,
    public.practice_clean_text(p_intake->>'firstName', 100), public.practice_clean_text(p_intake->>'lastName', 100),
    null, public.practice_clean_text(p_intake->>'phone', 40), v_details.client_city, 'form');

  v_notes := v_client.notes;
  if not v_has_docs then
    v_notes := v_notes || case p_area
      when 'traffic' then 'No ticket uploaded. Ask for a photo of the front and back of the offence notice.'
      else 'No documents uploaded. Ask for any notice, claim or letter about the matter.' end;
  end if;
  v_notes := v_notes || v_details.review_note;

  insert into public.practice_matters (practice_id, client_id, area, client_notes, review_notes, field_sources,
    returning_client, intake_token_hash, intake_finalized_at, intake_review_status, source, user_agent,
    ticket_type, ticket_city, ticket_received_on, option_chosen, option_deadline,
    category, deadline_date, other_party, client_city)
  values (p_practice_id, v_client.client_id, p_area,
    public.practice_clean_text(p_intake->>'notes', 2000, true),
    left(nullif(array_to_string(v_notes, E'\n'), ''), 4000),
    v_details.field_sources, v_client.returning_client, p_token_hash,
    case when v_has_docs then null else now() end,
    case when v_has_docs then 'pending_scan' else 'needs_review' end,
    'anderhue-site', public.practice_clean_text(p_intake->>'userAgent', 400),
    v_details.ticket_type, v_details.ticket_city, v_details.ticket_received_on, v_details.option_chosen,
    v_details.option_deadline, v_details.category, v_details.deadline_date, v_details.other_party,
    v_details.client_city)
  returning * into v_matter;

  insert into public.practice_matter_documents (id, matter_id, practice_id, storage_path, original_name,
    content_type, size_bytes)
  select d.document_id, v_matter.id, p_practice_id,
    v_matter.id::text || '/' || d.document_id::text || '.' || d.extension,
    d.original_name, d.content_type, d.size_bytes
  from jsonb_to_recordset(v_documents) as d(ordinal integer, document_id uuid, extension text, content_type text,
    size_bytes integer, original_name text)
  order by d.ordinal;

  perform public.practice_log_event(p_area, v_matter.id, p_practice_id, null, 'intake_received', jsonb_build_object(
    'returningClient', v_client.returning_client, 'documents', jsonb_array_length(v_documents),
    'source', v_matter.source));

  return query select v_matter.id, v_client.client_id, v_matter.matter_number, v_client.returning_client;
end $$;

-- Marks confirmed uploads (mirror of ltb_finalize_intake). Traffic uploads
-- wait for the ticket reader; other matters are never read automatically, so
-- they go straight to staff review. Returns the review status afterwards.
create function public.practice_finalize_intake(p_matter_id uuid, p_token_hash text, p_uploaded uuid[])
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_matter public.practice_matters%rowtype;
  v_uploaded integer;
begin
  select * into v_matter from public.practice_matters m where m.id = p_matter_id for update;
  if not found or p_token_hash is null or v_matter.intake_token_hash is distinct from p_token_hash then
    raise exception 'PRACTICE_INTAKE_UNAUTHORIZED';
  end if;
  if v_matter.intake_finalized_at is not null then
    return v_matter.intake_review_status;
  end if;

  update public.practice_matter_documents d set
    uploaded_at = coalesce(d.uploaded_at, now()),
    extraction_status = case when v_matter.area = 'traffic' then 'pending' else 'skipped' end
  where d.matter_id = p_matter_id and d.id = any (coalesce(p_uploaded, '{}'))
    and d.extraction_status = 'awaiting_upload';
  select count(*) into v_uploaded from public.practice_matter_documents d
    where d.matter_id = p_matter_id and d.uploaded_at is not null;

  update public.practice_matters m set
    intake_finalized_at = now(),
    intake_review_status = case when v_uploaded = 0 or m.area = 'general' then 'needs_review'
                                else m.intake_review_status end,
    review_notes = case when v_uploaded > 0 then m.review_notes
      else left(concat_ws(E'\n', m.review_notes, case m.area
        when 'traffic' then 'The client chose documents but none finished uploading. Ask them for a photo of the ticket.'
        else 'The client chose documents but none finished uploading. Ask them to send the documents again.' end), 4000)
      end
  where m.id = p_matter_id
  returning * into v_matter;

  perform public.practice_log_event(v_matter.area, p_matter_id, v_matter.practice_id, null, 'documents_uploaded',
    jsonb_build_object('count', v_uploaded));
  return v_matter.intake_review_status;
end $$;

-- Claims a finalized traffic intake for the ticket reader.
create function public.practice_claim_intake_scan(p_matter_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  affected integer;
begin
  update public.practice_matters m
    set intake_review_status = 'scanning', intake_scan_started_at = now()
    where m.id = p_matter_id and m.area = 'traffic' and m.intake_review_status = 'pending_scan'
      and m.intake_finalized_at is not null;
  get diagnostics affected = row_count;
  return affected = 1;
end $$;

-- Interrupted reading, abandoned uploads and readers that never started become
-- explicit staff tasks, which also releases their staff alert.
create function public.practice_sweep_stalled_intakes()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n1 integer;
  n2 integer;
  n3 integer;
begin
  update public.practice_matters m set
    intake_review_status = 'needs_review',
    review_notes = left(concat_ws(E'\n', m.review_notes,
      'Automatic ticket reading did not finish. Review the uploaded documents directly.'), 4000)
  where m.intake_review_status = 'scanning' and m.intake_scan_started_at < now() - interval '3 minutes';
  get diagnostics n1 = row_count;

  update public.practice_matters m set
    intake_finalized_at = coalesce(m.intake_finalized_at, now()),
    intake_review_status = 'needs_review',
    review_notes = left(concat_ws(E'\n', m.review_notes, case m.area
      when 'traffic' then 'The client started uploading the ticket but did not finish. Follow up for a photo of the ticket.'
      else 'The client started uploading documents but did not finish. Follow up for the documents.' end), 4000)
  where m.intake_review_status = 'pending_scan' and m.intake_finalized_at is null
    and m.created_at < now() - interval '15 minutes';
  get diagnostics n2 = row_count;

  -- Not in the LTB sweep: a finalized upload whose background reader never
  -- claimed it (the edge runtime stopped first) would otherwise wait forever.
  update public.practice_matters m set
    intake_review_status = 'needs_review',
    review_notes = left(concat_ws(E'\n', m.review_notes,
      'Automatic ticket reading did not start. Review the uploaded documents directly.'), 4000)
  where m.intake_review_status = 'pending_scan' and m.intake_finalized_at < now() - interval '5 minutes';
  get diagnostics n3 = row_count;
  return n1 + n2 + n3;
end $$;

-- ---------------------------------------------------------------------------
-- Client portal (service role only; practice-portal verifies the signed link
-- and its revocation before calling). Every function proves the file belongs
-- to p_client_id; smoke tests and files held out of the portal
-- (portal_visible false) are never visible.
-- ---------------------------------------------------------------------------
create function public.practice_portal_session(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_client public.ltb_clients%rowtype;
  v_practice public.ltb_practices%rowtype;
  v_files jsonb;
begin
  select * into v_client from public.ltb_clients c where c.id = p_client_id;
  if not found then
    return null;
  end if;
  select * into v_practice from public.ltb_practices p where p.id = v_client.practice_id;

  -- requestOpen: a request the client has not answered with an upload yet, on
  -- a file that still accepts uploads.
  select coalesce(jsonb_agg(f.item order by f.updated_at desc, f.created_at desc), '[]'::jsonb) into v_files
  from (
    select c.updated_at, c.created_at, jsonb_build_object(
        'area', 'ltb', 'id', c.id, 'number', c.case_number, 'stage', c.stage, 'outcome', c.outcome,
        'issue', c.issue, 'ticketType', null, 'category', null,
        'createdAt', c.created_at, 'updatedAt', c.updated_at,
        'requestOpen', c.client_request_message is not null and c.stage not in ('closed', 'declined')
          and (c.client_uploaded_at is null or c.client_uploaded_at < c.client_request_at),
        'closed', c.stage in ('closed', 'declined')) as item
    from public.ltb_cases c
    where c.client_id = p_client_id and c.source <> 'smoke-test' and c.portal_visible
    union all
    select m.updated_at, m.created_at, jsonb_build_object(
        'area', m.area, 'id', m.id, 'number', m.matter_number, 'stage', m.stage, 'outcome', m.outcome,
        'issue', null, 'ticketType', m.ticket_type, 'category', m.category,
        'createdAt', m.created_at, 'updatedAt', m.updated_at,
        'requestOpen', m.client_request_message is not null and m.stage not in ('closed', 'declined')
          and (m.client_uploaded_at is null or m.client_uploaded_at < m.client_request_at),
        'closed', m.stage in ('closed', 'declined'))
    from public.practice_matters m
    where m.client_id = p_client_id and m.source <> 'smoke-test' and m.portal_visible
    order by 1 desc, 2 desc
    limit 100
  ) f;

  return jsonb_build_object(
    'client', jsonb_build_object('id', v_client.id, 'email', v_client.email, 'firstName', v_client.first_name,
      'lastName', v_client.last_name, 'organizationName', v_client.organization_name),
    'practice', jsonb_build_object('id', v_practice.id, 'name', v_practice.name,
      'displayName', v_practice.display_name, 'phone', v_practice.phone, 'publicEmail', v_practice.public_email,
      'siteUrl', v_practice.site_url),
    'revokedBefore', v_client.portal_revoked_before,
    'files', v_files);
end $$;

-- One file for its client. Documents: uploaded ones the client sent or the
-- practice shared. History: client-safe events only, detail reduced to stage
-- and count (never notes or messages).
create function public.practice_portal_file(p_client_id uuid, p_area text, p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_file jsonb;
begin
  if p_area = 'ltb' then
    select jsonb_build_object(
        'area', 'ltb', 'id', c.id, 'number', c.case_number, 'stage', c.stage, 'outcome', c.outcome,
        'issue', c.issue, 'ticketType', null, 'category', null,
        'createdAt', c.created_at, 'updatedAt', c.updated_at, 'closedAt', c.closed_at,
        'keyDates', jsonb_build_object(
          'noticeTerminationDate', c.notice_termination_date, 'hearingDate', c.hearing_date,
          'optionDeadline', null, 'offenceDate', null, 'meetingDate', null, 'trialDate', null, 'deadlineDate', null),
        'request', case when c.client_request_message is not null then jsonb_build_object(
          'message', c.client_request_message, 'at', c.client_request_at) end,
        'clientUploadedAt', c.client_uploaded_at,
        'documents', coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', d.id, 'name', d.original_name, 'contentType', d.content_type, 'sizeBytes', d.size_bytes,
              'uploadedAt', d.uploaded_at, 'uploadedBy', d.uploaded_by, 'kind', d.kind)
            order by d.uploaded_at desc, d.id)
          from public.ltb_case_documents d
          where d.case_id = c.id and d.uploaded_at is not null and (d.uploaded_by = 'client' or d.shared_with_client)
        ), '[]'::jsonb),
        'history', coalesce((
          select jsonb_agg(h.item order by h.at desc, h.id desc)
          from (
            select e.id, e.at, jsonb_build_object('at', e.at, 'event', e.event,
                'stage', case when e.event = 'stage_changed' then e.detail->>'stage' end,
                'count', case when e.detail->>'count' ~ '^[0-9]{1,6}$' then (e.detail->>'count')::integer end) as item
            from public.ltb_case_events e
            where e.case_id = c.id and e.event in ('intake_received', 'stage_changed', 'client_uploaded',
              'document_shared', 'documents_requested')
            order by e.at desc, e.id desc
            limit 200
          ) h
        ), '[]'::jsonb))
      into v_file
    from public.ltb_cases c
    where c.id = p_case_id and c.client_id = p_client_id and c.source <> 'smoke-test' and c.portal_visible;
  elsif p_area in ('traffic', 'general') then
    select jsonb_build_object(
        'area', m.area, 'id', m.id, 'number', m.matter_number, 'stage', m.stage, 'outcome', m.outcome,
        'issue', null, 'ticketType', m.ticket_type, 'category', m.category,
        'createdAt', m.created_at, 'updatedAt', m.updated_at, 'closedAt', m.closed_at,
        'keyDates', jsonb_build_object(
          'noticeTerminationDate', null, 'hearingDate', null,
          'optionDeadline', m.option_deadline, 'offenceDate', m.offence_date, 'meetingDate', m.meeting_date,
          'trialDate', m.trial_date, 'deadlineDate', m.deadline_date),
        'request', case when m.client_request_message is not null then jsonb_build_object(
          'message', m.client_request_message, 'at', m.client_request_at) end,
        'clientUploadedAt', m.client_uploaded_at,
        'documents', coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', d.id, 'name', d.original_name, 'contentType', d.content_type, 'sizeBytes', d.size_bytes,
              'uploadedAt', d.uploaded_at, 'uploadedBy', d.uploaded_by, 'kind', d.kind)
            order by d.uploaded_at desc, d.id)
          from public.practice_matter_documents d
          where d.matter_id = m.id and d.uploaded_at is not null and (d.uploaded_by = 'client' or d.shared_with_client)
        ), '[]'::jsonb),
        'history', coalesce((
          select jsonb_agg(h.item order by h.at desc, h.id desc)
          from (
            select e.id, e.at, jsonb_build_object('at', e.at, 'event', e.event,
                'stage', case when e.event = 'stage_changed' then e.detail->>'stage' end,
                'count', case when e.detail->>'count' ~ '^[0-9]{1,6}$' then (e.detail->>'count')::integer end) as item
            from public.practice_matter_events e
            where e.matter_id = m.id and e.event in ('intake_received', 'stage_changed', 'client_uploaded',
              'document_shared', 'documents_requested')
            order by e.at desc, e.id desc
            limit 200
          ) h
        ), '[]'::jsonb))
      into v_file
    from public.practice_matters m
    where m.id = p_case_id and m.area = p_area and m.client_id = p_client_id and m.source <> 'smoke-test'
      and m.portal_visible;
  end if;
  return v_file;
end $$;

-- Registers client uploads on an open file and returns where each one goes.
-- The edge function then issues one-time signed upload URLs for those paths.
-- Every client document row counts toward the 40-per-file limit, including
-- registrations that never finished uploading.
create function public.practice_portal_register_uploads(p_client_id uuid, p_area text, p_case_id uuid,
  p_documents jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case record;
  v_existing integer;
  v_doc record;
  v_path text;
  v_bucket text := case when p_area = 'ltb' then 'ltb-documents' else 'practice-documents' end;
  v_result jsonb := '[]'::jsonb;
begin
  select * into v_case from public.practice_lock_case(p_area, p_case_id);
  if not found or v_case.client_id is distinct from p_client_id or v_case.source = 'smoke-test'
     or not v_case.portal_visible then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if v_case.stage in ('closed', 'declined') then
    raise exception 'PRACTICE_FILE_CLOSED';
  end if;
  if jsonb_typeof(p_documents) is distinct from 'array' then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;
  if jsonb_array_length(p_documents) = 0 then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;
  if jsonb_array_length(p_documents) > 6 then
    raise exception 'PRACTICE_UPLOAD_LIMIT';
  end if;
  if p_area = 'ltb' then
    select count(*) into v_existing from public.ltb_case_documents d
      where d.case_id = p_case_id and d.uploaded_by = 'client';
  else
    select count(*) into v_existing from public.practice_matter_documents d
      where d.matter_id = p_case_id and d.uploaded_by = 'client';
  end if;
  if v_existing + jsonb_array_length(p_documents) > 40 then
    raise exception 'PRACTICE_UPLOAD_LIMIT';
  end if;

  for v_doc in select * from public.practice_parse_documents(p_documents, false) d order by d.ordinal loop
    v_path := p_case_id::text || '/' || v_doc.document_id::text || '.' || v_doc.extension;
    if p_area = 'ltb' then
      if exists (select 1 from public.ltb_case_documents d where d.id = v_doc.document_id) then
        raise exception 'PRACTICE_DOCUMENT_INVALID';
      end if;
      insert into public.ltb_case_documents (id, case_id, practice_id, storage_path, original_name, content_type,
        size_bytes, uploaded_by, extraction_status)
      values (v_doc.document_id, p_case_id, v_case.practice_id, v_path, v_doc.original_name, v_doc.content_type,
        v_doc.size_bytes, 'client', 'awaiting_upload');
    else
      if exists (select 1 from public.practice_matter_documents d where d.id = v_doc.document_id) then
        raise exception 'PRACTICE_DOCUMENT_INVALID';
      end if;
      insert into public.practice_matter_documents (id, matter_id, practice_id, storage_path, original_name,
        content_type, size_bytes, uploaded_by, extraction_status)
      values (v_doc.document_id, p_case_id, v_case.practice_id, v_path, v_doc.original_name, v_doc.content_type,
        v_doc.size_bytes, 'client', 'awaiting_upload');
    end if;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'documentId', v_doc.document_id, 'bucket', v_bucket, 'storagePath', v_path));
  end loop;
  return v_result;
end $$;

-- Marks registered client uploads as received (the edge function has already
-- confirmed each object in storage), tells staff once per batch and returns
-- how many were newly confirmed. Uploads registered while the file was open
-- may still complete after it closes; new registrations may not.
create function public.practice_portal_confirm_uploads(p_client_id uuid, p_area text, p_case_id uuid,
  p_document_ids uuid[], p_note text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case record;
  v_note text := public.practice_clean_text(p_note, 4000, true);
  v_ids uuid[];
  v_first uuid;
  v_detail jsonb;
begin
  select * into v_case from public.practice_lock_case(p_area, p_case_id);
  if not found or v_case.client_id is distinct from p_client_id or v_case.source = 'smoke-test'
     or not v_case.portal_visible then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'PRACTICE_NOTE_TOO_LONG';
  end if;
  if coalesce(cardinality(p_document_ids), 0) = 0 then
    return 0;
  end if;
  if cardinality(p_document_ids) > 40 then
    raise exception 'PRACTICE_UPLOAD_LIMIT';
  end if;

  if p_area = 'ltb' then
    with confirmed as (
      update public.ltb_case_documents d set uploaded_at = coalesce(d.uploaded_at, now()), extraction_status = 'skipped'
      where d.case_id = p_case_id and d.id = any (p_document_ids) and d.uploaded_by = 'client'
        and d.extraction_status = 'awaiting_upload'
      returning d.id
    )
    select coalesce(array_agg(x.id), '{}') into v_ids from confirmed x;
    if cardinality(v_ids) > 0 then
      update public.ltb_cases c set client_uploaded_at = now() where c.id = p_case_id;
    end if;
  else
    with confirmed as (
      update public.practice_matter_documents d set uploaded_at = coalesce(d.uploaded_at, now()),
        extraction_status = 'skipped'
      where d.matter_id = p_case_id and d.id = any (p_document_ids) and d.uploaded_by = 'client'
        and d.extraction_status = 'awaiting_upload'
      returning d.id
    )
    select coalesce(array_agg(x.id), '{}') into v_ids from confirmed x;
    if cardinality(v_ids) > 0 then
      update public.practice_matters m set client_uploaded_at = now() where m.id = p_case_id;
    end if;
  end if;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  select u.id into v_first from unnest(p_document_ids) with ordinality u(id, n)
    where u.id = any (v_ids) order by u.n limit 1;
  v_detail := jsonb_strip_nulls(jsonb_build_object('count', cardinality(v_ids), 'note', v_note));
  perform public.practice_log_event(p_area, p_case_id, v_case.practice_id, null, 'client_uploaded', v_detail);
  perform public.practice_enqueue_notice(v_case.practice_id, p_area, p_case_id, v_case.client_id,
    'staff_client_uploaded', format('staff-upload/%s/%s/%s', p_area, p_case_id, v_first), v_detail, 0, null);
  return cardinality(v_ids);
end $$;

-- Where to sign a download: only uploaded documents the client sent or the
-- practice shared, on the client's own file.
create function public.practice_portal_document(p_client_id uuid, p_area text, p_case_id uuid,
  p_document_id uuid)
returns table (bucket text, storage_path text, original_name text, content_type text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_area = 'ltb' then
    return query
    select 'ltb-documents'::text, d.storage_path, d.original_name, d.content_type
    from public.ltb_case_documents d
    join public.ltb_cases c on c.id = d.case_id
    where d.id = p_document_id and d.case_id = p_case_id and c.client_id = p_client_id
      and c.source <> 'smoke-test' and c.portal_visible and d.uploaded_at is not null
      and (d.uploaded_by = 'client' or d.shared_with_client);
  elsif p_area in ('traffic', 'general') then
    return query
    select 'practice-documents'::text, d.storage_path, d.original_name, d.content_type
    from public.practice_matter_documents d
    join public.practice_matters m on m.id = d.matter_id
    where d.id = p_document_id and d.matter_id = p_case_id and m.area = p_area and m.client_id = p_client_id
      and m.source <> 'smoke-test' and m.portal_visible and d.uploaded_at is not null
      and (d.uploaded_by = 'client' or d.shared_with_client);
  end if;
end $$;

-- Queues a fresh portal link for a known client with at least one real file
-- in the portal, at most once per 10-minute window. The edge function always answers the
-- same way, so the result never reveals whether the email is a client.
create function public.practice_request_portal_link(p_practice_id text, p_email text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_client_id uuid;
begin
  if not public.practice_is_email(v_email) then
    return false;
  end if;
  select c.id into v_client_id from public.ltb_clients c
    where c.practice_id = p_practice_id and c.email = v_email;
  if v_client_id is null then
    return false;
  end if;
  if not exists (select 1 from public.ltb_cases k
                 where k.client_id = v_client_id and k.source <> 'smoke-test' and k.portal_visible)
     and not exists (select 1 from public.practice_matters m
                     where m.client_id = v_client_id and m.source <> 'smoke-test' and m.portal_visible) then
    return false;
  end if;
  return public.practice_enqueue_notice(p_practice_id, null, null, v_client_id, 'portal_link',
    format('portal-link/%s/%s', v_client_id, floor(extract(epoch from now()) / 600)::bigint),
    '{}'::jsonb, 0, null) is not null;
end $$;

-- Counts one hit against a fixed window per key: true when the hit is allowed
-- (and counted), false when the key is over p_limit for the current window.
-- One row-locked upsert does the counting, so parallel calls serialize on the
-- key; denied hits stop counting at p_limit + 1. Each call also removes a
-- bounded batch of keys idle for more than two days (windows are at most one
-- day, so no live window is lost).
create function public.practice_rate_limit_hit(p_key_hash text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hits integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit not between 1 and 10000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'PRACTICE_RATE_LIMIT_INVALID';
  end if;

  delete from public.practice_rate_limits r
    where r.key_hash in (select x.key_hash from public.practice_rate_limits x
                         where x.updated_at < now() - interval '2 days'
                         limit 100 for update skip locked);

  insert into public.practice_rate_limits as r (key_hash, window_started_at, hits, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update set
    window_started_at = case when r.window_started_at <= now() - make_interval(secs => p_window_seconds)
                             then now() else r.window_started_at end,
    hits = case when r.window_started_at <= now() - make_interval(secs => p_window_seconds)
                then 1 else least(r.hits, p_limit) + 1 end,
    updated_at = now()
  returning r.hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- Notice outbox functions (service role only; process-practice-notices)
-- ---------------------------------------------------------------------------

-- Same claim contract as claim_ltb_intake_alerts (3-minute lease, 23-hour
-- idempotency window), with two steps first:
-- 1. Kill switch: while a practice has client emails switched off, its client
--    notices that have not gone out are cancelled (client_updates_disabled),
--    including ones whose sending lease ran out (they would be claimed again).
-- 2. Stage updates that would tell the client something stale are superseded.
--    A file's state is its (stage, outcome) pair, so an outcome correction
--    counts as a change:
--    stage_moved              the file is no longer in that state
--    replaced_by_newer_update a later live update (not cancelled, superseded
--                             or failed) for the file's current state exists
--    client_already_told      the last update the client may have received was
--                             about this same state and there is no new
--                             personal message (undoing a slip sends nothing)
create function public.claim_practice_notices(p_limit integer default 10)
returns setof public.practice_notices
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'PRACTICE_NOTICE_LIMIT_INVALID';
  end if;

  update public.practice_notices n
    set status = 'cancelled', failure_code = 'client_updates_disabled', claim_id = null, claim_expires_at = null
    from public.ltb_practices p
    where p.id = n.practice_id and not p.client_updates_enabled and n.audience = 'client'
      and (n.status in ('pending', 'retry') or (n.status = 'sending' and n.claim_expires_at <= clock_timestamp()));

  with stale as (
    select n.id, case when f.moved then 'stage_moved' when f.replaced then 'replaced_by_newer_update'
                      else 'client_already_told' end as reason
    from public.practice_notices n
    left join lateral (
      select c.stage, c.outcome from public.ltb_cases c where n.area = 'ltb' and c.id = n.case_id
      union all
      select m.stage, m.outcome from public.practice_matters m
        where n.area in ('traffic', 'general') and m.area = n.area and m.id = n.case_id
    ) cur on true
    left join lateral (
      select t.detail->>'stage' as stage, t.detail->>'outcome' as outcome
      from public.practice_notices t
      where t.case_id = n.case_id and t.area = n.area and t.kind = 'stage_changed'
        and t.status in ('sent', 'sending', 'indeterminate')
      order by t.created_at desc, t.id desc
      limit 1
    ) told on true
    cross join lateral (
      select
        (n.detail->>'stage', n.detail->>'outcome') is distinct from (cur.stage, cur.outcome) as moved,
        exists (
          select 1 from public.practice_notices newer
          where newer.case_id = n.case_id and newer.area = n.area and newer.kind = 'stage_changed'
            and newer.status not in ('cancelled', 'superseded', 'failed')
            and (newer.detail->>'stage', newer.detail->>'outcome') is not distinct from (cur.stage, cur.outcome)
            and (newer.created_at, newer.id) > (n.created_at, n.id)) as replaced,
        n.detail->>'message' is null and told.stage is not null
          and (n.detail->>'stage', n.detail->>'outcome') is not distinct from (told.stage, told.outcome)
          as repeated
    ) f
    where n.kind = 'stage_changed' and n.status in ('pending', 'retry')
      and (f.moved or f.replaced or f.repeated)
    for update of n skip locked
  )
  update public.practice_notices n
    set status = 'superseded', failure_code = s.reason, claim_id = null, claim_expires_at = null
    from stale s where n.id = s.id;

  update public.practice_notices
    set status = 'indeterminate', failure_code = 'idempotency_window_elapsed',
        claim_id = null, claim_expires_at = null
    where status in ('retry', 'sending') and first_attempt_at <= clock_timestamp() - interval '23 hours'
      and (status <> 'sending' or claim_expires_at <= clock_timestamp());
  return query
  with candidates as (
    select id from public.practice_notices
    where ((status in ('pending', 'retry') and next_attempt_at <= clock_timestamp())
      or (status = 'sending' and claim_expires_at <= clock_timestamp()))
      and (first_attempt_at is null or first_attempt_at > clock_timestamp() - interval '23 hours')
    order by created_at, id limit p_limit for update skip locked
  )
  update public.practice_notices a
    set status = 'sending', claim_id = gen_random_uuid(),
        claim_expires_at = clock_timestamp() + interval '3 minutes',
        first_attempt_at = coalesce(first_attempt_at, clock_timestamp()),
        attempt_count = attempt_count + 1, failure_code = null
    from candidates c where a.id = c.id returning a.*;
end $$;

-- Freezes the rendered email on first use (retries resend the same bytes).
-- Payload: from, to (1..5, each one of the notice recipients, optionally as
-- "Name <address>"), subject, html; reply_to and text optional.
create function public.freeze_practice_notice(p_id uuid, p_claim_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_recipients text[];
  frozen jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'PRACTICE_NOTICE_PAYLOAD_INVALID';
  end if;
  if jsonb_typeof(p_payload->'from') is distinct from 'string' or btrim(p_payload->>'from') = ''
     or jsonb_typeof(p_payload->'subject') is distinct from 'string' or btrim(p_payload->>'subject') = ''
     or jsonb_typeof(p_payload->'html') is distinct from 'string' or btrim(p_payload->>'html') = ''
     or jsonb_typeof(p_payload->'to') is distinct from 'array'
     or jsonb_typeof(p_payload->'text') not in ('string', 'null')
     or jsonb_typeof(p_payload->'reply_to') not in ('string', 'array', 'null') then
    raise exception 'PRACTICE_NOTICE_PAYLOAD_INVALID';
  end if;
  if jsonb_array_length(p_payload->'to') not between 1 and 5
     or exists (select 1 from jsonb_array_elements(p_payload->'to') t where jsonb_typeof(t.value) <> 'string')
     or (jsonb_typeof(p_payload->'reply_to') = 'array' and (jsonb_array_length(p_payload->'reply_to') not between 1 and 5
       or exists (select 1 from jsonb_array_elements(p_payload->'reply_to') r where jsonb_typeof(r.value) <> 'string'))) then
    raise exception 'PRACTICE_NOTICE_PAYLOAD_INVALID';
  end if;

  select n.recipients into v_recipients from public.practice_notices n
    where n.id = p_id and n.claim_id = p_claim_id and n.status = 'sending'
      and n.claim_expires_at > clock_timestamp()
    for update;
  if not found then
    raise exception 'PRACTICE_NOTICE_CLAIM_LOST';
  end if;
  -- A rendering bug must never email anyone but the notice's recipients.
  if exists (
    select 1 from jsonb_array_elements_text(p_payload->'to') t(address)
    where not (lower(btrim(coalesce(substring(t.address from '<([^<>]*)>[[:space:]]*$'), t.address)))
               = any (v_recipients))) then
    raise exception 'PRACTICE_NOTICE_PAYLOAD_INVALID';
  end if;

  update public.practice_notices n
    set email_payload = coalesce(n.email_payload, p_payload)
    where n.id = p_id
    returning n.email_payload into frozen;
  return frozen;
end $$;

create function public.finish_practice_notice(
  p_id uuid, p_claim_id uuid, p_status text,
  p_provider_email_id text default null, p_failure_code text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  affected integer;
begin
  if p_status is null or p_status not in ('sent', 'retry', 'failed') or
     (p_status = 'sent' and (coalesce(p_provider_email_id, '') = '' or p_failure_code is not null)) or
     (p_status <> 'sent' and coalesce(p_failure_code, '') !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'PRACTICE_NOTICE_OUTCOME_INVALID';
  end if;
  update public.practice_notices
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
-- Staff functions (authenticated). Each one checks ltb_can_access on the
-- target's practice and raises PRACTICE_CASE_NOT_FOUND otherwise, so a
-- non-member cannot tell a missing file from someone else's.
-- ---------------------------------------------------------------------------

-- Moves a file between stages in any area (replaces ltb_set_case_stage in the
-- AnderHue workspace). Calling with the current stage changes nothing, except
-- that a closed file's outcome can be corrected; with p_notify the client gets
-- a fresh update with the corrected outcome (the queued or sent one with the
-- old outcome is superseded or outdated by it).
create function public.practice_set_stage(
  p_area text, p_case_id uuid, p_stage text, p_outcome text default null, p_note text default null,
  p_client_message text default null, p_notify boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case record;
  v_note text := public.practice_clean_text(p_note, 4000, true);
  v_message text := public.practice_clean_text(p_client_message, 4000, true);
  v_outcome text;
  v_changed_at timestamptz;
  v_notice_id uuid;
begin
  select * into v_case from public.practice_lock_case(p_area, p_case_id);
  if not found or not public.ltb_can_access(v_case.practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if p_stage is null or not (p_stage = any (public.practice_stages(p_area))) then
    raise exception 'PRACTICE_STAGE_INVALID';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'PRACTICE_NOTE_TOO_LONG';
  end if;
  if char_length(v_message) > 1000 then
    raise exception 'PRACTICE_MESSAGE_TOO_LONG';
  end if;
  if p_stage = 'closed' then
    if nullif(btrim(coalesce(p_outcome, '')), '') is null then
      raise exception 'PRACTICE_OUTCOME_REQUIRED';
    end if;
    if not (p_outcome = any (public.practice_outcomes(p_area))) then
      raise exception 'PRACTICE_OUTCOME_INVALID';
    end if;
    v_outcome := p_outcome;
  elsif p_stage = 'declined' then
    v_outcome := 'declined';
  end if;

  if v_case.stage = p_stage and v_case.outcome is not distinct from v_outcome then
    return jsonb_build_object('stage', v_case.stage, 'outcome', v_case.outcome, 'noticeId', null);
  end if;

  -- Read by practice_queue_stage_notice during the update, then cleared so
  -- nothing later in the same transaction inherits them.
  perform set_config('practice.client_message', coalesce(v_message, ''), true);
  perform set_config('practice.notify', case when coalesce(p_notify, true) then 'on' else 'off' end, true);
  if p_area = 'ltb' then
    update public.ltb_cases c set
      stage = p_stage,
      stage_changed_at = case when c.stage = p_stage then c.stage_changed_at else now() end,
      outcome = v_outcome,
      closed_at = case when p_stage in ('closed', 'declined') then coalesce(c.closed_at, now()) end
    where c.id = p_case_id
    returning c.stage_changed_at into v_changed_at;
  else
    update public.practice_matters m set
      stage = p_stage,
      stage_changed_at = case when m.stage = p_stage then m.stage_changed_at else now() end,
      outcome = v_outcome,
      closed_at = case when p_stage in ('closed', 'declined') then coalesce(m.closed_at, now()) end
    where m.id = p_case_id
    returning m.stage_changed_at into v_changed_at;
  end if;
  perform set_config('practice.client_message', '', true);
  perform set_config('practice.notify', '', true);

  if v_case.stage = p_stage then
    perform public.practice_log_event(p_area, p_case_id, v_case.practice_id, auth.uid(), 'outcome_changed',
      jsonb_strip_nulls(jsonb_build_object('stage', p_stage, 'outcome', v_outcome, 'note', v_note)));
    -- The stage did not move, so the stage trigger stays quiet; queue the
    -- corrected update here, keyed by the clock so each correction is new.
    if coalesce(p_notify, true) and p_stage = any (public.practice_notify_stages(p_area)) then
      v_notice_id := public.practice_enqueue_notice(v_case.practice_id, p_area, p_case_id, v_case.client_id,
        'stage_changed', format('stage/%s/%s/%s/%s', p_area, p_case_id, p_stage,
          public.practice_epoch_ms(clock_timestamp())),
        jsonb_strip_nulls(jsonb_build_object('stage', p_stage, 'outcome', v_outcome, 'message', v_message)),
        90, auth.uid());
    end if;
  else
    perform public.practice_log_event(p_area, p_case_id, v_case.practice_id, auth.uid(), 'stage_changed',
      jsonb_strip_nulls(jsonb_build_object('stage', p_stage, 'outcome', v_outcome, 'note', v_note)));
    -- A quiet move reports no notice, even one an earlier move left under the
    -- same key.
    if coalesce(p_notify, true) then
      select n.id into v_notice_id from public.practice_notices n
        where n.event_key = format('stage/%s/%s/%s/%s', p_area, p_case_id, p_stage,
          public.practice_epoch_ms(v_changed_at));
    end if;
  end if;
  return jsonb_build_object('stage', p_stage, 'outcome', v_outcome, 'noticeId', v_notice_id);
end $$;

-- Asks the client for documents through the portal. Returns the queued
-- notice id (null while client emails are switched off). Asking the client is
-- a staff decision that the file is real, so a held file enters the portal.
create function public.practice_request_documents(p_area text, p_case_id uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case record;
  v_message text := public.practice_clean_text(p_message, 4000, true);
begin
  select * into v_case from public.practice_lock_case(p_area, p_case_id);
  if not found or not public.ltb_can_access(v_case.practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if v_message is null then
    raise exception 'PRACTICE_MESSAGE_REQUIRED';
  end if;
  if char_length(v_message) > 1000 then
    raise exception 'PRACTICE_MESSAGE_TOO_LONG';
  end if;
  -- A closed file accepts no uploads, so it cannot ask for any.
  if v_case.stage in ('closed', 'declined') then
    raise exception 'PRACTICE_FILE_CLOSED';
  end if;

  if p_area = 'ltb' then
    update public.ltb_cases c set client_request_message = v_message, client_request_at = now(), portal_visible = true
      where c.id = p_case_id;
  else
    update public.practice_matters m set client_request_message = v_message, client_request_at = now(),
      portal_visible = true
      where m.id = p_case_id;
  end if;
  perform public.practice_log_event(p_area, p_case_id, v_case.practice_id, auth.uid(), 'documents_requested',
    jsonb_build_object('message', v_message));
  return public.practice_enqueue_notice(v_case.practice_id, p_area, p_case_id, v_case.client_id,
    'documents_requested', format('request/%s/%s/%s', p_area, p_case_id, public.practice_epoch_ms(now())),
    jsonb_build_object('message', v_message), 0, auth.uid());
end $$;

-- Closes the open request. A request email that has not gone out (pending or
-- waiting to retry) is cancelled with it.
create function public.practice_clear_request(p_area text, p_case_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case record;
begin
  select * into v_case from public.practice_lock_case(p_area, p_case_id);
  if not found or not public.ltb_can_access(v_case.practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if p_area = 'ltb' then
    update public.ltb_cases c set client_request_message = null, client_request_at = null
      where c.id = p_case_id and c.client_request_message is not null;
  else
    update public.practice_matters m set client_request_message = null, client_request_at = null
      where m.id = p_case_id and m.client_request_message is not null;
  end if;
  if found then
    update public.practice_notices n set status = 'cancelled', failure_code = 'request_cleared'
      where n.area = p_area and n.case_id = p_case_id and n.kind = 'documents_requested'
        and n.status in ('pending', 'retry');
    perform public.practice_log_event(p_area, p_case_id, v_case.practice_id, auth.uid(), 'request_cleared',
      '{}'::jsonb);
  end if;
end $$;

-- Registers a practice document. The staff app then uploads to the returned
-- path (allowed once by the storage policy) and calls
-- practice_staff_confirm_document.
create function public.practice_staff_add_document(
  p_area text, p_case_id uuid, p_name text, p_content_type text, p_size integer,
  p_kind text default null, p_share boolean default false
) returns table (document_id uuid, bucket text, storage_path text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case record;
  v_doc record;
  v_path text;
begin
  select * into v_case from public.practice_case_ref(p_area, p_case_id);
  if not found or not public.ltb_can_access(v_case.practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  select * into v_doc from public.practice_parse_documents(jsonb_build_array(jsonb_build_object(
    'contentType', p_content_type, 'size', p_size, 'name', p_name)), false);
  if v_doc.original_name is null or p_share is null then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;
  -- Document kinds per area (catalog DOCUMENT_KINDS).
  if p_kind is not null and not (p_kind = any (case p_area
      when 'ltb' then array['lease', 'rent_ledger', 'notice', 'government_id', 'ltb_document', 'other']
      when 'traffic' then array['ticket', 'court_document', 'disclosure', 'correspondence', 'government_id', 'other']
      else array['notice', 'court_document', 'correspondence', 'evidence', 'government_id', 'other'] end)) then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;

  v_path := p_case_id::text || '/' || v_doc.document_id::text || '.' || v_doc.extension;
  if p_area = 'ltb' then
    insert into public.ltb_case_documents (id, case_id, practice_id, storage_path, original_name, content_type,
      size_bytes, kind, extraction_status, uploaded_by, shared_with_client)
    values (v_doc.document_id, p_case_id, v_case.practice_id, v_path, v_doc.original_name, v_doc.content_type,
      v_doc.size_bytes, p_kind, 'skipped', 'staff', p_share);
  else
    insert into public.practice_matter_documents (id, matter_id, practice_id, storage_path, original_name,
      content_type, size_bytes, kind, extraction_status, uploaded_by, shared_with_client)
    values (v_doc.document_id, p_case_id, v_case.practice_id, v_path, v_doc.original_name, v_doc.content_type,
      v_doc.size_bytes, p_kind, 'skipped', 'staff', p_share);
  end if;
  return query select v_doc.document_id,
    case when p_area = 'ltb' then 'ltb-documents' else 'practice-documents' end, v_path;
end $$;

-- Marks a staff upload received once its object is in storage. A document
-- registered as shared is announced to the client (once per document, after
-- the 90-second undo window); sharing puts a held file into the portal.
create function public.practice_staff_confirm_document(p_area text, p_document_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doc record;
begin
  select * into v_doc from public.practice_lock_document(p_area, p_document_id);
  if not found or not public.ltb_can_access(v_doc.practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if v_doc.uploaded_by <> 'staff' or v_doc.uploaded_at is not null then
    return false;
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = case when p_area = 'ltb' then 'ltb-documents' else 'practice-documents' end
                   and o.name = v_doc.storage_path) then
    raise exception 'PRACTICE_UPLOAD_MISSING';
  end if;

  if p_area = 'ltb' then
    update public.ltb_case_documents d set uploaded_at = now() where d.id = p_document_id;
  else
    update public.practice_matter_documents d set uploaded_at = now() where d.id = p_document_id;
  end if;
  perform public.practice_log_event(p_area, v_doc.case_id, v_doc.practice_id, auth.uid(), 'staff_uploaded',
    jsonb_strip_nulls(jsonb_build_object('documentId', p_document_id, 'documentName', v_doc.original_name)));
  if v_doc.shared_with_client then
    perform public.practice_reveal_file(p_area, v_doc.case_id);
    perform public.practice_log_event(p_area, v_doc.case_id, v_doc.practice_id, auth.uid(), 'document_shared',
      jsonb_strip_nulls(jsonb_build_object('documentId', p_document_id, 'documentName', v_doc.original_name)));
    perform public.practice_enqueue_notice(v_doc.practice_id, p_area, v_doc.case_id, null,
      'document_shared', 'shared/' || p_document_id,
      jsonb_strip_nulls(jsonb_build_object('documentId', p_document_id, 'documentName', v_doc.original_name)),
      90, auth.uid());
  end if;
  return true;
end $$;

-- Shares or unshares a practice document with the client. Returns whether the
-- flag changed. Client uploads are always visible to their client and cannot
-- be toggled. A share is announced once per document, 90 seconds later.
-- Unsharing withdraws an announcement that has not gone out (the email names
-- the document): a pending one is deleted, so a later share announces afresh;
-- one waiting to retry may already have been delivered, so it is cancelled and
-- keeps its key.
create function public.practice_set_document_shared(p_area text, p_document_id uuid, p_shared boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doc record;
begin
  select * into v_doc from public.practice_lock_document(p_area, p_document_id);
  if not found or not public.ltb_can_access(v_doc.practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if p_shared is null or v_doc.uploaded_by <> 'staff' then
    raise exception 'PRACTICE_DOCUMENT_INVALID';
  end if;
  if v_doc.shared_with_client = p_shared then
    return false;
  end if;

  if p_area = 'ltb' then
    update public.ltb_case_documents d set shared_with_client = p_shared where d.id = p_document_id;
  else
    update public.practice_matter_documents d set shared_with_client = p_shared where d.id = p_document_id;
  end if;
  if not p_shared then
    delete from public.practice_notices n
      where n.event_key = 'shared/' || p_document_id and n.status = 'pending';
    update public.practice_notices n set status = 'cancelled', failure_code = 'document_unshared'
      where n.event_key = 'shared/' || p_document_id and n.status = 'retry';
    perform public.practice_log_event(p_area, v_doc.case_id, v_doc.practice_id, auth.uid(), 'document_unshared',
      jsonb_build_object('documentId', p_document_id));
  elsif v_doc.uploaded_at is not null then
    perform public.practice_reveal_file(p_area, v_doc.case_id);
    perform public.practice_log_event(p_area, v_doc.case_id, v_doc.practice_id, auth.uid(), 'document_shared',
      jsonb_strip_nulls(jsonb_build_object('documentId', p_document_id, 'documentName', v_doc.original_name)));
    perform public.practice_enqueue_notice(v_doc.practice_id, p_area, v_doc.case_id, null,
      'document_shared', 'shared/' || p_document_id,
      jsonb_strip_nulls(jsonb_build_object('documentId', p_document_id, 'documentName', v_doc.original_name)),
      90, auth.uid());
  end if;
  return true;
end $$;

-- Stops a client email that has not gone out (pending, or waiting to retry).
-- Returns false for staff alerts and anything being sent, sent or closed.
create function public.practice_cancel_notice(p_notice_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_notice record;
begin
  select n.practice_id, n.area, n.case_id, n.audience, n.status, n.kind into v_notice
    from public.practice_notices n where n.id = p_notice_id for update;
  if not found or not public.ltb_can_access(v_notice.practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if v_notice.audience <> 'client' or v_notice.status not in ('pending', 'retry') then
    return false;
  end if;
  update public.practice_notices n set status = 'cancelled', failure_code = 'cancelled_by_staff'
    where n.id = p_notice_id;
  if v_notice.case_id is not null then
    perform public.practice_log_event(v_notice.area, v_notice.case_id, v_notice.practice_id, auth.uid(),
      'notice_cancelled', jsonb_build_object('noticeId', p_notice_id, 'kind', v_notice.kind));
  end if;
  return true;
end $$;

-- Staff-opened file for a phone or walk-in client, in any area. The client is
-- created or reused with the intake rules (source 'staff'); staff notes are
-- internal review notes. The file starts finalized in staff review. An
-- optional upload invite emails the client a portal link.
create function public.practice_create_matter(p_practice_id text, p_area text, p_client jsonb, p_details jsonb,
  p_send_invite boolean default false)
returns table (case_id uuid, case_number text, client_id uuid, notice_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_values jsonb := coalesce(p_details, '{}'::jsonb);
  v_email text;
  v_client record;
  v_details record;
  v_issue text;
  v_city text;
  v_notes text;
  v_case_id uuid;
  v_number text;
  v_notice_id uuid;
  v_from constant jsonb := '{"source":"staff"}';
begin
  if p_area is null or p_area not in ('ltb', 'traffic', 'general') then
    raise exception 'PRACTICE_AREA_INVALID';
  end if;
  if not exists (select 1 from public.ltb_practices p where p.id = p_practice_id)
     or not public.ltb_can_access(p_practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  if jsonb_typeof(p_client) is distinct from 'object' or jsonb_typeof(v_values) <> 'object' then
    raise exception 'PRACTICE_INTAKE_INVALID';
  end if;
  v_email := lower(btrim(coalesce(p_client->>'email', '')));
  if not public.practice_is_email(v_email) then
    raise exception 'PRACTICE_EMAIL_INVALID';
  end if;
  v_notes := public.practice_clean_text(v_values->>'notes', 2000, true);
  if p_area = 'ltb' then
    v_issue := coalesce(nullif(btrim(v_values->>'issue'), ''), 'other');
    if v_issue not in ('arrears', 'persistent_late', 'n12_own_use', 'n5_damage', 'n5_conduct', 'hearing_scheduled',
                       'other') then
      raise exception 'PRACTICE_INTAKE_INVALID';
    end if;
    v_city := public.practice_clean_text(v_values->>'city', 100);
  else
    select * into v_details from public.practice_parse_matter_details(p_area, v_values, 'staff');
  end if;

  select * into v_client from public.practice_upsert_client(p_practice_id, v_email,
    public.practice_clean_text(p_client->>'firstName', 100), public.practice_clean_text(p_client->>'lastName', 100),
    public.practice_clean_text(p_client->>'organizationName', 200), public.practice_clean_text(p_client->>'phone', 40),
    null, 'staff');

  if p_area = 'ltb' then
    insert into public.ltb_cases (practice_id, client_id, issue, unit_city, review_notes, field_sources,
      returning_client, source, intake_review_status, intake_finalized_at)
    values (p_practice_id, v_client.client_id, v_issue, v_city,
      left(nullif(concat_ws(E'\n', nullif(array_to_string(v_client.notes, E'\n'), ''), v_notes), ''), 4000),
      jsonb_strip_nulls(jsonb_build_object(
        'issue', case when v_values->>'issue' is not null then v_from end,
        'unit_city', case when v_city is not null then v_from end)),
      v_client.returning_client, 'staff', 'needs_review', now())
    returning ltb_cases.id, ltb_cases.case_number into v_case_id, v_number;
  else
    insert into public.practice_matters (practice_id, client_id, area, review_notes, field_sources,
      returning_client, source, intake_review_status, intake_finalized_at,
      ticket_type, ticket_city, ticket_received_on, option_chosen, option_deadline,
      category, deadline_date, other_party, client_city)
    values (p_practice_id, v_client.client_id, p_area,
      left(nullif(concat_ws(E'\n', nullif(array_to_string(v_client.notes, E'\n'), ''), v_notes,
        v_details.review_note), ''), 4000),
      v_details.field_sources, v_client.returning_client, 'staff', 'needs_review', now(),
      v_details.ticket_type, v_details.ticket_city, v_details.ticket_received_on, v_details.option_chosen,
      v_details.option_deadline, v_details.category, v_details.deadline_date, v_details.other_party,
      v_details.client_city)
    returning practice_matters.id, practice_matters.matter_number into v_case_id, v_number;
  end if;

  perform public.practice_log_event(p_area, v_case_id, p_practice_id, auth.uid(), 'intake_received',
    jsonb_build_object('returningClient', v_client.returning_client, 'documents', 0, 'source', 'staff'));
  if coalesce(p_send_invite, false) then
    v_notice_id := public.practice_enqueue_notice(p_practice_id, p_area, v_case_id, v_client.client_id,
      'upload_invite', format('invite/%s/%s', p_area, v_case_id), '{}'::jsonb, 0, auth.uid());
  end if;
  return query select v_case_id, v_number, v_client.client_id, v_notice_id;
end $$;

-- Invalidates every portal link issued so far for this client, and cancels
-- the client's emails that have not gone out (their links would be revoked
-- too). The client can still ask for a fresh link by email.
create function public.practice_revoke_portal_access(p_client_id uuid)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_practice_id text;
  v_revoked timestamptz;
begin
  select c.practice_id into v_practice_id from public.ltb_clients c where c.id = p_client_id for update;
  if not found or not public.ltb_can_access(v_practice_id) then
    raise exception 'PRACTICE_CASE_NOT_FOUND';
  end if;
  update public.ltb_clients c set portal_revoked_before = now() where c.id = p_client_id
    returning c.portal_revoked_before into v_revoked;
  update public.practice_notices n set status = 'cancelled', failure_code = 'portal_access_revoked'
    where n.client_id = p_client_id and n.audience = 'client' and n.status in ('pending', 'retry');
  insert into public.ltb_case_events (case_id, practice_id, actor_id, event, detail)
  select k.id, k.practice_id, auth.uid(), 'portal_access_revoked', '{}'::jsonb
  from public.ltb_cases k where k.client_id = p_client_id;
  insert into public.practice_matter_events (matter_id, practice_id, actor_id, event, detail)
  select m.id, m.practice_id, auth.uid(), 'portal_access_revoked', '{}'::jsonb
  from public.practice_matters m where m.client_id = p_client_id;
  return v_revoked;
end $$;

-- Corrects a client's email address (the column itself is not a staff
-- column: every address change must also cut off the old address). Links
-- already sent to the old address are revoked and emails not yet sent to it
-- are cancelled. Returns the stored, normalized address; setting the current
-- address again changes nothing.
create function public.practice_set_client_email(p_client_id uuid, p_email text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client public.ltb_clients%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select * into v_client from public.ltb_clients c where c.id = p_client_id for update;
  if not found or not public.ltb_can_access(v_client.practice_id) then
    raise exception 'PRACTICE_CLIENT_NOT_FOUND';
  end if;
  if not public.practice_is_email(v_email) then
    raise exception 'PRACTICE_EMAIL_INVALID';
  end if;
  if v_email = v_client.email then
    return v_email;
  end if;
  if exists (select 1 from public.ltb_clients c
             where c.practice_id = v_client.practice_id and c.email = v_email and c.id <> p_client_id) then
    raise exception 'PRACTICE_EMAIL_TAKEN';
  end if;
  begin
    update public.ltb_clients c set
      email = v_email,
      portal_revoked_before = now(),
      field_sources = c.field_sources || jsonb_build_object('email', jsonb_build_object('source', 'staff'))
    where c.id = p_client_id;
  exception when unique_violation then
    raise exception 'PRACTICE_EMAIL_TAKEN';
  end;
  update public.practice_notices n set status = 'cancelled', failure_code = 'client_email_changed'
    where n.client_id = p_client_id and n.audience = 'client' and n.status in ('pending', 'retry');
  return v_email;
end $$;

-- Storage INSERT check for staff uploads: only a registered staff document
-- that has not been uploaded yet, on a file the user can access.
create function public.practice_staff_can_upload(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_bucket = 'ltb-documents' then
    return exists (
      select 1 from public.ltb_case_documents d
      where d.storage_path = p_name and d.uploaded_by = 'staff' and d.uploaded_at is null
        and public.ltb_can_access(d.practice_id));
  elsif p_bucket = 'practice-documents' then
    return exists (
      select 1 from public.practice_matter_documents d
      where d.storage_path = p_name and d.uploaded_by = 'staff' and d.uploaded_at is null
        and public.ltb_can_access(d.practice_id));
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------
alter table public.practice_matters enable row level security;
alter table public.practice_matter_documents enable row level security;
alter table public.practice_matter_events enable row level security;
alter table public.practice_notices enable row level security;
alter table public.practice_notices force row level security;
alter table public.practice_rate_limits enable row level security;
alter table public.practice_rate_limits force row level security;

revoke all on public.practice_matters, public.practice_matter_documents, public.practice_matter_events,
  public.practice_notices, public.practice_rate_limits from public, anon, authenticated;
-- File numbers are drawn only by practice_assign_matter_number (as owner) and
-- identity values need no sequence privilege, so nobody may move a sequence.
revoke all on sequence public.practice_traffic_number_seq, public.practice_general_number_seq,
  public.practice_matter_events_id_seq from public, anon, authenticated, service_role;

grant select on public.practice_matters, public.practice_matter_documents, public.practice_matter_events
  to authenticated;
-- The notice snapshot, rendered email and recipients hold the client's portal
-- link and contact details: staff see delivery status only.
grant select (id, practice_id, area, case_id, audience, kind, detail, status, next_attempt_at, sent_at,
  failure_code, created_at) on public.practice_notices to authenticated;
-- Staff may correct ticket and matter facts; stages, requests, documents and
-- notices change only through the staff functions.
grant update (ticket_type, ticket_city, ticket_received_on, option_chosen, offence_number, offence_date,
  offence_description, statute_section, set_fine_cents, total_payable_cents, court_location, option_deadline,
  disclosure_requested_on, meeting_date, trial_date, category, deadline_date, other_party, client_city,
  review_notes, field_sources, intake_review_status)
  on public.practice_matters to authenticated;

grant all on public.practice_matters, public.practice_matter_documents, public.practice_matter_events,
  public.practice_notices, public.practice_rate_limits to service_role;
grant usage, select on sequence public.practice_traffic_number_seq, public.practice_general_number_seq
  to service_role;

create policy "Practice members read matters" on public.practice_matters
  for select to authenticated using (public.ltb_can_access(practice_id));
create policy "Practice members correct matters" on public.practice_matters
  for update to authenticated using (public.ltb_can_access(practice_id))
  with check (public.ltb_can_access(practice_id) and intake_review_status in ('needs_review', 'ready'));
create policy "Practice members read matter documents" on public.practice_matter_documents
  for select to authenticated using (public.ltb_can_access(practice_id));
create policy "Practice members read matter events" on public.practice_matter_events
  for select to authenticated using (public.ltb_can_access(practice_id));
create policy "Practice members read notice status" on public.practice_notices
  for select to authenticated using (public.ltb_can_access(practice_id));

-- Functions: nothing is executable by default; each role gets exactly its own.
revoke all on function public.practice_format_number(text, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_stages(text) from public, anon, authenticated, service_role;
revoke all on function public.practice_notify_stages(text) from public, anon, authenticated, service_role;
revoke all on function public.practice_outcomes(text) from public, anon, authenticated, service_role;
revoke all on function public.practice_is_email(text) from public, anon, authenticated, service_role;
revoke all on function public.practice_valid_recipients(text[]) from public, anon, authenticated, service_role;
revoke all on function public.practice_clean_text(text, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_parse_date(text) from public, anon, authenticated, service_role;
revoke all on function public.practice_parse_documents(jsonb, boolean) from public, anon, authenticated, service_role;
revoke all on function public.practice_parse_matter_details(text, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_epoch_ms(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.practice_case_ref(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_lock_case(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_lock_document(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_reveal_file(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_log_event(text, uuid, text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_upsert_client(text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_notice_snapshot(text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_enqueue_notice(text, text, uuid, uuid, text, text, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_assign_matter_number() from public, anon, authenticated, service_role;
revoke all on function public.practice_guard_matter_identity() from public, anon, authenticated, service_role;
revoke all on function public.practice_log_matter_edit() from public, anon, authenticated, service_role;
revoke all on function public.practice_queue_stage_notice() from public, anon, authenticated, service_role;
revoke all on function public.practice_queue_intake_receipt() from public, anon, authenticated, service_role;
revoke all on function public.practice_queue_staff_intake_notice() from public, anon, authenticated, service_role;
revoke all on function public.practice_hold_returning_intake() from public, anon, authenticated, service_role;
revoke all on function public.practice_reveal_on_stage() from public, anon, authenticated, service_role;

revoke all on function public.practice_register_intake(text, text, jsonb, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_finalize_intake(uuid, text, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.practice_claim_intake_scan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_sweep_stalled_intakes() from public, anon, authenticated, service_role;
revoke all on function public.practice_portal_session(uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_portal_file(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_portal_register_uploads(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_portal_confirm_uploads(uuid, text, uuid, uuid[], text)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_portal_document(uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_request_portal_link(text, text) from public, anon, authenticated, service_role;
revoke all on function public.claim_practice_notices(integer) from public, anon, authenticated, service_role;
revoke all on function public.freeze_practice_notice(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_practice_notice(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_rate_limit_hit(text, integer, integer)
  from public, anon, authenticated, service_role;

revoke all on function public.practice_set_stage(text, uuid, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_request_documents(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_clear_request(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_staff_add_document(text, uuid, text, text, integer, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_staff_confirm_document(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_set_document_shared(text, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_cancel_notice(uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_create_matter(text, text, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.practice_revoke_portal_access(uuid) from public, anon, authenticated, service_role;
revoke all on function public.practice_set_client_email(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.practice_staff_can_upload(text, text) from public, anon, authenticated, service_role;

-- Service role: edge functions, plus what direct service-role writes evaluate
-- (the ltb_cases.case_number default and the recipients CHECK).
grant execute on function public.practice_format_number(text, text, bigint) to service_role;
grant execute on function public.practice_valid_recipients(text[]) to service_role;
grant execute on function public.practice_case_ref(text, uuid) to service_role;
grant execute on function public.practice_notice_snapshot(text, uuid, uuid) to service_role;
grant execute on function public.practice_enqueue_notice(text, text, uuid, uuid, text, text, jsonb, integer, uuid)
  to service_role;
grant execute on function public.practice_register_intake(text, text, jsonb, text, jsonb) to service_role;
grant execute on function public.practice_finalize_intake(uuid, text, uuid[]) to service_role;
grant execute on function public.practice_claim_intake_scan(uuid) to service_role;
grant execute on function public.practice_sweep_stalled_intakes() to service_role;
grant execute on function public.practice_portal_session(uuid) to service_role;
grant execute on function public.practice_portal_file(uuid, text, uuid) to service_role;
grant execute on function public.practice_portal_register_uploads(uuid, text, uuid, jsonb) to service_role;
grant execute on function public.practice_portal_confirm_uploads(uuid, text, uuid, uuid[], text) to service_role;
grant execute on function public.practice_portal_document(uuid, text, uuid, uuid) to service_role;
grant execute on function public.practice_request_portal_link(text, text) to service_role;
grant execute on function public.claim_practice_notices(integer) to service_role;
grant execute on function public.freeze_practice_notice(uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_practice_notice(uuid, uuid, text, text, text) to service_role;
grant execute on function public.practice_rate_limit_hit(text, integer, integer) to service_role;

-- Staff (signed-in practice members; every function checks ltb_can_access).
grant execute on function public.practice_set_stage(text, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.practice_request_documents(text, uuid, text) to authenticated;
grant execute on function public.practice_clear_request(text, uuid) to authenticated;
grant execute on function public.practice_staff_add_document(text, uuid, text, text, integer, text, boolean)
  to authenticated;
grant execute on function public.practice_staff_confirm_document(text, uuid) to authenticated;
grant execute on function public.practice_set_document_shared(text, uuid, boolean) to authenticated;
grant execute on function public.practice_cancel_notice(uuid) to authenticated;
grant execute on function public.practice_create_matter(text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.practice_revoke_portal_access(uuid) to authenticated;
grant execute on function public.practice_set_client_email(uuid, text) to authenticated;
grant execute on function public.practice_staff_can_upload(text, text) to authenticated;

comment on table public.practice_matters is
  'Practice files for Ontario traffic tickets and other paralegal matters. Practice data processed by Fabsy as software vendor; not Fabsy Alberta clients.';
comment on table public.practice_notices is
  'Per-practice email outbox for client updates and staff alerts. Snapshot and payload hold client contact details and portal links; staff may read delivery status only.';
comment on table public.practice_rate_limits is
  'Fixed-window counters for the public practice edge functions, keyed by a hash; no raw network addresses. Service role only.';

-- ---------------------------------------------------------------------------
-- Private document storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-documents', 'practice-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Practice members read practice documents" on storage.objects;
create policy "Practice members read practice documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'practice-documents' and exists (
      select 1 from public.practice_matter_documents d
      where d.storage_path = storage.objects.name and public.ltb_can_access(d.practice_id)
    )
  );

-- Staff upload once to a path registered by practice_staff_add_document.
-- Client uploads never use this: they go through service-role signed URLs.
drop policy if exists "Practice staff upload registered documents" on storage.objects;
create policy "Practice staff upload registered documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('ltb-documents', 'practice-documents')
    and public.practice_staff_can_upload(bucket_id, name)
  );

-- ---------------------------------------------------------------------------
-- Notice worker schedule (same private scheduler credential as the LTB alert
-- worker; skipped where pg_cron, pg_net or the vault secrets are missing)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron')
    and exists(select 1 from pg_extension where extname = 'pg_net')
    and exists(select 1 from pg_namespace where nspname = 'vault') then
    if exists(select 1 from vault.secrets where name = 'idr_project_url')
      and exists(select 1 from vault.secrets where name = 'idr_cron_secret') then
      perform cron.schedule('anderhue-practice-notices', '* * * * *', $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'idr_project_url') || '/functions/v1/process-practice-notices',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'idr_cron_secret')),
          body := '{}'::jsonb, timeout_milliseconds := 150000
        );
      $job$);
    end if;
  end if;
end $$;

commit;
