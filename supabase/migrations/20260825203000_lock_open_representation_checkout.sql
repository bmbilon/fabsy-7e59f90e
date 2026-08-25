-- Prevent a consented representation intake from changing underneath an open
-- or paid Stripe session. Status/timestamps remain mutable for webhook state.

begin;

create or replace function public.protect_open_representation_checkout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.service_type = 'representation' and exists (
    select 1
    from public.idr_checkout_intents intent
    where intent.ticket_submission_id = old.id
      and intent.checkout_kind in ('ticket_only', 'ticket_with_addon')
      and intent.status in ('creating', 'open', 'paid')
  ) and (
    new.client_id is distinct from old.client_id or
    new.first_name is distinct from old.first_name or
    new.last_name is distinct from old.last_name or
    new.email is distinct from old.email or
    new.phone is distinct from old.phone or
    new.address is distinct from old.address or
    new.city is distinct from old.city or
    new.postal_code is distinct from old.postal_code or
    new.date_of_birth is distinct from old.date_of_birth or
    new.drivers_license is distinct from old.drivers_license or
    new.ticket_number is distinct from old.ticket_number or
    new.violation is distinct from old.violation or
    new.fine_amount is distinct from old.fine_amount or
    new.violation_date is distinct from old.violation_date or
    new.court_location is distinct from old.court_location or
    new.court_date is distinct from old.court_date or
    new.defense_strategy is distinct from old.defense_strategy or
    new.additional_notes is distinct from old.additional_notes or
    new.insurance_company is distinct from old.insurance_company or
    new.sms_opt_in is distinct from old.sms_opt_in or
    new.source_assessment_id is distinct from old.source_assessment_id or
    new.representation_includes_assessment is distinct from old.representation_includes_assessment or
    new.ticket_document_path is distinct from old.ticket_document_path or
    new.representation_access_token_hash is distinct from old.representation_access_token_hash or
    new.consent_form_path is distinct from old.consent_form_path
  ) then
    raise exception 'REPRESENTATION_CHECKOUT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_open_representation_checkout
  on public.ticket_submissions;
create trigger protect_open_representation_checkout
  before update on public.ticket_submissions
  for each row execute function public.protect_open_representation_checkout();

comment on function public.protect_open_representation_checkout() is
  'Keeps the represented matter, capability and consent immutable while a Stripe checkout is creating, open or paid.';

commit;
