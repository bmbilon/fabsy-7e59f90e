-- Private policy-document support and signed review consent for Ticket Triage.
-- Existing assessment rows are retained with an empty document list and null
-- consent; new public intake validation is enforced by the Edge Function.

begin;

alter table public.ticket_submissions
  add column if not exists assessment_policy_paths text[],
  add column if not exists review_consent jsonb;

update public.ticket_submissions
set assessment_policy_paths = '{}'::text[]
where assessment_policy_paths is null;

alter table public.ticket_submissions
  alter column assessment_policy_paths set default '{}'::text[],
  alter column assessment_policy_paths set not null;

alter table public.ticket_submissions
  drop constraint if exists ticket_submissions_assessment_policy_paths_check,
  drop constraint if exists ticket_submissions_review_consent_check;

alter table public.ticket_submissions
  add constraint ticket_submissions_assessment_policy_paths_check
    check (cardinality(assessment_policy_paths) between 0 and 5),
  add constraint ticket_submissions_review_consent_check
    check (
      review_consent is null or (
        jsonb_typeof(review_consent) = 'object' and
        review_consent @> '{"schema_version":1,"consent_version":"ticket-triage-review-v1","accepted":true}'::jsonb and
        coalesce(jsonb_typeof(review_consent -> 'digital_signature') = 'string', false) and
        length(review_consent ->> 'digital_signature') between 1 and 200 and
        coalesce(jsonb_typeof(review_consent -> 'signed_at') = 'string', false) and
        coalesce(jsonb_typeof(review_consent -> 'captured_at') = 'string', false)
      )
    );

-- Keep the existing signed ticket-upload lane aligned with mobile capture,
-- which can produce HEIC or HEIF files.
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assessment-policy-documents',
  'assessment-policy-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Assessment staff can read policy documents" on storage.objects;
create policy "Assessment staff can read policy documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assessment-policy-documents' and
    public.is_idr_staff()
  );

-- Keep the new private source documents and the customer's signed consent
-- covered by the assessment's existing post-delivery immutability boundary.
create or replace function public.protect_delivered_ticket_assessment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.service_type = 'ticket_insurance_assessment' and
     old.assessment_delivered_at is not null and (
       new.assessment_result is distinct from old.assessment_result or
       new.assessment_delivered_at is distinct from old.assessment_delivered_at or
       new.assessment_ticket_path is distinct from old.assessment_ticket_path or
       new.assessment_policy_paths is distinct from old.assessment_policy_paths or
       new.review_consent is distinct from old.review_consent or
       new.assessment_paid_at is distinct from old.assessment_paid_at or
       new.client_id is distinct from old.client_id
     ) then
    raise exception 'Delivered ticket assessments are immutable.';
  end if;
  return new;
end;
$$;

comment on column public.ticket_submissions.assessment_policy_paths is
  'Server-generated private object paths for policy documents supplied with a Ticket Triage intake.';
comment on column public.ticket_submissions.review_consent is
  'Validated, versioned, signed customer consent for Fabsy to review the supplied ticket and policy documents.';

commit;
