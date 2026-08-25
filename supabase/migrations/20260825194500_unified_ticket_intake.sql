-- Join the review and representation funnels around one durable ticket source.

begin;

alter table public.ticket_submissions
  add column if not exists ticket_document_path text,
  add column if not exists source_assessment_id uuid references public.ticket_submissions(id) on delete set null,
  add column if not exists representation_includes_assessment boolean not null default false,
  add column if not exists assessment_payment_source text;

alter table public.ticket_submissions
  drop constraint if exists ticket_submissions_representation_assessment_check,
  drop constraint if exists ticket_submissions_assessment_payment_source_check;

alter table public.ticket_submissions
  add constraint ticket_submissions_representation_assessment_check
    check (
      representation_includes_assessment = false or (
        service_type = 'representation' and
        source_assessment_id is not null
      )
    ),
  add constraint ticket_submissions_assessment_payment_source_check
    check (
      assessment_payment_source is null or (
        service_type = 'ticket_insurance_assessment' and
        assessment_payment_source in ('standalone', 'included_with_representation')
      )
    );

create or replace function public.enforce_ticket_triage_upgrade_benefits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.service_type = 'ticket_insurance_assessment' then
    new.representation_credit_eligible :=
      new.assessment_payment_source is distinct from 'included_with_representation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_ticket_triage_upgrade_benefits on public.ticket_submissions;
create trigger enforce_ticket_triage_upgrade_benefits
  before insert or update of service_type, representation_credit_eligible, assessment_payment_source
  on public.ticket_submissions
  for each row execute function public.enforce_ticket_triage_upgrade_benefits();

alter table public.ticket_submissions
  drop constraint if exists ticket_submissions_assessment_shape_check;

alter table public.ticket_submissions
  add constraint ticket_submissions_assessment_shape_check
    check (
      service_type = 'representation' or (
        assessment_intake is not null and
        assessment_ticket_path is not null and
        assessment_access_token_hash is not null and
        representation_credit_eligible =
          (assessment_payment_source is distinct from 'included_with_representation')
      )
    );

create index if not exists ticket_submissions_source_assessment_idx
  on public.ticket_submissions (source_assessment_id)
  where source_assessment_id is not null;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]
where id = 'assessment-tickets';

comment on column public.ticket_submissions.ticket_document_path is
  'Private assessment-tickets object path used as the durable source ticket for a representation case.';
comment on column public.ticket_submissions.source_assessment_id is
  'Review intake that supplied the ticket, policy documents and review consent for this representation case.';
comment on column public.ticket_submissions.representation_includes_assessment is
  'True when the $488 representation checkout also activates the linked priority review deliverable.';
comment on column public.ticket_submissions.assessment_payment_source is
  'Whether an assessment was purchased standalone or included with a paid representation.';
comment on function public.enforce_ticket_triage_upgrade_benefits() is
  'Preserves the $149 credit for standalone paid reviews while preventing a second credit when the review was included in representation.';

commit;
