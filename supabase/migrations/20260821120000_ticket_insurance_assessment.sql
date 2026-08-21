-- $149 Traffic Ticket + Insurance Impact Assessment.
-- Reuses the existing client/case, Stripe reservation, staff-role, Resend, and
-- Supabase private-storage architecture without exposing ticket documents.

begin;

alter table public.ticket_submissions
  add column if not exists service_type text not null default 'representation',
  add column if not exists assessment_intake jsonb,
  add column if not exists assessment_result jsonb,
  add column if not exists assessment_ticket_path text,
  add column if not exists assessment_access_token_hash text,
  add column if not exists assessment_price_cad numeric(10, 2),
  add column if not exists assessment_paid_at timestamptz,
  add column if not exists assessment_delivered_at timestamptz,
  add column if not exists assessment_checkout_session_id text,
  add column if not exists assessment_payment_intent_id text,
  add column if not exists assessment_confirmation_claimed_at timestamptz,
  add column if not exists assessment_confirmation_sent_at timestamptz,
  add column if not exists assessment_delivery_claimed_at timestamptz,
  add column if not exists assessment_delivery_sent_at timestamptz,
  add column if not exists representation_credit_eligible boolean not null default false;

alter table public.ticket_submissions
  drop constraint if exists ticket_submissions_service_type_check,
  drop constraint if exists ticket_submissions_assessment_price_check,
  drop constraint if exists ticket_submissions_assessment_shape_check;

alter table public.ticket_submissions
  add constraint ticket_submissions_service_type_check
    check (service_type in ('representation', 'ticket_insurance_assessment')),
  add constraint ticket_submissions_assessment_price_check
    check (
      (service_type = 'representation' and assessment_price_cad is null) or
      (service_type = 'ticket_insurance_assessment' and assessment_price_cad = 149.00)
    ),
  add constraint ticket_submissions_assessment_shape_check
    check (
      service_type = 'representation' or (
        assessment_intake is not null and
        assessment_ticket_path is not null and
        assessment_access_token_hash is not null and
        representation_credit_eligible = false
      )
    );

create unique index if not exists idx_ticket_submissions_assessment_checkout_session
  on public.ticket_submissions (assessment_checkout_session_id)
  where assessment_checkout_session_id is not null;
create unique index if not exists idx_ticket_submissions_assessment_payment_intent
  on public.ticket_submissions (assessment_payment_intent_id)
  where assessment_payment_intent_id is not null;
create index if not exists idx_ticket_submissions_assessment_queue
  on public.ticket_submissions (status, created_at)
  where service_type = 'ticket_insurance_assessment';

-- The existing reservation table is intentionally generalized here so the
-- established idempotency and webhook reconciliation lane can serve the offer.
alter table public.idr_checkout_intents
  drop constraint if exists idr_checkout_intents_type_check,
  drop constraint if exists idr_checkout_intents_checkout_kind_check,
  drop constraint if exists idr_checkout_intents_expected_amount_cents_check,
  drop constraint if exists idr_checkout_intents_product_price_check,
  drop constraint if exists idr_checkout_intents_linkage_check;

alter table public.idr_checkout_intents
  add constraint idr_checkout_intents_type_check
    check (type in ('ticket', 'standalone', 'addon', 'assessment')),
  add constraint idr_checkout_intents_checkout_kind_check
    check (checkout_kind in ('ticket_only', 'idr_only', 'ticket_with_addon', 'ticket_assessment')),
  add constraint idr_checkout_intents_expected_amount_cents_check
    check (expected_amount_cents in (9900, 12900, 14900, 48800)),
  add constraint idr_checkout_intents_product_price_check
    check (
      (type = 'ticket' and expected_amount_cents = 48800 and checkout_kind = 'ticket_only') or
      (type = 'standalone' and expected_amount_cents = 12900 and checkout_kind = 'idr_only') or
      (type = 'addon' and expected_amount_cents = 9900 and checkout_kind in ('idr_only', 'ticket_with_addon')) or
      (type = 'assessment' and expected_amount_cents = 14900 and checkout_kind = 'ticket_assessment')
    ),
  add constraint idr_checkout_intents_linkage_check
    check (
      (ticket_submission_id is null and client_id is null and type = 'standalone') or
      (ticket_submission_id is not null and client_id is not null)
    );

create unique index if not exists idx_idr_checkout_intents_assessment_purchase
  on public.idr_checkout_intents (ticket_submission_id)
  where ticket_submission_id is not null and type = 'assessment';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assessment-tickets',
  'assessment-tickets',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Assessment staff can read ticket files" on storage.objects;
create policy "Assessment staff can read ticket files"
  on storage.objects for select to authenticated
  using (bucket_id = 'assessment-tickets' and public.is_idr_staff());

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
       new.assessment_paid_at is distinct from old.assessment_paid_at or
       new.client_id is distinct from old.client_id
     ) then
    raise exception 'Delivered ticket assessments are immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_delivered_ticket_assessment on public.ticket_submissions;
create trigger protect_delivered_ticket_assessment
  before update on public.ticket_submissions
  for each row execute function public.protect_delivered_ticket_assessment();

comment on column public.ticket_submissions.assessment_intake is
  'Validated, schema-versioned customer inputs for the $149 ticket and insurance impact assessment.';
comment on column public.ticket_submissions.assessment_result is
  'Human-reviewed structured charge, deadline, demerit, insurance, economics, recommendation, and next-step result.';
comment on column public.ticket_submissions.assessment_access_token_hash is
  'SHA-256 proof-of-possession hash used only to resume the anonymous pre-payment checkout.';
comment on column public.ticket_submissions.representation_credit_eligible is
  'Centralized business-policy switch. False means no public or contractual $149 representation credit is offered.';

commit;
