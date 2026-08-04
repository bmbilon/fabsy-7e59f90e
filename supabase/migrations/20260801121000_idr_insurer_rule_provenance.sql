-- Add source metadata and optional, fully sourced premium impact ranges to
-- insurer research rows. This migration is additive for environments where
-- the core IDR migration has already been applied.

alter table public.insurer_rules
  add column if not exists source_publisher text,
  add column if not exists source_title text,
  add column if not exists estimate_min_percent numeric(7, 3),
  add column if not exists estimate_max_percent numeric(7, 3),
  add column if not exists estimate_source_publisher text,
  add column if not exists estimate_source_title text,
  add column if not exists estimate_source_url text,
  add column if not exists estimate_last_verified date;

-- Earlier IDR drafts did not require publisher/title labels. Preserve those
-- rows for audit purposes, but keep them out of generated reports until a
-- staff member replaces the explicit placeholder metadata and reactivates the
-- rule after verification.
update public.insurer_rules
set
  source_publisher = case
    when nullif(btrim(source_publisher), '') is null
      then 'Legacy source pending verification'
    else btrim(source_publisher)
  end,
  source_title = case
    when nullif(btrim(source_title), '') is null
      then 'Legacy source metadata pending verification'
    else btrim(source_title)
  end,
  active = false
where nullif(btrim(source_publisher), '') is null
   or nullif(btrim(source_title), '') is null;

alter table public.insurer_rules
  alter column source_publisher set not null,
  alter column source_title set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'insurer_rules_source_metadata_check'
      and conrelid = 'public.insurer_rules'::regclass
  ) then
    alter table public.insurer_rules
      add constraint insurer_rules_source_metadata_check
      check (
        nullif(btrim(source_publisher), '') is not null and
        nullif(btrim(source_title), '') is not null
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'insurer_rules_estimate_source_url_check'
      and conrelid = 'public.insurer_rules'::regclass
  ) then
    alter table public.insurer_rules
      add constraint insurer_rules_estimate_source_url_check
      check (
        estimate_source_url is null or estimate_source_url ~ '^https://'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'insurer_rules_sourced_estimate_check'
      and conrelid = 'public.insurer_rules'::regclass
  ) then
    alter table public.insurer_rules
      add constraint insurer_rules_sourced_estimate_check
      check (
        (
          estimate_min_percent is null and
          estimate_max_percent is null and
          estimate_source_publisher is null and
          estimate_source_title is null and
          estimate_source_url is null and
          estimate_last_verified is null
        ) or
        (
          estimate_min_percent is not null and
          estimate_max_percent is not null and
          estimate_min_percent >= 0 and
          estimate_max_percent >= estimate_min_percent and
          nullif(btrim(estimate_source_publisher), '') is not null and
          nullif(btrim(estimate_source_title), '') is not null and
          estimate_source_url ~ '^https://' and
          estimate_last_verified is not null
        )
      );
  end if;
end $$;

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

revoke all on function public.idr_staff_role() from public;
grant execute on function public.idr_staff_role() to authenticated, service_role;

drop policy if exists "Authenticated users can view their own roles" on public.user_roles;
create policy "Authenticated users can view their own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

comment on column public.insurer_rules.estimate_min_percent is
  'Optional lower bound of a sourced annual premium impact percentage for this exact carrier, conviction class, and threshold row.';
comment on column public.insurer_rules.estimate_max_percent is
  'Optional upper bound paired with estimate_min_percent. The sourced estimate constraint requires complete provenance.';
