-- Harden IDR identity binding, private draft access, upload registration,
-- email leases, reminder claims, and duplicate checkout handling.

alter table public.clients
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_clients_auth_user_id
  on public.clients (auth_user_id)
  where auth_user_id is not null;

update public.clients c
set auth_user_id = u.id
from auth.users u
where c.auth_user_id is null
  and u.email_confirmed_at is not null
  and lower(c.email) = lower(u.email);

alter table public.idr_orders
  add column if not exists access_email_sent_at timestamptz,
  add column if not exists access_email_claimed_at timestamptz;

alter table public.idr_reminder_events
  add column if not exists claimed_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text;

alter table public.idr_email_events
  add column if not exists event_key text,
  add column if not exists claimed_at timestamptz;

-- Fresh installs require every survey to belong to a report. On an additive
-- upgrade, retain any legacy report-less rows for manual reconciliation while
-- enforcing the invariant for every new or changed row.
alter table public.outcome_surveys
  drop constraint if exists outcome_surveys_idr_report_id_fkey;
alter table public.outcome_surveys
  add constraint outcome_surveys_idr_report_id_fkey
  foreign key (idr_report_id) references public.idr_reports(id) on delete restrict;
alter table public.outcome_surveys
  drop constraint if exists outcome_surveys_report_required_check;
alter table public.outcome_surveys
  add constraint outcome_surveys_report_required_check
  check (idr_report_id is not null) not valid;

do $$
begin
  if not exists (
    select 1 from public.outcome_surveys where idr_report_id is null
  ) then
    alter table public.outcome_surveys
      validate constraint outcome_surveys_report_required_check;
    alter table public.outcome_surveys
      alter column idr_report_id set not null;
  else
    raise warning
      'Legacy report-less outcome surveys were preserved. New report-less surveys are blocked; reconcile legacy rows before validating the constraint.';
  end if;
end $$;

update public.idr_email_events
set event_key = concat_ws(
  ':',
  'legacy',
  coalesce(ticket_submission_id::text, 'none'),
  coalesce(idr_report_id::text, 'none'),
  event_type,
  id::text
)
where event_key is null;

alter table public.idr_email_events
  alter column event_key set not null;

alter table public.idr_email_events
  drop constraint if exists idr_email_events_status_check;
alter table public.idr_email_events
  add constraint idr_email_events_status_check
  check (status in ('pending', 'processing', 'sent', 'failed'));

alter table public.idr_email_events
  drop constraint if exists idr_email_events_ticket_submission_id_idr_report_id_event_type_key;

create unique index if not exists idx_idr_email_events_event_key
  on public.idr_email_events (event_key);

-- Do not delete or guess between historical paid orders. Promote the older
-- add-on-only invariant to one report per ticket only when existing data is
-- already unambiguous; otherwise retain the narrow index and let the checkout
-- intent constraint prevent new duplicate purchases.
do $$
begin
  if exists (
    select 1
    from public.idr_orders
    where ticket_submission_id is not null
    group by ticket_submission_id
    having count(*) > 1
  ) then
    raise warning
      'Multiple historical IDR orders exist for at least one ticket. Paid data was preserved and the broader ticket uniqueness index was not installed.';
  else
    drop index if exists public.idx_idr_orders_one_addon_per_ticket;
    create unique index if not exists idx_idr_orders_one_report_per_ticket
      on public.idr_orders (ticket_submission_id)
      where ticket_submission_id is not null;
  end if;
end $$;

create table if not exists public.idr_checkout_intents (
  id uuid primary key,
  client_id uuid references public.clients(id) on delete restrict,
  ticket_submission_id uuid references public.ticket_submissions(id) on delete restrict,
  type text not null,
  checkout_kind text not null,
  expected_amount_cents integer not null,
  purchaser_email text not null,
  request_fingerprint text,
  stripe_checkout_session_id text unique,
  status text not null default 'creating'
    check (status in ('creating', 'open', 'paid', 'expired', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Replace constraints from an earlier two-product draft as well as establish
-- the same named constraints on a fresh install.
alter table public.idr_checkout_intents
  drop constraint if exists idr_checkout_intents_type_check,
  drop constraint if exists idr_checkout_intents_checkout_kind_check,
  drop constraint if exists idr_checkout_intents_expected_amount_cents_check,
  drop constraint if exists idr_checkout_intents_check,
  drop constraint if exists idr_checkout_intents_check1,
  drop constraint if exists idr_checkout_intents_product_price_check,
  drop constraint if exists idr_checkout_intents_linkage_check;

alter table public.idr_checkout_intents
  add constraint idr_checkout_intents_type_check
    check (type in ('ticket', 'standalone', 'addon')),
  add constraint idr_checkout_intents_checkout_kind_check
    check (checkout_kind in ('ticket_only', 'idr_only', 'ticket_with_addon')),
  add constraint idr_checkout_intents_expected_amount_cents_check
    check (expected_amount_cents in (9900, 12900, 48800)),
  add constraint idr_checkout_intents_product_price_check
    check (
      (type = 'ticket' and expected_amount_cents = 48800 and checkout_kind = 'ticket_only') or
      (type = 'standalone' and expected_amount_cents = 12900 and checkout_kind = 'idr_only') or
      (type = 'addon' and expected_amount_cents = 9900 and checkout_kind in ('idr_only', 'ticket_with_addon'))
    ),
  add constraint idr_checkout_intents_linkage_check
    check (
      (ticket_submission_id is null and client_id is null and type = 'standalone') or
      (ticket_submission_id is not null and client_id is not null)
    );

-- A ticket-only purchase and a later IDR-only add-on legitimately need separate
-- intents. A combined checkout participates in both lanes, so neither the base
-- ticket nor the report can be purchased twice.
drop index if exists public.idx_idr_checkout_intents_ticket;
do $$
begin
  if exists (
    select 1
    from public.idr_checkout_intents
    where ticket_submission_id is not null
      and checkout_kind in ('ticket_only', 'ticket_with_addon')
    group by ticket_submission_id
    having count(*) > 1
  ) then
    raise warning
      'Conflicting historical core-ticket checkout intents were preserved; the core-purchase uniqueness index was not installed.';
  else
    create unique index if not exists idx_idr_checkout_intents_core_purchase
      on public.idr_checkout_intents (ticket_submission_id)
      where ticket_submission_id is not null
        and checkout_kind in ('ticket_only', 'ticket_with_addon');
  end if;

  if exists (
    select 1
    from public.idr_checkout_intents
    where ticket_submission_id is not null
      and type in ('standalone', 'addon')
    group by ticket_submission_id
    having count(*) > 1
  ) then
    raise warning
      'Conflicting historical IDR checkout intents were preserved; the report-purchase uniqueness index was not installed.';
  else
    create unique index if not exists idx_idr_checkout_intents_report_purchase
      on public.idr_checkout_intents (ticket_submission_id)
      where ticket_submission_id is not null
        and type in ('standalone', 'addon');
  end if;
end $$;

create index if not exists idx_idr_checkout_intents_rate
  on public.idr_checkout_intents (request_fingerprint, created_at desc)
  where request_fingerprint is not null;

alter table public.idr_checkout_intents enable row level security;

drop trigger if exists update_idr_checkout_intents_updated_at on public.idr_checkout_intents;
create trigger update_idr_checkout_intents_updated_at
  before update on public.idr_checkout_intents
  for each row execute function public.update_updated_at_column();

create policy "IDR staff can read checkout intents"
  on public.idr_checkout_intents for select to authenticated
  using (public.is_idr_staff());

create or replace function public.claim_idr_client_records()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  claimed_count integer := 0;
begin
  if caller_id is null then
    raise exception 'Authentication is required.';
  end if;

  select lower(email)
  into caller_email
  from auth.users
  where id = caller_id
    and email_confirmed_at is not null;

  if caller_email is null then
    raise exception 'A confirmed email is required.';
  end if;

  if exists (
    select 1
    from public.clients
    where lower(email) = caller_email
      and auth_user_id is not null
      and auth_user_id <> caller_id
  ) then
    raise exception 'This client record is already linked to another account.';
  end if;

  update public.clients
  set auth_user_id = caller_id
  where lower(email) = caller_email
    and (auth_user_id is null or auth_user_id = caller_id);
  get diagnostics claimed_count = row_count;
  return claimed_count;
end;
$$;

revoke all on function public.claim_idr_client_records() from public;
grant execute on function public.claim_idr_client_records() to authenticated;

create or replace function public.client_owns_idr_order(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.idr_orders io
    join public.clients c on c.id = io.client_id
    where io.id = _order_id
      and auth.uid() is not null
      and c.auth_user_id = auth.uid()
  )
$$;

create or replace function public.client_can_write_idr_order(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.idr_orders io
    join public.clients c on c.id = io.client_id
    where io.id = _order_id
      and io.status in ('paid', 'awaiting_abstract', 'in_review')
      and auth.uid() is not null
      and c.auth_user_id = auth.uid()
  )
$$;

create or replace function public.client_can_read_delivered_idr_order(_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.idr_orders io
    join public.clients c on c.id = io.client_id
    where io.id = _order_id
      and io.status = 'delivered'
      and io.delivered_at is not null
      and auth.uid() is not null
      and c.auth_user_id = auth.uid()
  )
$$;

create or replace function public.client_can_read_delivered_idr_storage_path(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  order_segment text;
begin
  order_segment := (storage.foldername(_name))[1];
  if order_segment is null or order_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.client_can_read_delivered_idr_order(order_segment::uuid);
end;
$$;

create or replace function public.client_can_write_idr_storage_path(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  order_segment text;
begin
  order_segment := (storage.foldername(_name))[1];
  if order_segment is null or order_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.client_can_write_idr_order(order_segment::uuid);
end;
$$;

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
  if order_segment is null or order_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  order_id := order_segment::uuid;
  return public.client_can_write_idr_order(order_id) and not exists (
    select 1
    from public.abstracts a
    where a.idr_order_id = order_id
      and (
        a.parse_status = 'parsed' or
        a.reviewed_by is not null or
        a.reviewed_at is not null
      )
  );
end;
$$;

revoke all on function public.client_can_write_idr_order(uuid) from public;
grant execute on function public.client_can_write_idr_order(uuid) to authenticated, service_role;
revoke all on function public.client_can_read_delivered_idr_order(uuid) from public;
grant execute on function public.client_can_read_delivered_idr_order(uuid) to authenticated, service_role;
revoke all on function public.client_can_read_delivered_idr_storage_path(text) from public;
grant execute on function public.client_can_read_delivered_idr_storage_path(text) to authenticated, service_role;
revoke all on function public.client_can_write_idr_storage_path(text) from public;
grant execute on function public.client_can_write_idr_storage_path(text) to authenticated, service_role;
revoke all on function public.client_can_delete_replaceable_idr_abstract_path(text) from public;
grant execute on function public.client_can_delete_replaceable_idr_abstract_path(text) to authenticated, service_role;

drop policy if exists "Clients can read their own profile" on public.clients;
create policy "Clients can read their own profile"
  on public.clients for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "Clients can read their own ticket cases" on public.ticket_submissions;
create policy "Clients can read their own ticket cases"
  on public.ticket_submissions for select to authenticated
  using (
    exists (
      select 1
      from public.clients c
      where c.id = client_id
        and c.auth_user_id = auth.uid()
    )
  );

-- Client uploads created under the earlier policy used the pending state.
-- Normalize them before the immutable review-field trigger is installed so a
-- later file replacement does not require a forbidden status transition.
update public.abstracts
set parse_status = 'manual_review'
where parse_status = 'pending';

create or replace function public.protect_client_abstract_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_idr_staff() then
    if new.file_url !~* (
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
      new.uploaded_at := now();
    else
      if new.idr_order_id is distinct from old.idr_order_id or
         new.parsed_json is distinct from old.parsed_json or
         new.parse_status is distinct from old.parse_status or
         new.reviewed_by is distinct from old.reviewed_by or
         new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'Clients cannot change abstract review fields.';
      end if;
      new.uploaded_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_client_abstract_review_fields on public.abstracts;
create trigger protect_client_abstract_review_fields
  before insert or update on public.abstracts
  for each row execute function public.protect_client_abstract_review_fields();

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
    if tg_table_name = 'idr_reports' and tg_op = 'UPDATE' and
       new.id is not distinct from old.id and
       new.idr_order_id is not distinct from old.idr_order_id and
       new.report_json is not distinct from old.report_json and
       new.html_url is not distinct from old.html_url and
       new.pdf_url is not distinct from old.pdf_url and
       new.generated_at is not distinct from old.generated_at and
       new.renewal_date is not distinct from old.renewal_date then
      return new;
    end if;
    raise exception 'Delivered IDR source records and reports are immutable.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_delivered_abstract on public.abstracts;
create trigger protect_delivered_abstract
  before insert or update or delete on public.abstracts
  for each row execute function public.protect_delivered_idr_artifact();

drop trigger if exists protect_delivered_report on public.idr_reports;
create trigger protect_delivered_report
  before insert or update or delete on public.idr_reports
  for each row execute function public.protect_delivered_idr_artifact();

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
    new.price_paid is distinct from old.price_paid
  ) then
    raise exception 'Delivered IDR ownership and delivery state are immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_delivered_idr_order_state on public.idr_orders;
create trigger protect_delivered_idr_order_state
  before update on public.idr_orders
  for each row execute function public.protect_delivered_idr_order_state();

drop policy if exists "Clients can register their abstract upload" on public.abstracts;
create policy "Clients can register their abstract upload"
  on public.abstracts for insert to authenticated
  with check (public.client_can_write_idr_order(idr_order_id));

drop policy if exists "Clients can replace an unreviewed abstract" on public.abstracts;
create policy "Clients can replace an unreviewed abstract"
  on public.abstracts for update to authenticated
  using (
    parse_status in ('pending', 'manual_review') and
    public.client_can_write_idr_order(idr_order_id)
  )
  with check (public.client_can_write_idr_order(idr_order_id));

drop policy if exists "Clients can read their IDR reports" on public.idr_reports;
create policy "Clients can read their delivered IDR reports"
  on public.idr_reports for select to authenticated
  using (public.client_can_read_delivered_idr_order(idr_order_id));

drop policy if exists "Clients can upload their abstract files" on storage.objects;
create policy "Clients can upload their abstract files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'idr-abstracts' and
    public.client_can_write_idr_storage_path(name)
  );

create policy "Clients can delete replaceable abstract files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'idr-abstracts' and
    public.client_can_delete_replaceable_idr_abstract_path(name)
  );

drop policy if exists "Clients can read their report files" on storage.objects;
create policy "Clients can read their delivered report files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'idr-reports' and
    public.client_can_read_delivered_idr_storage_path(name)
  );

create or replace function public.client_can_submit_idr_survey(
  _client_id uuid,
  _report_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = _client_id
      and c.auth_user_id = auth.uid()
      and _report_id is not null
      and exists (
        select 1
        from public.idr_reports r
        join public.idr_orders io on io.id = r.idr_order_id
        where r.id = _report_id
          and io.client_id = _client_id
          and io.status = 'delivered'
      )
  )
$$;

revoke all on function public.client_can_submit_idr_survey(uuid, uuid) from public;
grant execute on function public.client_can_submit_idr_survey(uuid, uuid) to authenticated, service_role;

drop policy if exists "Clients can read their outcome surveys" on public.outcome_surveys;
create policy "Clients can read their outcome surveys"
  on public.outcome_surveys for select to authenticated
  using (public.client_can_submit_idr_survey(client_id, idr_report_id));

drop policy if exists "Clients can submit outcome surveys" on public.outcome_surveys;
create policy "Clients can submit outcome surveys"
  on public.outcome_surveys for insert to authenticated
  with check (public.client_can_submit_idr_survey(client_id, idr_report_id));

drop policy if exists "Clients can update outcome surveys" on public.outcome_surveys;
create policy "Clients can update outcome surveys"
  on public.outcome_surveys for update to authenticated
  using (public.client_can_submit_idr_survey(client_id, idr_report_id))
  with check (public.client_can_submit_idr_survey(client_id, idr_report_id));

create or replace function public.protect_client_outcome_survey_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_idr_staff() then
    if tg_op = 'UPDATE' and (
      new.client_id is distinct from old.client_id or
      new.idr_report_id is distinct from old.idr_report_id or
      new.sent_at is distinct from old.sent_at or
      new.created_at is distinct from old.created_at
    ) then
      raise exception 'Clients cannot change survey ownership fields.';
    end if;
    if tg_op = 'INSERT' then
      new.sent_at := null;
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_client_outcome_survey_links on public.outcome_surveys;
create trigger protect_client_outcome_survey_links
  before insert or update on public.outcome_surveys
  for each row execute function public.protect_client_outcome_survey_links();

comment on column public.clients.auth_user_id is
  'Confirmed Supabase Auth account bound to this client record for private portal access.';
comment on table public.idr_checkout_intents is
  'Server-created checkout reservations used to prevent duplicate paid IDR sessions.';
