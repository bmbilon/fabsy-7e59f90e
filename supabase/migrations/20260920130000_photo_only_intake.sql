begin;

-- A photo may arrive before any identity/contact details can be read. NULL is
-- deliberately used instead of inventing a driver's licence or matching OCR
-- against an existing customer's private record.
alter table public.clients alter column drivers_license drop not null;
alter table public.ticket_submissions
  add column intake_mode text not null default 'standard' check (intake_mode in ('standard', 'photo_only')),
  add column intake_review_status text not null default 'complete'
    check (intake_review_status in ('complete', 'pending_scan', 'scanning', 'needs_review', 'ready')),
  add column intake_scan_started_at timestamptz;

-- Ownership is confirmed after upload, before camera-ticket checkout.
alter table public.ticket_submissions drop constraint ticket_submissions_product_route_check;
alter table public.ticket_submissions add constraint ticket_submissions_product_route_check check (
  (ticket_type = 'photo_radar' and order_type = 'photo_radar' and review_path = 'ate'
    and (registered_owner_on_offence_date is not null or intake_mode = 'photo_only')
    and not representation_includes_assessment and insurance_company is null)
  or (ticket_type = 'officer_issued' and order_type = 'rapid_resolution'
    and review_path = 'standard' and registered_owner_on_offence_date is null)
);

create or replace function public.prepare_photo_ticket_intake(
  p_id uuid, p_token_hash text, p_consent jsonb, p_ticket_path text, p_source_assessment_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing public.ticket_submissions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing from public.ticket_submissions where id = p_id for update;
  if found then
    if existing.intake_mode <> 'photo_only' or existing.representation_access_token_hash <> p_token_hash
      or existing.ticket_document_path <> p_ticket_path then raise exception 'INTAKE_AUTHORIZATION_INVALID'; end if;
    if existing.status <> 'awaiting_payment' or exists(select 1 from public.idr_checkout_intents
      where ticket_submission_id=p_id and status in ('creating','open','paid'))
      then raise exception 'REPRESENTATION_CHECKOUT_IMMUTABLE'; end if;
    return existing.client_id;
  end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' or not coalesce((p_consent->>'accepted' = 'true'
    and p_consent->>'version' = 'photo-upload-consent-v2'
    and p_consent->>'ticketSubmissionId' = p_id::text
    and p_consent->>'ticketDocumentPath' = p_ticket_path), false) then raise exception 'INTAKE_AUTHORIZATION_INVALID'; end if;
  insert into public.clients(id, drivers_license, first_name, last_name, email, phone)
    values(p_id, null, '', '', '', '');
  insert into public.ticket_submissions(id, client_id, first_name, last_name, email, phone,
    ticket_number, violation, fine_amount, status, service_type, preferred_locale,
    intake_mode, intake_review_status, intake_consent, representation_access_token_hash,
    ticket_document_path, source_assessment_id, representation_includes_assessment, ticket_type_source,
    additional_notes)
  values(p_id, p_id, '', '', '', '', '', '', '', 'awaiting_payment', 'representation', 'en',
    'photo_only', 'pending_scan', p_consent, p_token_hash, p_ticket_path, p_source_assessment_id,
    p_source_assessment_id is not null, 'default',
    'Photo and affirmative consent submitted. Ticket details pending review; follow up for missing information.');
  return p_id;
end;
$$;
revoke all on function public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid) to service_role;

-- Contact changes are atomic, capability-bound and confined to the provisional
-- client created for this upload; a public request never relinks another client.
create or replace function public.save_photo_intake_contact(p_id uuid, p_token_hash text, p_email text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare ticket public.ticket_submissions;
begin
  select * into ticket from public.ticket_submissions where id = p_id for update;
  if not found or ticket.intake_mode <> 'photo_only' or ticket.client_id <> ticket.id
    or ticket.representation_access_token_hash <> p_token_hash or ticket.consent_form_path is null
    or ticket.status <> 'awaiting_payment' then raise exception 'INTAKE_AUTHORIZATION_INVALID'; end if;
  if exists(select 1 from public.idr_checkout_intents where ticket_submission_id=p_id and status in ('creating','open','paid'))
    then raise exception 'REPRESENTATION_CHECKOUT_IMMUTABLE'; end if;
  update public.ticket_submissions set email=p_email, phone=p_phone, updated_at=now() where id=p_id;
  update public.clients set email=p_email, phone=p_phone, updated_at=now() where id=ticket.client_id;
end;
$$;
revoke all on function public.save_photo_intake_contact(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.save_photo_intake_contact(uuid,text,text,text) to service_role;

comment on column public.ticket_submissions.intake_review_status is
  'Photo-only submissions are received before scanning. Missing details need staff follow-up; this is separate from payment status.';
commit;
