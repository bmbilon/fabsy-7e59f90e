begin;
insert into public.ticket_intake_drafts(id,draft_data,ticket_document_path,ticket_uploaded_at,expires_at,email) values
 ('81000000-0000-4000-8000-000000000001','{"firstName":"Lapsed","lastName":"Draft"}','lapsed/ticket.jpg',now(),now()-interval '2 days','lapsed@example.test');
insert into public.ticket_submissions(id,first_name,last_name,status,representation_paid_at) values
 ('82000000-0000-4000-8000-000000000001','Lapsed','Submission','pending',null);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.test_assert(public.set_admin_ticket_case_status('draft','81000000-0000-4000-8000-000000000001','lapsed_expired',0)->>'stage'='lapsed_expired','draft accepts lapsed status');
select public.test_assert(public.set_admin_ticket_case_status('submission','82000000-0000-4000-8000-000000000001','lapsed_expired',0)->>'stage'='lapsed_expired','submission accepts lapsed status');
select public.test_assert((public.admin_dashboard_queue('partial','Lapsed')->>'total')::int=0,'lapsed tickets leave partial queue');
select public.test_assert((public.admin_dashboard_queue('active','Lapsed')->>'total')::int=0,'lapsed tickets leave active queue');
select public.test_assert((public.admin_dashboard_queue('trial','Lapsed')->>'total')::int=0,'lapsed tickets are not trial matters');
select public.test_assert((public.admin_dashboard_queue('completed','Lapsed')->>'total')::int=2,'lapsed tickets remain accessible as completed');
select public.test_assert((public.admin_dashboard_queue('submitted','Lapsed')->>'total')::int=2,'all submissions includes lapsed drafts');
select public.test_assert((select count(*)=1 from public.admin_ticket_case_status_history where ticket_id='81000000-0000-4000-8000-000000000001' and to_stage='lapsed_expired' and changed_by=auth.uid()),'lapsed change audited');
do $$begin
  begin perform public.set_admin_ticket_case_status('draft','81000000-0000-4000-8000-000000000001','paid',0); raise exception 'stale overwrite accepted'; exception when serialization_failure then null; end;
end$$;
select public.set_admin_ticket_case_status('submission','82000000-0000-4000-8000-000000000001','partial',1);
select public.test_assert((public.admin_dashboard_queue('partial','Lapsed')->>'total')::int=1,'lapsed status can be corrected/reopened');
reset role;
select public.test_assert((select status='pending' and representation_paid_at is null from public.ticket_submissions where id='82000000-0000-4000-8000-000000000001'),'payment and submission state untouched');
select public.test_assert(not exists(select 1 from public.claim_expired_ticket_intake_drafts('83000000-0000-4000-8000-000000000001',25) where draft_id='81000000-0000-4000-8000-000000000001'),'lapsed draft remains protected from cleanup');
update public.ticket_intake_drafts set expires_at=now()+interval '1 day' where id='81000000-0000-4000-8000-000000000001';
insert into public.abandoned_ticket_emails(id,draft_id,claim_id,status,claim_expires_at,due_at) values('84000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','sending',now()+interval '1 hour',now()-interval '1 hour');
select public.test_assert(public.get_abandoned_ticket_email_context('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001')->>'reason'='case_managed_by_staff','lapsed intakes do not receive abandonment reminders');
rollback;
