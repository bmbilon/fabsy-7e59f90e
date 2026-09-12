-- Stored receipts that predate the channel migration must become visible.
insert into public.ticket_intake_drafts(id,ticket_uploaded_at) values
  ('00000000-0000-4000-8000-000000000010',now()-interval '1 hour'),
  ('00000000-0000-4000-8000-000000000011',now()-interval '1 hour'),
  ('00000000-0000-4000-8000-000000000012',now()-interval '1 hour');
update public.ticket_intake_drafts set staff_follow_up_status='dismissed',
  staff_follow_up_updated_at=now()-interval '1 hour',staff_follow_up_updated_by='00000000-0000-4000-8000-000000000001'
  where id='00000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
select public.set_admin_ticket_deleted('00000000-0000-4000-8000-000000000010','intake',true);
reset role;
insert into public.abandoned_ticket_emails(draft_id,uploaded_at,due_at,next_attempt_at,status,sent_at,provider_email_id) values
  ('00000000-0000-4000-8000-000000000010',now()-interval '1 hour',now()-interval '30 minutes',now(),'sent',now()-interval '10 minutes','provider-existing'),
  ('00000000-0000-4000-8000-000000000011',now()-interval '1 hour',now()-interval '30 minutes',now(),'failed',null,null),
  ('00000000-0000-4000-8000-000000000012',now()-interval '1 hour',now()-interval '30 minutes',now(),'pending',null,null);
