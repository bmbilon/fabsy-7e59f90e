begin;
insert into public.ticket_intake_drafts(id,draft_data,ticket_document_path,ticket_uploaded_at,expires_at) values
 ('71000000-0000-4000-8000-000000000001','{"firstName":"Workflow","lastName":"Draft"}','workflow/ticket.jpg',now(),now()-interval '2 days'),
 ('71000000-0000-4000-8000-000000000002','{"firstName":"Cleanup"}','cleanup/ticket.jpg',now(),now()-interval '2 days'),
 ('71000000-0000-4000-8000-000000000003','{"firstName":"Leased"}','leased/ticket.jpg',now(),now()-interval '2 days');
update public.ticket_intake_drafts set cleanup_claim_id=gen_random_uuid(),cleanup_claim_expires_at=now()+interval '1 hour' where id='71000000-0000-4000-8000-000000000003';
insert into public.ticket_submissions(id,first_name,last_name,status,representation_paid_at) values
 ('72000000-0000-4000-8000-000000000001','Workflow','Submission','pending',null),
 ('72000000-0000-4000-8000-000000000002','Workflow','Deleted','pending',null);
update public.ticket_submissions set deleted_at=now() where id='72000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$begin
  begin perform public.get_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001'); raise exception 'non-staff read accepted'; exception when insufficient_privilege then null; end;
  begin perform public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','paid',0); raise exception 'non-staff write accepted'; exception when insufficient_privilege then null; end;
end$$;
select public.test_assert((select count(*)=0 from public.admin_ticket_case_status),'RLS hides status from nonstaff');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$begin
  begin insert into public.admin_ticket_case_status(kind,ticket_id,stage,version) values('draft','71000000-0000-4000-8000-000000000001','paid',1); raise exception 'direct write accepted'; exception when insufficient_privilege then null; end;
  begin perform public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','invented',0); raise exception 'invalid stage accepted'; exception when raise_exception then if sqlerrm<>'CASE_STATUS_INPUT_INVALID' then raise; end if; end;
  begin perform public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000003','paid',0); raise exception 'cleanup lease accepted'; exception when raise_exception then if sqlerrm<>'CASE_STATUS_UPLOAD_CLEANUP_STARTED' then raise; end if; end;
  begin perform public.set_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000002','paid',0); raise exception 'deleted accepted'; exception when raise_exception then if sqlerrm<>'CASE_STATUS_TICKET_UNAVAILABLE' then raise; end if; end;
end$$;
select public.test_assert(public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','done_withdrawn',0)->>'version'='1','close partial directly');
select public.test_assert((public.admin_dashboard_queue('partial','Workflow')->>'total')::int=0,'closed draft leaves partial');
select public.test_assert((public.admin_dashboard_queue('completed','Workflow')->>'total')::int=1,'closed expired draft remains findable');
select public.test_assert(public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','done_withdrawn',0)->>'version'='1','retry is idempotent');
do $$begin
  begin perform public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','paid',0); raise exception 'stale update accepted'; exception when serialization_failure then null; end;
end$$;
select public.test_assert((select count(*)=1 from public.admin_ticket_case_status_history where ticket_id='71000000-0000-4000-8000-000000000001'),'one audit per change');
select public.test_assert((select changed_by=auth.uid() and change_source='staff_ui' from public.admin_ticket_case_status_history where ticket_id='71000000-0000-4000-8000-000000000001'),'audit staff identity');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.test_assert(public.set_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000001','paid',0)->>'stage'='paid','case manager can update');
select public.test_assert((public.admin_dashboard_queue('paid','Workflow')->>'total')::int=0,'manual Paid never invents payment');
select public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','trial_proceeding',1);
select public.test_assert((public.admin_dashboard_queue('trial','Workflow')->>'total')::int=1,'trial routing');
select public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','trial_date_pending',2);
select public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','trial_date_set',3);
select public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','trial_concluded_upheld',4);
select public.test_assert((public.admin_dashboard_queue('trial','Workflow')->>'total')::int=1,'concluded trials stay in trial section');
select public.test_assert((public.admin_dashboard_queue('completed','Workflow')->>'total')::int=1,'concluded trials counted completed');
reset role;
select public.test_assert((select status='pending' and representation_paid_at is null from public.ticket_submissions where id='72000000-0000-4000-8000-000000000001'),'source/payment state untouched');
select public.test_assert(not exists(select 1 from public.claim_expired_ticket_intake_drafts('73000000-0000-4000-8000-000000000001',25) where draft_id='71000000-0000-4000-8000-000000000001'),'managed draft excluded from cleanup');
select public.test_assert((select cleanup_claim_id is not null from public.ticket_intake_drafts where id='71000000-0000-4000-8000-000000000002'),'ordinary expired draft still cleaned');
insert into public.abandoned_ticket_emails(id,draft_id,claim_id,status,claim_expires_at,due_at) values('74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','sending',now()+interval '1 hour',now()-interval '1 hour');
update public.ticket_intake_drafts set expires_at=now()+interval '1 day' where id='71000000-0000-4000-8000-000000000001';
select public.test_assert(public.get_abandoned_ticket_email_context('74000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001')->>'reason'='case_managed_by_staff','resolved/managed intakes do not get abandonment reminders');
-- Conversion inherits workflow without changing checkout/payment triggers.
insert into public.ticket_submissions(id,first_name,last_name,status) values('72000000-0000-4000-8000-000000000003','Workflow','Converted','pending');
update public.ticket_intake_drafts set converted_submission_id='72000000-0000-4000-8000-000000000003',status='converted' where id='71000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.test_assert(public.get_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000003')->>'stage'='trial_concluded_upheld','conversion inherits status');
select public.test_assert((public.admin_dashboard_queue('trial','Workflow')->>'total')::int=1,'converted ticket shown once');
select public.test_assert(public.set_admin_ticket_case_status('draft','71000000-0000-4000-8000-000000000001','trial_concluded_reduced',5)->>'kind'='submission','draft editor resolves converted submission');
select public.test_assert(public.get_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000003')->>'version'='6','inherited version continues');
select public.set_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000003','disclosure_requested',6);
select public.set_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000003','crown_offer_received',7);
select public.set_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000003','done_reduced',8);
select public.set_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000003','partial',9);
select public.test_assert((public.admin_dashboard_queue('partial','Workflow')->>'total')::int=1,'staff can correct/reopen a status');
reset role;
delete from public.ticket_intake_drafts where id='71000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.test_assert(public.get_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000003')->>'stage'='partial','status survives converted-draft retention purge');
reset role;
set local role anon;
do $$begin
  begin perform public.set_admin_ticket_case_status('submission','72000000-0000-4000-8000-000000000001','paid',0); raise exception 'anonymous write accepted'; exception when insufficient_privilege then null; end;
end$$;
rollback;
