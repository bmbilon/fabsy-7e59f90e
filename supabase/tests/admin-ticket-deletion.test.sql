select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
insert into ticket_intake_drafts(id,converted_submission_id,ticket_uploaded_at,ticket_document_path) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now(),'test.pdf'),
 ('40000000-0000-4000-8000-000000000002',null,now(),'test2.pdf');
insert into ticket_submissions(id,ticket_number) values('30000000-0000-4000-8000-000000000002','UNTARGETED');
select enqueue_ticket_upload_alert('40000000-0000-4000-8000-000000000001');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',false);
do $$ begin
 begin perform set_admin_ticket_deleted('30000000-0000-4000-8000-000000000001','submission',true); raise exception 'nonstaff delete succeeded';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$ begin
 begin update ticket_submissions set deleted_at=now(),deleted_by=auth.uid(); raise exception 'direct update succeeded';
 exception when insufficient_privilege then null; end;
end $$;
select set_admin_ticket_deleted('40000000-0000-4000-8000-000000000001','intake',true);
select set_admin_ticket_deleted('30000000-0000-4000-8000-000000000001','submission',true);
do $$ begin
 if (select count(*) from admin_ticket_deletion_events) <> 2 then raise exception 'idempotent delete changed audit'; end if;
 if (select count(*) from ticket_submissions where deleted_at is null) <> 1 then raise exception 'wrong active count'; end if;
 if not exists(select 1 from ticket_submissions where id='30000000-0000-4000-8000-000000000001' and status='pending' and representation_paid_at is not null and deleted_by=auth.uid()) then raise exception 'ticket state or audit lost'; end if;
 if not exists(select 1 from ticket_intake_drafts where id='40000000-0000-4000-8000-000000000001' and deleted_at is not null) then raise exception 'linked intake remained active'; end if;
 begin update ticket_submissions set status='completed' where deleted_at is not null; raise exception 'editing deleted ticket succeeded';
 exception when insufficient_privilege then null; end;
 begin perform set_admin_ticket_deleted('00000000-0000-0000-0000-000000000000','submission',true); raise exception 'missing ticket silently succeeded';
 exception when others then if sqlerrm <> 'TICKET_DELETE_NOT_FOUND' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from ticket_upload_alerts where draft_id='40000000-0000-4000-8000-000000000001' and status='failed' and failure_code='ticket_deleted') then raise exception 'unsent alert still queued'; end if;
 if enqueue_ticket_upload_alert('40000000-0000-4000-8000-000000000001') is not null then raise exception 'deleted upload requeued'; end if;
 if has_function_privilege('anon','set_admin_ticket_deleted(uuid,text,boolean)','execute') or has_function_privilege('service_role','set_admin_ticket_deleted(uuid,text,boolean)','execute') then raise exception 'excessive deletion grant'; end if;
end $$;
set role authenticated;
select set_admin_ticket_deleted('30000000-0000-4000-8000-000000000001','submission',false);
do $$ begin
 if exists(select 1 from ticket_submissions where deleted_at is not null) or exists(select 1 from ticket_intake_drafts where deleted_at is not null) then raise exception 'restore incomplete'; end if;
 if (select count(*) from admin_ticket_deletion_events) <> 4 then raise exception 'restore not audited'; end if;
end $$;
select set_admin_ticket_deleted('40000000-0000-4000-8000-000000000002','intake',true);
do $$ begin
 if exists(select 1 from ticket_submissions where deleted_at is not null) then raise exception 'independent intake changed cases'; end if;
end $$;
reset role;
select 'Admin ticket deletion database tests passed' as result;
