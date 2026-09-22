begin;

-- Service context only: no campaign IDs, cookies or inferred attribution.
alter table public.ticket_submissions
  add column intake_ticket_type text check (intake_ticket_type in ('officer_issued','photo_radar')),
  add column intake_bundle_requested boolean not null default false,
  add column landing_page_variant text check (landing_page_variant in ('rapid-resolution','photo-radar'));

-- Keep the original RPC for older clients. Creation and contact capture share
-- a transaction, so an interrupted upload cannot leave a new contactless lead.
create function public.prepare_photo_ticket_with_contact(
  p_id uuid, p_token_hash text, p_consent jsonb, p_ticket_path text,
  p_email text, p_ticket_type text, p_bundle_requested boolean,
  p_landing_page text default null, p_source_assessment_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare client_id uuid; ticket public.ticket_submissions;
begin
  if p_email is null or length(p_email) > 255 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_ticket_type is null or p_ticket_type not in ('officer_issued','photo_radar')
    or (p_landing_page is not null and p_landing_page not in ('rapid-resolution','photo-radar'))
    or p_bundle_requested is null or (p_ticket_type = 'photo_radar' and p_bundle_requested)
    then raise exception 'INTAKE_CONTEXT_INVALID'; end if;
  client_id := public.prepare_photo_ticket_intake(p_id,p_token_hash,p_consent,p_ticket_path,p_source_assessment_id,p_ticket_type);
  select * into ticket from public.ticket_submissions where id=p_id for update;
  if ticket.client_id <> p_id then raise exception 'INTAKE_AUTHORIZATION_INVALID'; end if;
  -- Retries cannot change the accepted context or contact behind a saved PDF.
  if ticket.intake_ticket_type is not null and (
      ticket.email is distinct from lower(trim(p_email)) or ticket.intake_ticket_type is distinct from p_ticket_type
      or ticket.intake_bundle_requested is distinct from p_bundle_requested
      or ticket.landing_page_variant is distinct from p_landing_page)
    then raise exception 'INTAKE_CONTEXT_CHANGED'; end if;
  update public.ticket_submissions set email=lower(trim(p_email)), intake_ticket_type=p_ticket_type,
    intake_bundle_requested=p_bundle_requested, landing_page_variant=p_landing_page, updated_at=now() where id=p_id;
  update public.clients set email=lower(trim(p_email)), updated_at=now() where id=client_id;
  return client_id;
end;
$$;
revoke all on function public.prepare_photo_ticket_with_contact(uuid,text,jsonb,text,text,text,boolean,text,uuid) from public, anon, authenticated;
grant execute on function public.prepare_photo_ticket_with_contact(uuid,text,jsonb,text,text,text,boolean,text,uuid) to service_role;
comment on column public.ticket_submissions.intake_ticket_type is 'Customer-selected offer hint; scanned/reviewed ticket_type remains eligibility and pricing authority.';
comment on column public.ticket_submissions.landing_page_variant is 'Allowlisted service entry page passed explicitly on intake; not campaign or visitor attribution.';
commit;
