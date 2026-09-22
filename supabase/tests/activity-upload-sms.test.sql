begin;
do $$
declare draft_id_value uuid; parent_id uuid; portal_id uuid; path_value text;
begin
  select id into draft_id_value from public.ticket_intake_drafts where deleted_at is null and contact_permission
    and status in ('active','converted') and expires_at>now() and ticket_uploaded_at is not null limit 1 for update;
  if draft_id_value is null then raise exception 'An eligible draft fixture is required'; end if;
  path_value:=draft_id_value::text||'/representation-ticket-r999999997.jpg';
  update public.ticket_intake_drafts set ticket_document_path=path_value where id=draft_id_value;
  select id,portal_activity_event_id into parent_id,portal_id from public.ticket_upload_alerts
    where draft_id=draft_id_value and object_fingerprint=encode(sha256(convert_to(path_value,'UTF8')),'hex');
  if parent_id is null or portal_id is null then raise exception 'SMS parent or email route missing'; end if;
  if not exists(select 1 from public.ticket_upload_sms_alerts where alert_id=parent_id and status='pending') then
    raise exception 'Upload SMS was suppressed'; end if;
  if exists(select 1 from public.claim_ticket_upload_alerts(10) where id=parent_id) then
    raise exception 'Legacy worker would duplicate the email'; end if;
  if not exists(select 1 from public.claim_ticket_upload_sms_alerts(10) where alert_id=parent_id) then
    raise exception 'Upload SMS cannot be claimed'; end if;
  perform public.enqueue_ticket_upload_alert(draft_id_value);
  if (select count(*) from public.ticket_upload_alerts where portal_activity_event_id=portal_id)<>1 then
    raise exception 'Upload replay duplicated SMS'; end if;
end $$;
rollback;
