-- Insurance Damage Report product data, access controls, and private storage.

alter table public.ticket_submissions
  add column if not exists verdict text,
  add column if not exists verdict_set_at timestamptz,
  add column if not exists verdict_set_by uuid references auth.users(id),
  add column if not exists case_outcome text,
  add column if not exists idr_offer_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ticket_submissions_verdict_check'
  ) then
    alter table public.ticket_submissions
      add constraint ticket_submissions_verdict_check
      check (verdict is null or verdict in ('winnable', 'reducible', 'unwinnable'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ticket_submissions_case_outcome_check'
  ) then
    alter table public.ticket_submissions
      add constraint ticket_submissions_case_outcome_check
      check (
        case_outcome is null or
        case_outcome in ('withdrawn', 'reduced', 'conviction_stands', 'other')
      );
  end if;
end $$;

create table if not exists public.insurer_rules (
  id uuid primary key default gen_random_uuid(),
  carrier_name text not null,
  conviction_class text not null check (conviction_class in ('minor', 'major', 'serious')),
  threshold_count integer not null check (threshold_count >= 0),
  behavior text not null check (behavior in ('no_surcharge', 'surcharge', 'decline')),
  surcharge_note text,
  forgiveness_product boolean not null default false,
  forgiveness_note text,
  phone text,
  quote_url text check (quote_url is null or quote_url ~ '^https://'),
  source_publisher text not null,
  source_title text not null,
  source_url text not null check (source_url ~ '^https://'),
  last_verified date not null,
  estimate_min_percent numeric(7, 3),
  estimate_max_percent numeric(7, 3),
  estimate_source_publisher text,
  estimate_source_title text,
  estimate_source_url text check (
    estimate_source_url is null or estimate_source_url ~ '^https://'
  ),
  estimate_last_verified date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carrier_name, conviction_class, threshold_count, source_url)
);

create table if not exists public.idr_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  ticket_submission_id uuid references public.ticket_submissions(id) on delete set null,
  type text not null check (type in ('standalone', 'addon')),
  price_paid numeric(10, 2) not null,
  status text not null default 'awaiting_abstract'
    check (status in ('paid', 'awaiting_abstract', 'in_review', 'delivered')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  access_email_sent_at timestamptz,
  access_email_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.idr_orders
  add constraint idr_orders_type_price_check
  check (
    (type = 'standalone' and price_paid = 129.00) or
    (type = 'addon' and price_paid = 99.00)
  );

create table if not exists public.abstracts (
  id uuid primary key default gen_random_uuid(),
  idr_order_id uuid not null unique references public.idr_orders(id) on delete restrict,
  file_url text not null,
  parsed_json jsonb,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'parsed', 'manual_review')),
  reviewed_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.idr_reports (
  id uuid primary key default gen_random_uuid(),
  idr_order_id uuid not null unique references public.idr_orders(id) on delete restrict,
  report_json jsonb not null,
  html_url text,
  pdf_url text,
  generated_at timestamptz not null default now(),
  renewal_date date,
  next_reminder_at timestamptz
);

create table if not exists public.outcome_surveys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  idr_report_id uuid not null references public.idr_reports(id) on delete restrict,
  sent_at timestamptz,
  responded_at timestamptz,
  prior_carrier text,
  new_carrier text,
  premium_before numeric(10, 2) check (premium_before is null or premium_before >= 0),
  premium_after numeric(10, 2) check (premium_after is null or premium_after >= 0),
  switched boolean,
  notes text,
  created_at timestamptz not null default now(),
  unique (client_id, idr_report_id)
);

create table if not exists public.idr_reminder_events (
  id uuid primary key default gen_random_uuid(),
  idr_report_id uuid not null references public.idr_reports(id) on delete restrict,
  event_type text not null check (event_type in ('renewal_45_day', 'conviction_aging')),
  event_key text not null,
  scheduled_for date not null,
  sent_at timestamptz,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  claimed_by text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  unique (idr_report_id, event_type, event_key)
);

create table if not exists public.idr_email_events (
  id uuid primary key default gen_random_uuid(),
  ticket_submission_id uuid references public.ticket_submissions(id) on delete restrict,
  idr_report_id uuid references public.idr_reports(id) on delete restrict,
  event_key text not null unique,
  event_type text not null check (event_type in ('verdict_set', 'conviction_stands_offer', 'report_delivered')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  recipient_email text not null,
  attempts integer not null default 0 check (attempts >= 0),
  processing_at timestamptz,
  lease_expires_at timestamptz,
  processing_by text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_insurer_rules_active_class
  on public.insurer_rules (active, conviction_class, carrier_name);
create index if not exists idx_idr_orders_client_created
  on public.idr_orders (client_id, created_at desc);
create index if not exists idx_idr_orders_status
  on public.idr_orders (status, created_at);
create unique index if not exists idx_idr_orders_one_addon_per_ticket
  on public.idr_orders (ticket_submission_id)
  where type = 'addon' and ticket_submission_id is not null;
create index if not exists idx_abstracts_parse_queue
  on public.abstracts (parse_status, uploaded_at);
create index if not exists idx_idr_reports_next_reminder
  on public.idr_reports (next_reminder_at)
  where next_reminder_at is not null;
create index if not exists idx_idr_reminder_events_due
  on public.idr_reminder_events (scheduled_for, sent_at, claimed_at);
create index if not exists idx_idr_email_events_status
  on public.idr_email_events (status, created_at);
create index if not exists idx_idr_email_events_lease
  on public.idr_email_events (status, lease_expires_at)
  where status = 'processing';

drop trigger if exists update_insurer_rules_updated_at on public.insurer_rules;
create trigger update_insurer_rules_updated_at
  before update on public.insurer_rules
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_idr_orders_updated_at on public.idr_orders;
create trigger update_idr_orders_updated_at
  before update on public.idr_orders
  for each row execute function public.update_updated_at_column();

create or replace function public.mark_idr_order_in_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.idr_orders
  set status = 'in_review'
  where id = new.idr_order_id
    and status in ('paid', 'awaiting_abstract');
  return new;
end;
$$;

drop trigger if exists mark_idr_order_in_review_on_abstract on public.abstracts;
create trigger mark_idr_order_in_review_on_abstract
  after insert or update of file_url on public.abstracts
  for each row execute function public.mark_idr_order_in_review();

alter table public.insurer_rules enable row level security;
alter table public.idr_orders enable row level security;
alter table public.abstracts enable row level security;
alter table public.idr_reports enable row level security;
alter table public.outcome_surveys enable row level security;
alter table public.idr_reminder_events enable row level security;
alter table public.idr_email_events enable row level security;

create or replace function public.is_idr_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'case_manager'::public.app_role)
$$;

create or replace function public.idr_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_role(auth.uid(), 'admin'::public.app_role) then 'admin'
    when public.has_role(auth.uid(), 'case_manager'::public.app_role) then 'case_manager'
    else null
  end
$$;

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
      and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
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
      and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

create or replace function public.client_owns_idr_storage_path(_name text)
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
  return public.client_owns_idr_order(order_segment::uuid);
end;
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

revoke all on function public.is_idr_staff() from public;
grant execute on function public.is_idr_staff() to authenticated, service_role;
revoke all on function public.idr_staff_role() from public;
grant execute on function public.idr_staff_role() to authenticated, service_role;
revoke all on function public.client_owns_idr_order(uuid) from public;
grant execute on function public.client_owns_idr_order(uuid) to authenticated, service_role;
revoke all on function public.client_can_read_delivered_idr_order(uuid) from public;
grant execute on function public.client_can_read_delivered_idr_order(uuid) to authenticated, service_role;
revoke all on function public.client_owns_idr_storage_path(text) from public;
grant execute on function public.client_owns_idr_storage_path(text) to authenticated, service_role;
revoke all on function public.client_can_read_delivered_idr_storage_path(text) from public;
grant execute on function public.client_can_read_delivered_idr_storage_path(text) to authenticated, service_role;

create policy "IDR staff can read insurer rules"
  on public.insurer_rules for select to authenticated
  using (public.is_idr_staff());
create policy "Admins can create insurer rules"
  on public.insurer_rules for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Admins can update insurer rules"
  on public.insurer_rules for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Admins can delete insurer rules"
  on public.insurer_rules for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "IDR staff can manage orders"
  on public.idr_orders for all to authenticated
  using (public.is_idr_staff())
  with check (public.is_idr_staff());
create policy "Clients can read their IDR orders"
  on public.idr_orders for select to authenticated
  using (public.client_owns_idr_order(id));

create policy "Clients can read their own profile"
  on public.clients for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "Clients can read their own ticket cases"
  on public.ticket_submissions for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "IDR staff can manage abstracts"
  on public.abstracts for all to authenticated
  using (public.is_idr_staff())
  with check (public.is_idr_staff());
create policy "Clients can read their abstracts"
  on public.abstracts for select to authenticated
  using (public.client_owns_idr_order(idr_order_id));
create policy "Clients can register their abstract upload"
  on public.abstracts for insert to authenticated
  with check (
    public.client_owns_idr_order(idr_order_id) and
    file_url like idr_order_id::text || '/%' and
    parsed_json is null and
    parse_status = 'pending' and
    reviewed_by is null and
    reviewed_at is null
  );
create policy "Clients can replace an unreviewed abstract"
  on public.abstracts for update to authenticated
  using (
    parse_status in ('pending', 'manual_review') and
    public.client_owns_idr_order(idr_order_id)
  )
  with check (
    public.client_owns_idr_order(idr_order_id) and
    file_url like idr_order_id::text || '/%' and
    parsed_json is null and
    parse_status = 'pending' and
    reviewed_by is null and
    reviewed_at is null
  );

create policy "IDR staff can manage reports"
  on public.idr_reports for all to authenticated
  using (public.is_idr_staff())
  with check (public.is_idr_staff());
create policy "Clients can read their IDR reports"
  on public.idr_reports for select to authenticated
  using (public.client_can_read_delivered_idr_order(idr_order_id));

create policy "IDR staff can read outcome surveys"
  on public.outcome_surveys for select to authenticated
  using (public.is_idr_staff());
create policy "Clients can read their outcome surveys"
  on public.outcome_surveys for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
create policy "Clients can submit outcome surveys"
  on public.outcome_surveys for insert to authenticated
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
create policy "Clients can update outcome surveys"
  on public.outcome_surveys for update to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "IDR staff can manage reminder events"
  on public.idr_reminder_events for all to authenticated
  using (public.is_idr_staff())
  with check (public.is_idr_staff());
create policy "IDR staff can read email events"
  on public.idr_email_events for select to authenticated
  using (public.is_idr_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'idr-abstracts',
  'idr-abstracts',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'idr-reports',
  'idr-reports',
  false,
  10485760,
  array['application/pdf', 'text/html']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "IDR staff can manage abstract files"
  on storage.objects for all to authenticated
  using (bucket_id = 'idr-abstracts' and public.is_idr_staff())
  with check (bucket_id = 'idr-abstracts' and public.is_idr_staff());
create policy "Clients can upload their abstract files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'idr-abstracts' and
    public.client_owns_idr_storage_path(name)
  );
create policy "Clients can read their abstract files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'idr-abstracts' and
    public.client_owns_idr_storage_path(name)
  );

create policy "IDR staff can manage report files"
  on storage.objects for all to authenticated
  using (bucket_id = 'idr-reports' and public.is_idr_staff())
  with check (bucket_id = 'idr-reports' and public.is_idr_staff());
create policy "Clients can read their report files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'idr-reports' and
    public.client_can_read_delivered_idr_storage_path(name)
  );

comment on table public.insurer_rules is
  'Manually verified carrier research with public provenance, verified contact fields, and optional fully sourced premium impact ranges.';
comment on table public.idr_reports is
  'Consumer research reports. Values are estimates and are not insurance quotes or brokerage recommendations.';
