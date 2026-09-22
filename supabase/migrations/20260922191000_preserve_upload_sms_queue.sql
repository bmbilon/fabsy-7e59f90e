begin;
-- Keep the legacy row as the parent of the independent SMS queue while routing
-- its email through the shared activity outbox.
alter table public.ticket_upload_alerts add column portal_activity_event_id uuid references public.portal_activity_events(id);
create or replace function public.enqueue_ticket_upload_alert(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare draft public.ticket_intake_drafts%rowtype; key_value text; notice_id uuid; legacy_id uuid;
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
  if draft.contact_permission and draft.status in ('active','converted') and draft.expires_at>clock_timestamp() then
    insert into public.ticket_upload_alerts(draft_id,object_fingerprint,uploaded_at,contact_snapshot,portal_activity_event_id)
      values(draft.id,encode(sha256(convert_to(draft.ticket_document_path,'UTF8')),'hex'),draft.ticket_uploaded_at,
        jsonb_build_object('firstName',left(coalesce(draft.draft_data->>'firstName',''),120),
          'lastName',left(coalesce(draft.draft_data->>'lastName',''),120),
          'email',draft.email,'phone',draft.phone,'preferredLocale',draft.preferred_locale),notice_id)
      on conflict(draft_id,object_fingerprint) do nothing returning id into legacy_id;
  end if;
  return coalesce(legacy_id,notice_id);
end $$;

create or replace function public.claim_ticket_upload_alerts(p_limit integer default 10)
returns setof public.ticket_upload_alerts
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'TICKET_UPLOAD_ALERT_LIMIT_INVALID';
  end if;
  -- Never repeat a potentially accepted send outside the provider's 24h fence.
  update public.ticket_upload_alerts
    set status = 'indeterminate', failure_code = 'idempotency_window_elapsed',
        claim_id = null, claim_expires_at = null
    where status in ('retry','sending') and first_attempt_at <= clock_timestamp() - interval '23 hours'
      and (status <> 'sending' or claim_expires_at <= clock_timestamp());
  return query
  with candidates as (
    select id from public.ticket_upload_alerts
    where ((status in ('pending','retry') and next_attempt_at <= clock_timestamp())
      or (status = 'sending' and claim_expires_at <= clock_timestamp()))
      and portal_activity_event_id is null
      and (first_attempt_at is null or first_attempt_at > clock_timestamp() - interval '23 hours')
    order by created_at, id limit p_limit for update skip locked
  )
  update public.ticket_upload_alerts a
    set status = 'sending', claim_id = gen_random_uuid(),
        claim_expires_at = clock_timestamp() + interval '3 minutes',
        first_attempt_at = coalesce(first_attempt_at, clock_timestamp()),
        attempt_count = attempt_count + 1, failure_code = null
    from candidates c where a.id = c.id returning a.*;
end $$;

create or replace function public.get_ticket_upload_alert_statuses()
returns table(draft_id uuid,email_status text,sms_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_idr_staff(),false) then
    raise exception using errcode='42501',message='TICKET_UPLOAD_ALERT_STAFF_REQUIRED';
  end if;
  return query select distinct on(a.draft_id) a.draft_id,case when e.id is null then a.status when e.status='processing' then 'sending' when e.status='needs_review' then 'indeterminate' else e.status end,s.status
    from public.ticket_upload_alerts a
    join public.ticket_intake_drafts d on d.id=a.draft_id
    left join public.portal_activity_events e on e.id=a.portal_activity_event_id
    left join public.ticket_upload_sms_alerts s on s.alert_id=a.id
    where d.status in ('active','converted') and d.deleted_at is null and d.expires_at>clock_timestamp()
    order by a.draft_id,a.uploaded_at desc,a.created_at desc,a.id desc;
end $$;

commit;
