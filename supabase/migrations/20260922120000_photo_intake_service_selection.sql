begin;

-- Store the service shown at consent. The optional argument keeps older upload
-- clients working; the scan must confirm a selected type before checkout.
-- Deploy this migration, then photo-ticket-intake and generate-consent-form
-- (both bundle the scan worker), before publishing the updated uploader.
-- Replace the signature so PostgREST has one unambiguous RPC to resolve.
drop function public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid);

create or replace function public.prepare_photo_ticket_intake(
  p_id uuid, p_token_hash text, p_consent jsonb, p_ticket_path text, p_source_assessment_id uuid default null,
  p_ticket_type text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing public.ticket_submissions;
begin
  if p_ticket_type is not null and p_ticket_type not in ('officer_issued', 'photo_radar')
    then raise exception 'INTAKE_TICKET_TYPE_INVALID'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' or not coalesce((p_consent->>'accepted' = 'true'
    and p_consent->>'method' = 'checkbox'
    and p_consent->>'version' in ('photo-upload-consent-v2', 'photo-upload-consent-v3')
    and p_consent->>'ticketSubmissionId' = p_id::text
    and p_consent->>'ticketDocumentPath' = p_ticket_path
    and case when p_consent->>'version' = 'photo-upload-consent-v3'
      then jsonb_typeof(p_consent->'pleadNotGuilty') = 'boolean'
      else not (p_consent ? 'pleadNotGuilty') end), false)
    then raise exception 'INTAKE_AUTHORIZATION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing from public.ticket_submissions where id = p_id for update;
  if found then
    if existing.intake_mode <> 'photo_only' or existing.representation_access_token_hash <> p_token_hash
      or existing.ticket_document_path <> p_ticket_path then raise exception 'INTAKE_AUTHORIZATION_INVALID'; end if;
    if existing.status <> 'awaiting_payment' or exists(select 1 from public.idr_checkout_intents
      where ticket_submission_id=p_id and status in ('creating','open','paid'))
      then raise exception 'REPRESENTATION_CHECKOUT_IMMUTABLE'; end if;
    -- Network retries keep the original event and timestamp. A changed choice
    -- must not silently reuse a previously saved acceptance or signed PDF.
    if (existing.intake_consent - 'acceptedAt') is distinct from (p_consent - 'acceptedAt')
      then raise exception 'INTAKE_CONSENT_CHANGED'; end if;
    if p_ticket_type is not null and (existing.ticket_type_source <> 'manual' or existing.ticket_type <> p_ticket_type)
      then raise exception 'INTAKE_TICKET_TYPE_CHANGED'; end if;
    return existing.client_id;
  end if;
  insert into public.clients(id, drivers_license, first_name, last_name, email, phone)
    values(p_id, null, '', '', '', '');
  insert into public.ticket_submissions(id, client_id, first_name, last_name, email, phone,
    ticket_number, violation, fine_amount, status, service_type, preferred_locale,
    intake_mode, intake_review_status, intake_consent, representation_access_token_hash,
    ticket_document_path, source_assessment_id, representation_includes_assessment, ticket_type_source,
    ticket_type, order_type, review_path, additional_notes)
  values(p_id, p_id, '', '', '', '', '', '', '', 'awaiting_payment', 'representation', 'en',
    'photo_only', 'pending_scan', p_consent, p_token_hash, p_ticket_path, p_source_assessment_id,
    p_source_assessment_id is not null and coalesce(p_ticket_type, 'officer_issued') <> 'photo_radar',
    case when p_ticket_type is null then 'default' else 'manual' end,
    coalesce(p_ticket_type, 'officer_issued'),
    case when p_ticket_type = 'photo_radar' then 'photo_radar' else 'rapid_resolution' end,
    case when p_ticket_type = 'photo_radar' then 'ate' else 'standard' end,
    'Photo and affirmative consent submitted. Ticket details pending review; follow up for missing information.');
  return p_id;
end;
$$;
revoke all on function public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid,text) from public, anon, authenticated;
grant execute on function public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid,text) to service_role;

commit;
