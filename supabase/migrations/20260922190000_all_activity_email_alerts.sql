begin;

alter table public.portal_activity_state drop constraint portal_activity_state_recipient_check;
alter table public.portal_activity_state alter column recipient set default 'hello@fabsy.ca';
update public.portal_activity_state set recipient='hello@fabsy.ca';
alter table public.portal_activity_state add constraint portal_activity_state_recipient_check check(recipient='hello@fabsy.ca');

-- Both signed webhooks and database fulfillment use this same durable queue.
-- Canonical session keys also recognize alerts delivered before this migration.
create or replace function public.enqueue_portal_activity(
  p_event_key text, p_event_type text, p_entity_type text,
  p_entity_id uuid, p_payload jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare key_value text:=p_event_key; existing_id uuid; session_id text;
begin
  if p_event_key is null or length(p_event_key) not between 1 and 500 or
     p_event_type is null or length(p_event_type) not between 1 and 80 or
     p_entity_type is null or length(p_entity_type) not between 1 and 80 or
     p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'PORTAL_ACTIVITY_INVALID';
  end if;
  session_id:=nullif(p_payload->>'stripe_checkout_session_id','');
  if p_event_type='payment_paid' and session_id is not null then
    key_value:='payment:checkout:'||session_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(key_value,0));
  select id into existing_id from public.portal_activity_events
    where event_key=key_value or (p_event_type='payment_paid' and session_id is not null
      and event_type='payment_paid' and payload->>'stripe_checkout_session_id'=session_id)
    order by occurred_at limit 1;
  if existing_id is not null then
    -- Enrich an alert while it is still waiting, never mutate a sent email.
    update public.portal_activity_events set payload=payload||jsonb_strip_nulls(p_payload)
      where id=existing_id and status='pending' and attempts=0;
    return;
  end if;
  insert into public.portal_activity_events(event_key,event_type,entity_type,entity_id,payload)
    values(key_value,p_event_type,p_entity_type,p_entity_id,p_payload)
    on conflict(event_key) do nothing;
end $$;
revoke all on function public.enqueue_portal_activity(text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_portal_activity(text,text,text,uuid,jsonb) to service_role;
create index if not exists portal_activity_payment_session
  on public.portal_activity_events((payload->>'stripe_checkout_session_id')) where event_type='payment_paid';

-- Confirmed storage writes cover anonymous uploads and unfinished intakes.
-- Only private ticket uploads qualify; no read, preview, or signed-URL creation.
create function public.emit_ticket_file_activity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket public.ticket_submissions%rowtype; draft public.ticket_intake_drafts%rowtype; base jsonb;
begin
  if new.bucket_id<>'assessment-tickets' or coalesce((to_jsonb(new)->>'is_delete_marker')::boolean,false) then return new; end if;
  if tg_op='UPDATE' and new.version is not distinct from old.version then return new; end if;
  select * into ticket from public.ticket_submissions
    where deleted_at is null and (ticket_document_path=new.name or assessment_ticket_path=new.name) limit 1;
  select * into draft from public.ticket_intake_drafts
    where deleted_at is null and ticket_document_path=new.name limit 1;
  base:=jsonb_build_object('submission_id',ticket.id,'ticket_number',ticket.ticket_number,
    'client_name',nullif(btrim(concat_ws(' ',ticket.first_name,ticket.last_name)),''),
    'client_email',coalesce(nullif(ticket.email,''),draft.email),
    'client_phone',coalesce(nullif(ticket.phone,''),draft.phone),
    'file_name',new.name,'intake_source','Website ticket upload');
  perform public.enqueue_portal_activity('ticket-file:'||encode(sha256(convert_to(new.name,'UTF8')),'hex'),
    'ticket_uploaded','storage_object',null,base);
  return new;
end $$;
revoke all on function public.emit_ticket_file_activity() from public,anon,authenticated,service_role;
create trigger fabsy_ticket_file_activity after insert or update on storage.objects
  for each row execute function public.emit_ticket_file_activity();

-- Route future legacy draft emails through the same file key; keep existing
-- email jobs and the independent SMS queue intact.
create or replace function public.enqueue_ticket_upload_alert(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare draft public.ticket_intake_drafts%rowtype; key_value text; notice_id uuid;
begin
  select * into draft from public.ticket_intake_drafts where id=p_draft_id;
  if not found or draft.deleted_at is not null or draft.ticket_uploaded_at is null
    or nullif(draft.ticket_document_path,'') is null then return null; end if;
  key_value:='ticket-file:'||encode(sha256(convert_to(draft.ticket_document_path,'UTF8')),'hex');
  perform public.enqueue_portal_activity(key_value,'ticket_uploaded','ticket_intake_draft',draft.id,
    jsonb_build_object('client_name',nullif(btrim(concat_ws(' ',draft.draft_data->>'firstName',draft.draft_data->>'lastName')),''),
      'client_email',draft.email,'client_phone',draft.phone,'ticket_number',draft.draft_data->>'ticketNumber',
      'file_name',draft.ticket_document_path,'intake_source','Website ticket upload'));
  select id into notice_id from public.portal_activity_events where event_key=key_value;
  return notice_id;
end $$;

create or replace function public.emit_ticket_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare base jsonb;
begin
  base := public.portal_client_snapshot(new.client_id) || jsonb_build_object(
    'submission_id',new.id,
    'client_name',nullif(btrim(concat_ws(' ',new.first_name,new.last_name)),''),
    'client_email',new.email,
    'ticket_number',new.ticket_number,
    'product',coalesce(new.order_type,new.service_type),
    'intake_source',new.intake_source,
    'status',new.status
  );
  if tg_op='INSERT' then
    perform public.enqueue_portal_activity('intake:'||new.id,'intake_created','ticket_submission',new.id,base);
    if new.consent_form_path is not null then
      perform public.enqueue_portal_activity('representation-consent:'||new.id||':'||new.consent_form_path,
        'representation_consent_signed','ticket_submission',new.id,
        base || jsonb_build_object('consent_form_path',new.consent_form_path));
    end if;
    if new.review_consent is not null then
      perform public.enqueue_portal_activity('review-consent:'||new.id,'review_consent_signed','ticket_submission',new.id,base);
    end if;
  else
    if new.review_consent is not null and old.review_consent is null then
      perform public.enqueue_portal_activity('review-consent:'||new.id,'review_consent_signed','ticket_submission',new.id,base);
    end if;
    if new.consent_form_path is not null and new.consent_form_path is distinct from old.consent_form_path then
      perform public.enqueue_portal_activity('representation-consent:'||new.id||':'||new.consent_form_path,
        'representation_consent_signed','ticket_submission',new.id,
        base || jsonb_build_object('consent_form_path',new.consent_form_path));
    end if;
    if new.referral_refunded_at is not null and old.referral_refunded_at is null then
      perform public.enqueue_portal_activity('refund:'||coalesce(new.referral_payment_intent_id,new.id::text),
        'payment_refunded','ticket_submission',new.id,base);
    end if;
    if new.referral_disputed_at is not null and old.referral_disputed_at is null then
      perform public.enqueue_portal_activity('dispute:'||coalesce(new.referral_payment_intent_id,new.id::text),
        'payment_disputed','ticket_submission',new.id,base);
    end if;
  end if;
  return new;
end;
$$;

comment on table public.portal_activity_events is
  'Internal activity alerts to hello@fabsy.ca. Client, submission and traffic ticket identifiers are optional. Passive browsing is excluded.';
commit;
