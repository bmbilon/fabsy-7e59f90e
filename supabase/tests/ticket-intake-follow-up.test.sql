\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
select pg_temp.assert_true((select d.follow_up_email_sent_at=a.sent_at and d.follow_up_email_sent_by is null
  and d.staff_follow_up_status='dismissed' and d.deleted_at is not null and d.revision=1
  from public.ticket_intake_drafts d join public.abandoned_ticket_emails a on a.draft_id=d.id
  where d.id='00000000-0000-4000-8000-000000000010'),'backfill lost receipt or changed staff/deletion/revision');
select pg_temp.assert_true(not exists(select 1 from public.ticket_intake_drafts where id in
  ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012') and follow_up_email_sent_at is not null),'failed/pending backfilled false email evidence');

-- Customer role and missing identity cannot call the staff RPC or read receipts.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.ticket_intake_drafts) then raise exception 'nonstaff sees private intake evidence'; end if;
  begin
    perform public.record_ticket_intake_follow_up('00000000-0000-4000-8000-000000000012','open','email');
    raise exception 'nonstaff recorded channel';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    perform public.record_ticket_intake_follow_up('00000000-0000-4000-8000-000000000012','open','email');
    raise exception 'missing identity recorded channel';
  exception when insufficient_privilege then null; end;
end $$;

insert into public.ticket_intake_drafts(id,draft_data,last_saved_at,revision) values
  ('00000000-0000-4000-8000-000000000020','{"firstName":"Untouched"}',now()-interval '1 hour',8),
  ('00000000-0000-4000-8000-000000000021','{}',now(),1);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare first_record record; second_record record; before_row public.ticket_intake_drafts%rowtype; after_row public.ticket_intake_drafts%rowtype; begin
  select * into before_row from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000020';
  select * into first_record from public.record_ticket_intake_follow_up(before_row.id,'open','email');
  if first_record.follow_up_email_sent_at is null or first_record.follow_up_email_sent_by<>auth.uid() or first_record.follow_up_status<>'contacted' then raise exception 'manual email audit missing'; end if;
  begin
    perform public.record_ticket_intake_follow_up(before_row.id,'open','phone');
    raise exception 'stale expected status accepted';
  exception when serialization_failure then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  select * into second_record from public.record_ticket_intake_follow_up(before_row.id,'contacted','email');
  if first_record.follow_up_email_sent_at is distinct from second_record.follow_up_email_sent_at or
    first_record.follow_up_email_sent_by is distinct from second_record.follow_up_email_sent_by or
    first_record.follow_up_updated_at is distinct from second_record.follow_up_updated_at then raise exception 'repeat action rewrote original email evidence'; end if;
  select * into second_record from public.record_ticket_intake_follow_up(before_row.id,'contacted','phone');
  if second_record.follow_up_phone_called_at is null or second_record.follow_up_phone_called_by<>auth.uid() or
    second_record.follow_up_email_sent_at is distinct from first_record.follow_up_email_sent_at or
    second_record.follow_up_email_sent_by is distinct from first_record.follow_up_email_sent_by then raise exception 'channels not independently audited'; end if;
  select * into after_row from public.ticket_intake_drafts where id=before_row.id;
  if after_row.revision<>before_row.revision or after_row.last_saved_at is distinct from before_row.last_saved_at or
    after_row.draft_data is distinct from before_row.draft_data or after_row.expires_at<>before_row.expires_at then raise exception 'followup mutated autosave state'; end if;
  if after_row.ticket_uploaded_at is not null then raise exception 'contact-only fixture unexpectedly uploaded'; end if;
  begin
    update public.ticket_intake_drafts set follow_up_phone_called_by=auth.uid() where id=before_row.id;
    raise exception 'direct staff table mutation allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Later automatic receipts preserve a previously recorded manual email and phone.
do $$ declare before_row public.ticket_intake_drafts%rowtype; after_row public.ticket_intake_drafts%rowtype; begin
  select * into before_row from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000020';
  insert into public.abandoned_ticket_emails(draft_id,uploaded_at,due_at,next_attempt_at,status,sent_at,provider_email_id)
    values(before_row.id,now()-interval '1 hour',now()-interval '30 minutes',now(),'sent',now(),'provider-after-manual');
  select * into after_row from public.ticket_intake_drafts where id=before_row.id;
  perform pg_temp.assert_true(after_row.follow_up_email_sent_at=before_row.follow_up_email_sent_at
    and after_row.follow_up_email_sent_by=before_row.follow_up_email_sent_by
    and after_row.follow_up_phone_called_at=before_row.follow_up_phone_called_at
    and after_row.follow_up_phone_called_by=before_row.follow_up_phone_called_by
    and after_row.revision=before_row.revision and after_row.last_saved_at=before_row.last_saved_at,'automatic receipt overwrote manual channel history');
end $$;
update public.abandoned_ticket_emails set status='retry' where draft_id='00000000-0000-4000-8000-000000000011';
select pg_temp.assert_true((select follow_up_email_sent_at is null from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000011'),'retry stamped a false email receipt');
update public.abandoned_ticket_emails set status='sent',sent_at=now(),provider_email_id='   '
  where draft_id='00000000-0000-4000-8000-000000000011';
select pg_temp.assert_true((select follow_up_email_sent_at is null from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000011'),'blank provider ID stamped a false email receipt');

-- The automatic send records actual delivery without manufacturing a staff action.
insert into public.abandoned_ticket_emails(draft_id,uploaded_at,due_at,next_attempt_at,status,sent_at,provider_email_id)
values('00000000-0000-4000-8000-000000000021',now()-interval '1 hour',now()-interval '30 minutes',now(),'sent',now(),'provider-insert');
select pg_temp.assert_true((select follow_up_email_sent_at is not null and follow_up_email_sent_by is null
  and staff_follow_up_status='open' and staff_follow_up_updated_by is null from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000021'),'automatic receipt fabricated staff status');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select * from public.record_ticket_intake_follow_up('00000000-0000-4000-8000-000000000021','open','phone');
reset role;
do $$ declare before_row public.ticket_intake_drafts%rowtype; after_row public.ticket_intake_drafts%rowtype; begin
  select * into before_row from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000021';
  update public.abandoned_ticket_emails set sent_at=sent_at+interval '1 minute' where draft_id=before_row.id;
  select * into after_row from public.ticket_intake_drafts where id=before_row.id;
  perform pg_temp.assert_true(after_row.follow_up_email_sent_at=before_row.follow_up_email_sent_at and after_row.follow_up_email_sent_by is null
    and after_row.follow_up_phone_called_at=before_row.follow_up_phone_called_at and after_row.follow_up_phone_called_by=before_row.follow_up_phone_called_by,'automatic replay overwrote evidence');
end $$;
-- Provider transition through the actual finish RPC must trigger the same receipt.
update public.abandoned_ticket_emails set status='sending',claim_id='00000000-0000-4000-8000-000000000099',claim_expires_at=now()+interval '3 minutes'
  where draft_id='00000000-0000-4000-8000-000000000012';
set local role service_role;
select public.finish_abandoned_ticket_email(id,claim_id,'sent','provider-finish',null) from public.abandoned_ticket_emails
  where draft_id='00000000-0000-4000-8000-000000000012';
reset role;
select pg_temp.assert_true((select follow_up_email_sent_at is not null and follow_up_email_sent_by is null
  from public.ticket_intake_drafts where id='00000000-0000-4000-8000-000000000012'),'finish RPC did not record automatic receipt');

-- Dismissed, deleted, expired, and unconsented records are never manually changed.
do $$ declare draft uuid; reason text; begin
  foreach reason in array array['dismissed','deleted','expired','permission'] loop
    insert into public.ticket_intake_drafts default values returning id into draft;
    if reason='deleted' then perform public.set_admin_ticket_deleted(draft,'intake',true);
    elsif reason='dismissed' then update public.ticket_intake_drafts set staff_follow_up_status='dismissed',staff_follow_up_updated_at=now(),staff_follow_up_updated_by=auth.uid() where id=draft;
    elsif reason='expired' then update public.ticket_intake_drafts set expires_at=now()-interval '1 second' where id=draft;
    else update public.ticket_intake_drafts set contact_permission=false where id=draft; end if;
    begin
      perform public.record_ticket_intake_follow_up(draft,case when reason='dismissed' then reason else 'open' end,'phone');
      raise exception 'unavailable followup accepted: %',reason;
    exception when raise_exception then if sqlerrm<>'TICKET_INTAKE_FOLLOW_UP_NOT_AVAILABLE' then raise; end if; end;
  end loop;
end $$;
select pg_temp.assert_true(not has_function_privilege('anon','public.record_ticket_intake_follow_up(uuid,text,text)','execute'),'anonymous manual RPC privilege');
select pg_temp.assert_true(not has_function_privilege('service_role','public.record_ticket_intake_follow_up(uuid,text,text)','execute'),'service impersonation RPC privilege');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.record_abandoned_ticket_email_receipt()','execute'),'receipt trigger callable by customer');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.abandoned_ticket_emails','select'),'private outbox exposed');
select pg_temp.assert_true(has_column_privilege('authenticated','public.ticket_intake_drafts','follow_up_email_sent_at','select'),'new staff field not selectable');
rollback;
