-- Add a structured, client-editable IDR intake while keeping ownership,
-- payment state, review state, and storage replacement rules server-enforced.

alter table public.idr_orders
  add column if not exists intake_json jsonb,
  add column if not exists intake_completed_at timestamptz,
  add column if not exists delivery_claim_token uuid,
  add column if not exists delivery_claimed_at timestamptz;

alter table public.abstracts
  add column if not exists review_started_at timestamptz,
  add column if not exists review_started_by uuid references auth.users(id) on delete set null,
  add column if not exists review_version bigint not null default 0;

alter table public.abstracts
  drop constraint if exists abstracts_review_version_check;
alter table public.abstracts
  add constraint abstracts_review_version_check check (review_version >= 0);

alter table public.idr_reports
  add column if not exists source_review_version bigint;

alter table public.idr_reports
  drop constraint if exists idr_reports_source_review_version_check;
alter table public.idr_reports
  add constraint idr_reports_source_review_version_check
  check (source_review_version is null or source_review_version >= 0);

alter table public.idr_orders
  drop constraint if exists idr_orders_delivery_claim_pair_check;
alter table public.idr_orders
  add constraint idr_orders_delivery_claim_pair_check check (
    (delivery_claim_token is null and delivery_claimed_at is null) or
    (delivery_claim_token is not null and delivery_claimed_at is not null)
  );

create or replace function public.is_valid_idr_iso_date(_value text)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  parsed_value date;
begin
  if _value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  begin
    parsed_value := _value::date;
  exception
    when others then
      return false;
  end;

  return to_char(parsed_value, 'YYYY-MM-DD') = _value;
end;
$$;

create or replace function public.is_valid_idr_intake(_intake jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  ticket jsonb;
  rating_inputs jsonb;
  grid_step_value numeric;
  liability_limit_value numeric;
  criminal_convictions_value numeric;
  at_fault_claims_value numeric;
  annual_premium_value numeric;
begin
  if jsonb_typeof(_intake) <> 'object' or
     octet_length(_intake::text) > 20480 then
    return false;
  end if;

  if not (_intake ?& array[
    'schema_version',
    'ticket',
    'policy_renewal_date',
    'rating_inputs',
    'source_acknowledgement'
  ]::text[]) or
     (_intake - array[
       'schema_version',
       'ticket',
       'policy_renewal_date',
       'rating_inputs',
       'source_acknowledgement'
     ]::text[]) <> '{}'::jsonb then
    return false;
  end if;

  if jsonb_typeof(_intake -> 'schema_version') <> 'number' or
     (_intake -> 'schema_version') <> '1'::jsonb or
     jsonb_typeof(_intake -> 'source_acknowledgement') <> 'boolean' or
     (_intake -> 'source_acknowledgement') <> 'true'::jsonb or
     jsonb_typeof(_intake -> 'policy_renewal_date') <> 'string' or
     not public.is_valid_idr_iso_date(_intake ->> 'policy_renewal_date') then
    return false;
  end if;

  ticket := _intake -> 'ticket';
  if jsonb_typeof(ticket) <> 'object' or
     not (ticket ?& array['offence', 'scenario_mode']::text[]) or
     (ticket - array[
       'ticket_number',
       'offence',
       'section',
       'occurrence_date',
       'issue_date',
       'location',
       'scenario_mode'
     ]::text[]) <> '{}'::jsonb then
    return false;
  end if;

  if jsonb_typeof(ticket -> 'offence') <> 'string' or
     char_length(btrim(ticket ->> 'offence')) not between 1 and 200 or
     jsonb_typeof(ticket -> 'scenario_mode') <> 'string' or
     (ticket ->> 'scenario_mode') not in ('listed', 'projected') then
    return false;
  end if;

  if ticket ? 'ticket_number' and
     (
       jsonb_typeof(ticket -> 'ticket_number') <> 'string' or
       char_length(btrim(ticket ->> 'ticket_number')) not between 1 and 200
     ) then
    return false;
  end if;

  if ticket ? 'section' and
     (
       jsonb_typeof(ticket -> 'section') <> 'string' or
       char_length(btrim(ticket ->> 'section')) not between 1 and 200
     ) then
    return false;
  end if;

  if ticket ? 'location' and
     (
       jsonb_typeof(ticket -> 'location') <> 'string' or
       char_length(btrim(ticket ->> 'location')) not between 1 and 200
     ) then
    return false;
  end if;

  if ticket ? 'occurrence_date' and
     (
       jsonb_typeof(ticket -> 'occurrence_date') <> 'string' or
       not public.is_valid_idr_iso_date(ticket ->> 'occurrence_date')
     ) then
    return false;
  end if;

  if ticket ? 'issue_date' and
     (
       jsonb_typeof(ticket -> 'issue_date') <> 'string' or
       not public.is_valid_idr_iso_date(ticket ->> 'issue_date')
     ) then
    return false;
  end if;

  rating_inputs := _intake -> 'rating_inputs';
  if jsonb_typeof(rating_inputs) <> 'object' or
     not (rating_inputs ?& array[
       'grid_step',
       'territory_code',
       'liability_limit_cents',
       'criminal_convictions',
       'at_fault_claims'
     ]::text[]) or
     (rating_inputs - array[
       'annual_premium_cents',
       'grid_step',
       'territory_code',
       'liability_limit_cents',
       'criminal_convictions',
       'at_fault_claims'
     ]::text[]) <> '{}'::jsonb then
    return false;
  end if;

  if jsonb_typeof(rating_inputs -> 'grid_step') <> 'number' or
     jsonb_typeof(rating_inputs -> 'territory_code') <> 'string' or
     jsonb_typeof(rating_inputs -> 'liability_limit_cents') <> 'number' or
     jsonb_typeof(rating_inputs -> 'criminal_convictions') <> 'number' or
     jsonb_typeof(rating_inputs -> 'at_fault_claims') <> 'number' or
     (rating_inputs ->> 'territory_code') not in (
       'calgary-edmonton',
       'northern-alberta',
       'rest-of-alberta'
     ) then
    return false;
  end if;

  if rating_inputs ? 'annual_premium_cents' and
     jsonb_typeof(rating_inputs -> 'annual_premium_cents') <> 'number' then
    return false;
  end if;

  begin
    grid_step_value := (rating_inputs ->> 'grid_step')::numeric;
    liability_limit_value := (rating_inputs ->> 'liability_limit_cents')::numeric;
    criminal_convictions_value := (rating_inputs ->> 'criminal_convictions')::numeric;
    at_fault_claims_value := (rating_inputs ->> 'at_fault_claims')::numeric;

    if rating_inputs ? 'annual_premium_cents' then
      annual_premium_value := (rating_inputs ->> 'annual_premium_cents')::numeric;
    else
      annual_premium_value := null;
    end if;
  exception
    when others then
      return false;
  end;

  if grid_step_value <> trunc(grid_step_value) or
     grid_step_value not between -15 and 100 or
     liability_limit_value <> trunc(liability_limit_value) or
     liability_limit_value not in (
       20000000,
       25000000,
       30000000,
       40000000,
       50000000,
       75000000,
       100000000,
       200000000
     ) or
     criminal_convictions_value <> trunc(criminal_convictions_value) or
     criminal_convictions_value not between 0 and 99 or
     at_fault_claims_value <> trunc(at_fault_claims_value) or
     at_fault_claims_value not between 0 and 99 or
     (
       annual_premium_value is not null and
       (
         annual_premium_value <> trunc(annual_premium_value) or
         annual_premium_value not between 1 and 100000000
       )
     ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_valid_idr_iso_date(text) from public;
grant execute on function public.is_valid_idr_iso_date(text) to authenticated, service_role;
revoke all on function public.is_valid_idr_intake(jsonb) from public;
grant execute on function public.is_valid_idr_intake(jsonb) to authenticated, service_role;

alter table public.idr_orders
  drop constraint if exists idr_orders_intake_json_check;
alter table public.idr_orders
  add constraint idr_orders_intake_json_check
  check (intake_json is null or public.is_valid_idr_intake(intake_json));

alter table public.idr_orders
  drop constraint if exists idr_orders_intake_completion_check;
alter table public.idr_orders
  add constraint idr_orders_intake_completion_check
  check (intake_completed_at is null or intake_json is not null);

create or replace function public.protect_client_idr_intake_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not coalesce(public.is_idr_staff(), false) then
    -- An abstract upload promotes the order through the existing security-
    -- definer trigger. Permit only that exact nested state transition.
    if pg_trigger_depth() > 1 and
       old.status in ('paid', 'awaiting_abstract') and
       new.status = 'in_review' and
       (to_jsonb(new) - array['status', 'updated_at']::text[]) =
         (to_jsonb(old) - array['status', 'updated_at']::text[]) and
       exists (
         select 1
         from public.abstracts a
         where a.idr_order_id = old.id
       ) then
      return new;
    end if;

    if auth.uid() is null or not public.client_owns_idr_order(old.id) then
      raise exception 'Clients can update only their own IDR intake.';
    end if;

    if old.status not in ('paid', 'awaiting_abstract') then
      raise exception 'This IDR intake can no longer be changed.';
    end if;

    if (to_jsonb(new) - array[
      'intake_json',
      'intake_completed_at',
      'updated_at'
    ]::text[]) is distinct from
       (to_jsonb(old) - array[
         'intake_json',
         'intake_completed_at',
         'updated_at'
       ]::text[]) then
      raise exception 'Clients can update only IDR intake fields.';
    end if;

    if new.intake_json is not null and
       not public.is_valid_idr_intake(new.intake_json) then
      raise exception 'The IDR intake is invalid.';
    end if;

    if new.intake_json is distinct from old.intake_json then
      new.intake_completed_at := case
        when new.intake_json is null then null
        else now()
      end;
    else
      new.intake_completed_at := old.intake_completed_at;
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists protect_client_idr_intake_update on public.idr_orders;
create trigger protect_client_idr_intake_update
  before update on public.idr_orders
  for each row execute function public.protect_client_idr_intake_update();

drop policy if exists "Clients can update their IDR intake" on public.idr_orders;
create policy "Clients can update their IDR intake"
  on public.idr_orders for update to authenticated
  using (
    status in ('paid', 'awaiting_abstract') and
    public.client_owns_idr_order(id)
  )
  with check (
    status in ('paid', 'awaiting_abstract') and
    public.client_owns_idr_order(id)
  );

-- One review-state predicate now governs storage inserts, storage deletes, and
-- abstract row registration/replacement. This prevents a second client upload
-- after parsing or review has started while still permitting orphan cleanup.
create or replace function public.client_can_replace_idr_abstract(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.client_can_write_idr_order(_order_id) and exists (
    select 1
    from public.idr_orders io
    where io.id = _order_id
      and io.intake_completed_at is not null
      and io.intake_json is not null
      and public.is_valid_idr_intake(io.intake_json)
  ) and not exists (
    select 1
    from public.abstracts a
    where a.idr_order_id = _order_id
      and (
        a.parsed_json is not null or
        a.parse_status = 'parsed' or
        a.reviewed_by is not null or
        a.reviewed_at is not null or
        a.review_started_at is not null or
        a.review_started_by is not null
      )
  )
$$;

create or replace function public.client_can_replace_idr_abstract_path(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  order_segment text;
  order_id uuid;
begin
  order_segment := (storage.foldername(_name))[1];
  if order_segment is null or
     order_segment !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
     _name !~ (
       '^' || order_segment ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
     ) then
    return false;
  end if;

  order_id := order_segment::uuid;
  if order_segment <> order_id::text then
    return false;
  end if;
  return public.client_can_replace_idr_abstract(order_id);
end;
$$;

-- Storage upload and abstract registration are separate HTTP requests. Limit
-- each order folder to a small number of objects and serialize the count so a
-- client cannot accumulate an unbounded set of sensitive orphaned uploads.
create or replace function public.client_can_upload_idr_abstract_path(_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, storage
as $$
declare
  order_segment text;
  order_id uuid;
  object_count integer;
begin
  if not public.client_can_replace_idr_abstract_path(_name) then
    return false;
  end if;

  order_segment := (storage.foldername(_name))[1];
  order_id := order_segment::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('idr-abstract-upload:' || order_id::text, 0)
  );

  select count(*)::integer
  into object_count
  from storage.objects so
  where so.bucket_id = 'idr-abstracts'
    and so.name like order_id::text || '/%';

  return object_count < 5;
end;
$$;

-- Retain the earlier helper name and also permit cleanup of an unreferenced
-- object if staff begins review between the storage upload and row upsert.
create or replace function public.client_can_delete_replaceable_idr_abstract_path(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  order_segment text;
  order_id uuid;
begin
  order_segment := (storage.foldername(_name))[1];
  if order_segment is null or
     order_segment !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
     _name !~ (
       '^' || order_segment ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
     ) then
    return false;
  end if;

  order_id := order_segment::uuid;
  if order_segment <> order_id::text then
    return false;
  end if;
  return public.client_owns_idr_order(order_id) and not exists (
    select 1
    from public.abstracts a
    where a.idr_order_id = order_id
      and a.file_url = _name
  );
end;
$$;

revoke all on function public.client_can_replace_idr_abstract(uuid) from public;
grant execute on function public.client_can_replace_idr_abstract(uuid) to authenticated, service_role;
revoke all on function public.client_can_replace_idr_abstract_path(text) from public;
grant execute on function public.client_can_replace_idr_abstract_path(text) to authenticated, service_role;
revoke all on function public.client_can_upload_idr_abstract_path(text) from public;
grant execute on function public.client_can_upload_idr_abstract_path(text) to authenticated, service_role;
revoke all on function public.client_can_delete_replaceable_idr_abstract_path(text) from public;
grant execute on function public.client_can_delete_replaceable_idr_abstract_path(text) to authenticated, service_role;

create or replace function public.protect_client_abstract_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not coalesce(public.is_idr_staff(), false) then
    if not public.client_can_replace_idr_abstract(new.idr_order_id) then
      raise exception 'This abstract can no longer be replaced.';
    end if;

    if new.file_url !~ (
      '^' || new.idr_order_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
    ) then
      raise exception 'The abstract storage path is invalid.';
    end if;

    if tg_op = 'INSERT' then
      new.parsed_json := null;
      new.parse_status := 'manual_review';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_started_at := null;
      new.review_started_by := null;
      new.review_version := 0;
      new.uploaded_at := now();
    else
      if old.parsed_json is not null or
         old.parse_status = 'parsed' or
         old.reviewed_by is not null or
         old.reviewed_at is not null or
         old.review_started_at is not null or
         old.review_started_by is not null then
        raise exception 'This abstract can no longer be replaced.';
      end if;

      if (to_jsonb(new) - array['file_url', 'uploaded_at', 'review_version']::text[]) is distinct from
         (to_jsonb(old) - array['file_url', 'uploaded_at', 'review_version']::text[]) then
        raise exception 'Clients can update only the abstract file path.';
      end if;
      new.uploaded_at := now();
      new.review_version := old.review_version + 1;
    end if;
  end if;

  return new;
end;
$$;

-- Clients register a completed storage upload through one serialized function.
-- Direct table writes stay unavailable, so concurrent tabs cannot overwrite the
-- source row without receiving the path that they superseded.
create or replace function public.register_idr_abstract_upload(
  p_order_id uuid,
  p_file_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  caller_id uuid := auth.uid();
  locked_order_id uuid;
  existing_abstract public.abstracts%rowtype;
  registered_abstract public.abstracts%rowtype;
  previous_file_url text;
  has_existing boolean;
begin
  if auth.role() <> 'authenticated' or caller_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_order_id is null or p_file_url is null or p_file_url !~ (
    '^' || p_order_id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
  ) then
    raise exception 'The abstract storage path is invalid.';
  end if;

  select io.id
  into locked_order_id
  from public.idr_orders io
  join public.clients c on c.id = io.client_id
  where io.id = p_order_id
    and c.auth_user_id = caller_id
  for update of io;

  if not found then
    raise exception 'The IDR order was not found or is not owned by this account.';
  end if;

  if not public.client_can_replace_idr_abstract(p_order_id) then
    raise exception 'Fabsy has started reviewing this abstract, so it can no longer be replaced.';
  end if;

  perform 1
  from storage.objects so
  where so.bucket_id = 'idr-abstracts'
    and so.name = p_file_url
  for share;
  if not found then
    raise exception 'The uploaded abstract object was not found.';
  end if;

  select a.*
  into existing_abstract
  from public.abstracts a
  where a.idr_order_id = p_order_id
  for update;
  has_existing := found;

  if has_existing then
    previous_file_url := existing_abstract.file_url;
    update public.abstracts
    set file_url = p_file_url,
        parsed_json = null,
        parse_status = 'manual_review',
        reviewed_by = null,
        reviewed_at = null,
        review_started_at = null,
        review_started_by = null,
        uploaded_at = now()
    where id = existing_abstract.id
    returning * into registered_abstract;
  else
    insert into public.abstracts (
      idr_order_id,
      file_url,
      parsed_json,
      parse_status,
      reviewed_by,
      reviewed_at,
      review_started_at,
      review_started_by,
      uploaded_at
    ) values (
      p_order_id,
      p_file_url,
      null,
      'manual_review',
      null,
      null,
      null,
      null,
      now()
    )
    returning * into registered_abstract;
  end if;

  return jsonb_build_object(
    'abstract_id', registered_abstract.id,
    'file_url', registered_abstract.file_url,
    'previous_file_url', previous_file_url,
    'parse_status', registered_abstract.parse_status,
    'uploaded_at', registered_abstract.uploaded_at,
    'review_version', registered_abstract.review_version
  );
end;
$$;

-- Claiming review freezes the source path before staff receives a signed URL.
-- Repeated claims are idempotent, and delivered orders remain immutable.
create or replace function public.claim_idr_abstract_review(p_abstract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_abstract public.abstracts%rowtype;
  order_status text;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null or
     not coalesce(public.is_idr_staff(), false) then
    raise exception 'An IDR staff role is required.';
  end if;

  select a.*
  into claimed_abstract
  from public.abstracts a
  where a.id = p_abstract_id
  for update;

  if not found then
    raise exception 'The abstract was not found.';
  end if;

  select io.status
  into order_status
  from public.idr_orders io
  where io.id = claimed_abstract.idr_order_id;

  if order_status <> 'delivered' and
     claimed_abstract.review_started_by is not null and
     claimed_abstract.review_started_by <> auth.uid() then
    raise exception 'Another staff member has already claimed this abstract review.';
  end if;

  if order_status <> 'delivered' and (
    claimed_abstract.review_started_at is null or
    claimed_abstract.review_started_by is null
  ) then
    update public.abstracts
    set review_started_at = coalesce(review_started_at, now()),
        review_started_by = auth.uid()
    where id = claimed_abstract.id
    returning * into claimed_abstract;
  end if;

  return jsonb_build_object(
    'id', claimed_abstract.id,
    'file_url', claimed_abstract.file_url,
    'review_started_at', claimed_abstract.review_started_at,
    'review_started_by', claimed_abstract.review_started_by,
    'review_version', claimed_abstract.review_version
  );
end;
$$;

-- Save the reviewed transcription, report source, and order state in one
-- transaction. The claim owner and optimistic review version prevent two
-- staff sessions from interleaving different transcription/report pairs.
create or replace function public.save_idr_report_review(
  p_order_id uuid,
  p_abstract_id uuid,
  p_expected_file_url text,
  p_expected_review_version bigint,
  p_transcription jsonb,
  p_report_json jsonb,
  p_renewal_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_order public.idr_orders%rowtype;
  locked_abstract public.abstracts%rowtype;
  existing_report_id uuid;
  saved_at timestamptz := now();
begin
  if auth.role() <> 'authenticated' or auth.uid() is null or
     not coalesce(public.is_idr_staff(), false) then
    raise exception 'An IDR staff role is required.';
  end if;

  if p_order_id is null or p_abstract_id is null or
     p_expected_file_url is null or p_expected_review_version is null or
     p_transcription is null or jsonb_typeof(p_transcription) <> 'object' or
     p_report_json is null or jsonb_typeof(p_report_json) <> 'object' or
     p_renewal_date is null then
    raise exception 'Complete review data is required.';
  end if;

  select io.*
  into locked_order
  from public.idr_orders io
  where io.id = p_order_id
  for update;

  if not found then
    raise exception 'The IDR order was not found.';
  end if;
  if locked_order.delivery_claim_token is not null then
    if locked_order.delivery_claimed_at >= now() - interval '30 minutes' then
      raise exception 'Report delivery is in progress. Wait for it to finish before saving another review.';
    end if;
    update public.idr_orders
    set delivery_claim_token = null,
        delivery_claimed_at = null
    where id = locked_order.id;
  end if;
  if locked_order.status = 'delivered' then
    raise exception 'Delivered reports are immutable.';
  end if;
  if locked_order.status not in ('paid', 'awaiting_abstract', 'in_review') then
    raise exception 'The IDR order is not available for review.';
  end if;

  select a.*
  into locked_abstract
  from public.abstracts a
  where a.id = p_abstract_id
    and a.idr_order_id = p_order_id
  for update;

  if not found then
    raise exception 'The abstract was not found for this order.';
  end if;
  if locked_abstract.file_url <> p_expected_file_url then
    raise exception 'The abstract source changed. Reload and review the current file.';
  end if;
  if locked_abstract.review_started_at is null or
     locked_abstract.review_started_by is distinct from auth.uid() then
    raise exception 'This staff account does not own the abstract review claim.';
  end if;
  if locked_abstract.review_version <> p_expected_review_version then
    raise exception 'The abstract review changed in another session. Reload before saving.';
  end if;

  select r.id
  into existing_report_id
  from public.idr_reports r
  where r.idr_order_id = p_order_id
  for update;

  update public.abstracts
  set parsed_json = p_transcription,
      parse_status = 'parsed',
      reviewed_by = auth.uid(),
      reviewed_at = saved_at,
      review_version = review_version + 1
  where id = locked_abstract.id
  returning * into locked_abstract;

  if existing_report_id is null then
    insert into public.idr_reports (
      idr_order_id,
      report_json,
      html_url,
      pdf_url,
      generated_at,
      renewal_date,
      next_reminder_at,
      source_review_version
    ) values (
      p_order_id,
      p_report_json,
      null,
      null,
      saved_at,
      p_renewal_date,
      null,
      locked_abstract.review_version
    );
  else
    update public.idr_reports
    set report_json = p_report_json,
        html_url = null,
        pdf_url = null,
        generated_at = saved_at,
        renewal_date = p_renewal_date,
        next_reminder_at = null,
        source_review_version = locked_abstract.review_version
    where id = existing_report_id;
  end if;

  update public.idr_orders
  set status = 'in_review'
  where id = p_order_id;

  return jsonb_build_object(
    'abstract_id', locked_abstract.id,
    'review_version', locked_abstract.review_version,
    'parse_status', locked_abstract.parse_status,
    'saved_at', saved_at,
    'order_status', 'in_review'
  );
end;
$$;

-- Delivery claims freeze the exact saved review while the private PDF and HTML
-- are rendered. A stale claim can be taken over after 30 minutes.
create or replace function public.begin_idr_report_delivery(
  p_order_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_order public.idr_orders%rowtype;
  locked_abstract public.abstracts%rowtype;
  locked_report public.idr_reports%rowtype;
  claimed_at timestamptz := now();
begin
  if auth.role() <> 'service_role' and (
    auth.role() <> 'authenticated' or auth.uid() is null or
    not coalesce(public.is_idr_staff(), false)
  ) then
    raise exception 'An IDR staff role or service role is required.';
  end if;
  if p_order_id is null or p_claim_token is null then
    raise exception 'The order and delivery claim token are required.';
  end if;

  select io.*
  into locked_order
  from public.idr_orders io
  where io.id = p_order_id
  for update;

  if not found then
    raise exception 'The IDR order was not found.';
  end if;
  if locked_order.status <> 'in_review' then
    raise exception 'Only an IDR order in review can begin delivery.';
  end if;
  if locked_order.delivery_claim_token is not null and
     locked_order.delivery_claim_token <> p_claim_token and
     locked_order.delivery_claimed_at >= now() - interval '30 minutes' then
    raise exception 'Another report delivery is already in progress.';
  end if;

  select a.*
  into locked_abstract
  from public.abstracts a
  where a.idr_order_id = p_order_id
  for update;

  if not found or locked_abstract.parse_status <> 'parsed' or
     locked_abstract.parsed_json is null or
     locked_abstract.reviewed_by is null or
     locked_abstract.reviewed_at is null then
    raise exception 'A staff-reviewed and parsed abstract is required before delivery.';
  end if;

  select r.*
  into locked_report
  from public.idr_reports r
  where r.idr_order_id = p_order_id
  for update;

  if not found or locked_report.report_json is null or
     jsonb_typeof(locked_report.report_json) <> 'object' then
    raise exception 'A saved report is required before delivery.';
  end if;
  if locked_report.source_review_version is null or
     locked_report.source_review_version <> locked_abstract.review_version then
    raise exception 'The saved report does not match the current abstract review version.';
  end if;

  update public.idr_orders
  set delivery_claim_token = p_claim_token,
      delivery_claimed_at = claimed_at
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', locked_order.id,
    'report_id', locked_report.id,
    'report_json', locked_report.report_json,
    'source_review_version', locked_report.source_review_version,
    'claim_token', p_claim_token,
    'claimed_at', claimed_at
  );
end;
$$;

drop function if exists public.finalize_idr_report_delivery(uuid, uuid, uuid, text, text, timestamptz);

create or replace function public.finalize_idr_report_delivery(
  p_order_id uuid,
  p_report_id uuid,
  p_claim_token uuid,
  p_pdf_url text,
  p_html_url text,
  p_reminders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_order public.idr_orders%rowtype;
  locked_abstract public.abstracts%rowtype;
  locked_report public.idr_reports%rowtype;
  delivery_completed_at timestamptz := now();
  computed_next_reminder_at timestamptz;
begin
  if auth.role() <> 'service_role' and (
    auth.role() <> 'authenticated' or auth.uid() is null or
    not coalesce(public.is_idr_staff(), false)
  ) then
    raise exception 'An IDR staff role or service role is required.';
  end if;
  if p_order_id is null or p_report_id is null or p_claim_token is null or
     p_pdf_url is null or p_html_url is null or
     p_pdf_url <> p_order_id::text || '/' || p_claim_token::text || '/insurance-damage-report.pdf' or
     p_html_url <> p_order_id::text || '/' || p_claim_token::text || '/insurance-damage-report.html' then
    raise exception 'The delivery identifiers or private artifact paths are invalid.';
  end if;
  if p_reminders is null or jsonb_typeof(p_reminders) <> 'array' then
    raise exception 'The delivery reminder schedule must be a JSON array.';
  end if;
  if jsonb_array_length(p_reminders) > 100 then
    raise exception 'The delivery reminder schedule is too large.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_reminders) as reminder(
      event_type text,
      event_key text,
      scheduled_for text
    )
    where reminder.event_type is null or
      reminder.event_type not in ('renewal_45_day', 'conviction_aging') or
      nullif(btrim(reminder.event_key), '') is null or
      length(reminder.event_key) > 500 or
      reminder.scheduled_for is null or
      not public.is_valid_idr_iso_date(reminder.scheduled_for)
  ) then
    raise exception 'The delivery reminder schedule contains an invalid event.';
  end if;

  select io.*
  into locked_order
  from public.idr_orders io
  where io.id = p_order_id
  for update;

  if not found or locked_order.status <> 'in_review' or
     locked_order.delivery_claim_token is distinct from p_claim_token then
    raise exception 'The report delivery claim is no longer active.';
  end if;

  select a.*
  into locked_abstract
  from public.abstracts a
  where a.idr_order_id = p_order_id
  for update;
  if not found then
    raise exception 'The reviewed abstract was not found.';
  end if;

  select r.*
  into locked_report
  from public.idr_reports r
  where r.id = p_report_id
    and r.idr_order_id = p_order_id
  for update;
  if not found or locked_report.source_review_version is null or
     locked_report.source_review_version <> locked_abstract.review_version then
    raise exception 'The report delivery version no longer matches the reviewed abstract.';
  end if;
  if (
    select count(*)
    from storage.objects stored_object
    where stored_object.bucket_id = 'idr-reports'
      and stored_object.name in (p_pdf_url, p_html_url)
  ) <> 2 then
    raise exception 'Both private report artifacts must exist before delivery can finalize.';
  end if;

  insert into public.idr_reminder_events (
    idr_report_id,
    event_type,
    event_key,
    scheduled_for
  )
  select
    locked_report.id,
    reminder.event_type,
    reminder.event_key,
    reminder.scheduled_for::date
  from jsonb_to_recordset(p_reminders) as reminder(
    event_type text,
    event_key text,
    scheduled_for text
  )
  on conflict (idr_report_id, event_type, event_key) do update
  set scheduled_for = excluded.scheduled_for,
      claimed_at = null,
      claim_expires_at = null,
      claimed_by = null,
      last_error = null
  where public.idr_reminder_events.sent_at is null;

  delete from public.idr_reminder_events existing
  where existing.idr_report_id = locked_report.id
    and existing.sent_at is null
    and not exists (
      select 1
      from jsonb_to_recordset(p_reminders) as reminder(
        event_type text,
        event_key text,
        scheduled_for text
      )
      where reminder.event_type = existing.event_type
        and reminder.event_key = existing.event_key
    );

  select (min(existing.scheduled_for) + time '15:00') at time zone 'UTC'
  into computed_next_reminder_at
  from public.idr_reminder_events existing
  where existing.idr_report_id = locked_report.id
    and existing.sent_at is null
    and existing.scheduled_for >= (delivery_completed_at at time zone 'America/Edmonton')::date;

  update public.idr_reports
  set pdf_url = p_pdf_url,
      html_url = p_html_url,
      generated_at = delivery_completed_at,
      next_reminder_at = computed_next_reminder_at
  where id = locked_report.id;

  update public.idr_orders
  set status = 'delivered',
      delivered_at = delivery_completed_at,
      delivery_claim_token = null,
      delivery_claimed_at = null
  where id = locked_order.id;

  return jsonb_build_object(
    'order_id', locked_order.id,
    'report_id', locked_report.id,
    'status', 'delivered',
    'delivered_at', delivery_completed_at,
    'pdf_url', p_pdf_url,
    'html_url', p_html_url,
    'next_reminder_at', computed_next_reminder_at
  );
end;
$$;

create or replace function public.release_idr_report_delivery(
  p_order_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
begin
  if auth.role() <> 'service_role' and (
    auth.role() <> 'authenticated' or auth.uid() is null or
    not coalesce(public.is_idr_staff(), false)
  ) then
    raise exception 'An IDR staff role or service role is required.';
  end if;

  update public.idr_orders
  set delivery_claim_token = null,
      delivery_claimed_at = null
  where id = p_order_id
    and status = 'in_review'
    and delivery_claim_token = p_claim_token;
  get diagnostics released_count = row_count;
  return released_count = 1;
end;
$$;

create or replace function public.client_can_read_delivered_idr_storage_path(_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.idr_reports r
    join public.idr_orders io on io.id = r.idr_order_id
    join public.clients c on c.id = io.client_id
    where io.status = 'delivered'
      and io.delivered_at is not null
      and auth.uid() is not null
      and c.auth_user_id = auth.uid()
      and _name in (r.pdf_url, r.html_url)
  )
$$;

create or replace function public.protect_delivered_idr_artifact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
begin
  target_order_id := case when tg_op = 'DELETE' then old.idr_order_id else new.idr_order_id end;
  if exists (
    select 1
    from public.idr_orders io
    where io.id = target_order_id
      and io.status = 'delivered'
  ) then
    if tg_table_name = 'idr_reports' and tg_op = 'UPDATE' then
      if new.id is not distinct from old.id and
         new.idr_order_id is not distinct from old.idr_order_id and
         new.report_json is not distinct from old.report_json and
         new.html_url is not distinct from old.html_url and
         new.pdf_url is not distinct from old.pdf_url and
         new.generated_at is not distinct from old.generated_at and
         new.renewal_date is not distinct from old.renewal_date and
         new.source_review_version is not distinct from old.source_review_version then
        return new;
      end if;
    end if;
    raise exception 'Delivered IDR source records and reports are immutable.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.protect_delivered_idr_order_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'delivered' and (
    new.status is distinct from old.status or
    new.delivered_at is distinct from old.delivered_at or
    new.client_id is distinct from old.client_id or
    new.ticket_submission_id is distinct from old.ticket_submission_id or
    new.type is distinct from old.type or
    new.price_paid is distinct from old.price_paid or
    new.delivery_claim_token is distinct from old.delivery_claim_token or
    new.delivery_claimed_at is distinct from old.delivery_claimed_at
  ) then
    raise exception 'Delivered IDR ownership and delivery state are immutable.';
  end if;
  return new;
end;
$$;

revoke all on function public.register_idr_abstract_upload(uuid, text) from public;
grant execute on function public.register_idr_abstract_upload(uuid, text) to authenticated;
revoke all on function public.claim_idr_abstract_review(uuid) from public;
grant execute on function public.claim_idr_abstract_review(uuid) to authenticated, service_role;
revoke all on function public.save_idr_report_review(uuid, uuid, text, bigint, jsonb, jsonb, date) from public;
grant execute on function public.save_idr_report_review(uuid, uuid, text, bigint, jsonb, jsonb, date) to authenticated;
revoke all on function public.begin_idr_report_delivery(uuid, uuid) from public;
grant execute on function public.begin_idr_report_delivery(uuid, uuid) to service_role;
revoke all on function public.finalize_idr_report_delivery(uuid, uuid, uuid, text, text, jsonb) from public;
grant execute on function public.finalize_idr_report_delivery(uuid, uuid, uuid, text, text, jsonb) to service_role;
revoke all on function public.release_idr_report_delivery(uuid, uuid) from public;
grant execute on function public.release_idr_report_delivery(uuid, uuid) to service_role;
revoke all on function public.client_can_read_delivered_idr_storage_path(text) from public;
grant execute on function public.client_can_read_delivered_idr_storage_path(text) to authenticated, service_role;

drop policy if exists "IDR staff can manage orders" on public.idr_orders;
drop policy if exists "IDR staff can read orders" on public.idr_orders;
create policy "IDR staff can read orders"
  on public.idr_orders for select to authenticated
  using (public.is_idr_staff());

drop policy if exists "IDR staff can manage abstracts" on public.abstracts;
drop policy if exists "IDR staff can read abstracts" on public.abstracts;
create policy "IDR staff can read abstracts"
  on public.abstracts for select to authenticated
  using (public.is_idr_staff());

drop policy if exists "IDR staff can manage reports" on public.idr_reports;
drop policy if exists "IDR staff can read reports" on public.idr_reports;
create policy "IDR staff can read reports"
  on public.idr_reports for select to authenticated
  using (public.is_idr_staff());

drop policy if exists "IDR staff can manage abstract files" on storage.objects;
drop policy if exists "IDR staff can read abstract files" on storage.objects;
create policy "IDR staff can read abstract files"
  on storage.objects for select to authenticated
  using (bucket_id = 'idr-abstracts' and public.is_idr_staff());

drop policy if exists "IDR staff can manage report files" on storage.objects;
drop policy if exists "IDR staff can read report files" on storage.objects;
create policy "IDR staff can read report files"
  on storage.objects for select to authenticated
  using (bucket_id = 'idr-reports' and public.is_idr_staff());

drop policy if exists "Clients can register their abstract upload" on public.abstracts;
drop policy if exists "Clients can replace an unreviewed abstract" on public.abstracts;

drop policy if exists "Clients can upload their abstract files" on storage.objects;
create policy "Clients can upload their abstract files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'idr-abstracts' and
    public.client_can_upload_idr_abstract_path(name)
  );

drop policy if exists "Clients can delete replaceable abstract files" on storage.objects;
create policy "Clients can delete replaceable abstract files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'idr-abstracts' and
    public.client_can_delete_replaceable_idr_abstract_path(name)
  );

comment on column public.idr_orders.intake_json is
  'Validated schema-versioned ticket, renewal, and rating inputs supplied by the client.';
comment on column public.idr_orders.intake_completed_at is
  'Server-derived timestamp of the latest client intake content change.';
comment on column public.idr_orders.delivery_claim_token is
  'Short-lived token that freezes one saved report version while private delivery files are rendered.';
comment on column public.idr_orders.delivery_claimed_at is
  'Timestamp used to expire an interrupted report delivery claim after 30 minutes.';
comment on column public.abstracts.review_started_at is
  'Timestamp when staff first claimed the current abstract source for review.';
comment on column public.abstracts.review_started_by is
  'Staff user who first claimed the current abstract source for review.';
comment on column public.abstracts.review_version is
  'Optimistic concurrency version incremented on client replacement and every atomic staff save.';
comment on column public.idr_reports.source_review_version is
  'Abstract review version captured by the atomic report save and required for delivery finalization.';
