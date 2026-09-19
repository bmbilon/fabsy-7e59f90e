\set ON_ERROR_STOP on
begin;
do $$ begin
 if (select count(*) from public.ticket_upload_alerts) <> 1 then raise exception 'historical fixture missing'; end if;
 if exists(select 1 from public.ticket_upload_sms_alerts) then raise exception 'old uploads must not be backfilled'; end if;
 if has_table_privilege('anon','public.ticket_upload_sms_alerts','select') or has_table_privilege('authenticated','public.ticket_upload_sms_alerts','select') then raise exception 'private SMS queue exposed'; end if;
 if has_function_privilege('anon','public.claim_ticket_upload_sms_alerts(integer)','execute') or has_function_privilege('authenticated','public.finish_ticket_upload_sms_alert(uuid,uuid,text,text,text)','execute') then raise exception 'SMS mutation exposed'; end if;
 if has_function_privilege('anon','public.get_ticket_upload_alert_statuses()','execute') then raise exception 'staff status exposed to anon'; end if;
 begin
  perform public.get_ticket_upload_alert_statuses();
  raise exception 'anonymous status lookup passed';
 exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000050';
do $$ begin
 begin
  perform public.get_ticket_upload_alert_statuses();
  raise exception 'nonstaff status lookup passed';
 exception when insufficient_privilege then null; end;
end $$;
set local test.is_staff='true';
do $$ begin
 if not exists(select 1 from public.get_ticket_upload_alert_statuses() where sms_status is null) then raise exception 'historical upload status unavailable'; end if;
end $$;
insert into public.ticket_intake_drafts(id,access_token_hash,email,ticket_document_path)
values ('00000000-0000-4000-8000-000000000001',repeat('a',64),'lead@example.com','first.pdf');
do $$ begin
 if exists(select 1 from public.ticket_upload_sms_alerts) then raise exception 'bare contact alerted'; end if;
end $$;
select public.confirm_ticket_intake_draft_upload('00000000-0000-4000-8000-000000000001',repeat('a',64),1);
select public.confirm_ticket_intake_draft_upload('00000000-0000-4000-8000-000000000001',repeat('a',64),2);
select public.enqueue_ticket_upload_alert('00000000-0000-4000-8000-000000000001');
do $$ begin
 if (select count(*) from public.ticket_upload_sms_alerts) <> 1 then raise exception 'confirmation replay duplicated SMS'; end if;
end $$;
create temporary table sms_claims as select * from public.claim_ticket_upload_sms_alerts(10);
do $$ declare a public.ticket_upload_sms_alerts%rowtype; begin
 if exists(select 1 from public.claim_ticket_upload_sms_alerts(10)) then raise exception 'active SMS lease reclaimed'; end if;
 select * into a from sms_claims;
 if public.finish_ticket_upload_sms_alert(a.alert_id,gen_random_uuid(),'accepted','SM'||repeat('a',32),null) then raise exception 'wrong SMS claim completed'; end if;
 if not public.finish_ticket_upload_sms_alert(a.alert_id,a.claim_id,'accepted','SM'||repeat('a',32),null) then raise exception 'SMS acceptance not saved'; end if;
 if not exists(select 1 from public.get_ticket_upload_alert_statuses() where draft_id='00000000-0000-4000-8000-000000000001' and email_status='pending' and sms_status='accepted') then raise exception 'independent channel statuses incorrect'; end if;
 if exists(select 1 from public.claim_ticket_upload_sms_alerts(10)) then raise exception 'accepted SMS retried'; end if;
end $$;
update public.ticket_intake_drafts set revision=3,pending_ticket_document_path='replacement.pdf',
pending_ticket_document_content_type='application/pdf',pending_ticket_document_size_bytes=1200
where id='00000000-0000-4000-8000-000000000001';
select public.confirm_ticket_intake_draft_upload('00000000-0000-4000-8000-000000000001',repeat('a',64),3);
create temporary table second_sms_claims as select * from public.claim_ticket_upload_sms_alerts(10);
do $$ begin
 if (select count(*) from second_sms_claims) <> 1 then raise exception 'replacement alert missing'; end if;
end $$;
update public.ticket_upload_sms_alerts set claim_expires_at=now()-interval '1 minute' where status='sending';
do $$ declare a public.ticket_upload_sms_alerts%rowtype; begin
 if exists(select 1 from public.claim_ticket_upload_sms_alerts(10)) then raise exception 'expired SMS claim blindly retried'; end if;
 if (select count(*) from public.ticket_upload_sms_alerts where status='indeterminate') <> 1 then raise exception 'expired SMS not held for review'; end if;
 select * into a from second_sms_claims;
 if public.finish_ticket_upload_sms_alert(a.alert_id,a.claim_id,'accepted','SM'||repeat('b',32),null) then raise exception 'lost lease completed'; end if;
 if not exists(select 1 from public.get_ticket_upload_alert_statuses() where draft_id='00000000-0000-4000-8000-000000000001' and sms_status='indeterminate') then raise exception 'latest status does not expose uncertainty'; end if;
end $$;
update public.ticket_intake_drafts set deleted_at=now() where id='00000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.get_ticket_upload_alert_statuses() where draft_id='00000000-0000-4000-8000-000000000001') then raise exception 'deleted intake visible'; end if;
end $$;
delete from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.ticket_upload_sms_alerts) then raise exception 'SMS records survived draft retention'; end if;
end $$;
insert into public.ticket_intake_drafts(id,email,ticket_document_path,ticket_uploaded_at)
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'lead@example.com','pending-'||n||'.pdf',clock_timestamp()
from generate_series(10,13) n;
update public.ticket_intake_drafts set deleted_at=now() where id='00000000-0000-4000-8000-000000000010';
update public.ticket_intake_drafts set expires_at=now()-interval '1 day' where id='00000000-0000-4000-8000-000000000011';
update public.ticket_intake_drafts set contact_permission=false where id='00000000-0000-4000-8000-000000000012';
update public.ticket_intake_drafts set status='expired' where id='00000000-0000-4000-8000-000000000013';
do $$ begin
 if exists(select 1 from public.claim_ticket_upload_sms_alerts(10)) then raise exception 'closed intake still claimed for SMS'; end if;
 if (select count(*) from public.ticket_upload_sms_alerts where status='cancelled' and failure_code='intake_unavailable') <> 4 then raise exception 'ineligible pending alerts not cancelled'; end if;
 raise notice 'ticket upload SMS database tests passed';
end $$;
rollback;
