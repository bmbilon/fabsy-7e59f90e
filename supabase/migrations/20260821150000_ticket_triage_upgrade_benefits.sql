-- Rename the $149 assessment offer to Ticket Triage and make its representation
-- upgrade benefits part of the persisted business policy.

begin;

alter table public.ticket_submissions
  drop constraint if exists ticket_submissions_assessment_shape_check;

update public.ticket_submissions
set representation_credit_eligible = true,
    updated_at = now()
where service_type = 'ticket_insurance_assessment'
  and representation_credit_eligible is distinct from true;

create or replace function public.enforce_ticket_triage_upgrade_benefits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.service_type = 'ticket_insurance_assessment' then
    new.representation_credit_eligible := true;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_ticket_triage_upgrade_benefits on public.ticket_submissions;
create trigger enforce_ticket_triage_upgrade_benefits
  before insert or update of service_type, representation_credit_eligible
  on public.ticket_submissions
  for each row execute function public.enforce_ticket_triage_upgrade_benefits();

alter table public.ticket_submissions
  add constraint ticket_submissions_assessment_shape_check
    check (
      service_type = 'representation' or (
        assessment_intake is not null and
        assessment_ticket_path is not null and
        assessment_access_token_hash is not null and
        representation_credit_eligible = true
      )
    );

create index if not exists idx_ticket_submissions_ticket_triage_upgrades
  on public.ticket_submissions (client_id, created_at desc)
  where service_type = 'ticket_insurance_assessment'
    and assessment_paid_at is not null
    and representation_credit_eligible = true;

comment on column public.ticket_submissions.representation_credit_eligible is
  'True for Ticket Triage orders. The same eligible matter receives priority representation placement and a $149 credit toward the $488 flat fee, leaving a $339 base-fee balance before GST.';

comment on function public.enforce_ticket_triage_upgrade_benefits() is
  'Keeps the Ticket Triage priority-upgrade and $149 representation-credit policy enabled during mixed-version deploys.';

commit;
