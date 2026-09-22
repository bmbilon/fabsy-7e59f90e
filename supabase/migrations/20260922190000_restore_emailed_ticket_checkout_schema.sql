-- Staff-created links for tickets Fabsy already received through its email process.
begin;

alter table public.ticket_submissions
  add column if not exists intake_source text not null default 'web_upload',
  -- Keep the immutable audit identifier even if the staff auth account is
  -- later removed. A cascading SET NULL would conflict with the immutability
  -- trigger below and would erase useful provenance.
  add column if not exists manual_link_created_by uuid,
  add column if not exists manual_link_created_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ticket_submissions_intake_source_check' and conrelid = 'public.ticket_submissions'::regclass) then
    alter table public.ticket_submissions add constraint ticket_submissions_intake_source_check check (intake_source in ('web_upload', 'emailed_ticket'));
  end if;
end $$;

create index if not exists ticket_submissions_emailed_ticket_pending_idx
  on public.ticket_submissions(created_at desc)
  where intake_source = 'emailed_ticket' and status = 'awaiting_payment';

create or replace function public.protect_representation_intake_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.intake_source is distinct from old.intake_source or
     new.manual_link_created_by is distinct from old.manual_link_created_by or
     new.manual_link_created_at is distinct from old.manual_link_created_at then
    raise exception 'REPRESENTATION_INTAKE_SOURCE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_representation_intake_source on public.ticket_submissions;
create trigger protect_representation_intake_source
  before update on public.ticket_submissions
  for each row execute function public.protect_representation_intake_source();

comment on column public.ticket_submissions.intake_source is
  'How Fabsy obtained the ticket: a normal web upload or a staff-confirmed email receipt.';
comment on column public.ticket_submissions.manual_link_created_by is
  'Staff user who created private emailed-ticket consent and payment links.';
comment on column public.ticket_submissions.manual_link_created_at is
  'Time the one-time private link pair was created.';

commit;
