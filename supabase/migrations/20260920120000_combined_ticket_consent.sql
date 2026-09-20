begin;

alter table public.ticket_submissions add column if not exists intake_consent jsonb;
alter table public.ticket_submissions add constraint ticket_submissions_intake_consent_check
  check (intake_consent is null or coalesce((
    jsonb_typeof(intake_consent) = 'object' and
    intake_consent->>'accepted' = 'true' and
    intake_consent->>'method' in ('checkbox', 'typed') and
    nullif(intake_consent->>'version', '') is not null and
    nullif(intake_consent->>'acceptedAt', '') is not null
  ), false));

comment on column public.ticket_submissions.intake_consent is
  'Affirmative intake acceptance: method, server timestamp, identity and exact versioned wording. A checkbox is not recorded as a typed or government-form signature.';

create or replace function public.protect_intake_consent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.intake_consent is distinct from old.intake_consent and exists (
    select 1 from public.idr_checkout_intents where ticket_submission_id = old.id
      and checkout_kind in ('ticket_only', 'ticket_with_addon', 'photo_radar')
      and status in ('creating', 'open', 'paid')
  ) then raise exception 'REPRESENTATION_CHECKOUT_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger protect_intake_consent before update on public.ticket_submissions
  for each row execute function public.protect_intake_consent();

commit;
