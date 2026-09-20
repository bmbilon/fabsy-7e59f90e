-- Synthetic data in the isolated fixture only; roll back to preserve prior tests.
begin;
select set_config('request.jwt.claim.role','service_role',true);
select test_assert(disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'absent staff status retains paid case eligibility');
update ticket_submissions set deleted_at=now();
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'soft-deleted active paid submission is blocked');
update ticket_submissions set deleted_at=null;

insert into ticket_intake_drafts(id,converted_submission_id,deleted_at) values
  ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now());
insert into admin_ticket_case_status(kind,ticket_id,stage,version) values
  ('draft','60000000-0000-4000-8000-000000000001','disclosure_requested',3);
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'inherited disclosure stage still blocks after draft soft deletion');
select test_assert(disclosure_approval_staff_state('30000000-0000-4000-8000-000000000001')->>'stage'='disclosure_requested',
  'linked draft supplies missing canonical staff status');
insert into ticket_intake_drafts(id,converted_submission_id) values
  ('60000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001');
select test_assert(purge_expired_converted_ticket_intake_drafts(25)=1,
  'cleanup still purges an untracked converted draft but retains inherited-only staff state');
select test_assert(exists(select 1 from ticket_intake_drafts where id='60000000-0000-4000-8000-000000000001'),
  'inherited-only staff draft survives actual cleanup RPC');
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'purge cannot reopen inherited disclosure-requested case for automatic filing');

insert into admin_ticket_case_status(kind,ticket_id,stage,version) values
  ('submission','30000000-0000-4000-8000-000000000001','partial',4);
select test_assert(disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'canonical partial stage takes precedence over inherited stage');
savepoint before_canonical_cleanup;
select test_assert(purge_expired_converted_ticket_intake_drafts(25)=1,
  'canonical staff state makes converted draft redundant and safe to purge');
select test_assert(disclosure_approval_staff_state('30000000-0000-4000-8000-000000000001')->>'stage'='partial',
  'canonical staff state survives converted draft cleanup');
rollback to before_canonical_cleanup;
update admin_ticket_case_status set stage='paid' where kind='submission';
select test_assert(disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'canonical paid stage permits actually paid case');
update ticket_submissions set representation_paid_at=null;
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'staff paid label alone never proves payment');
update ticket_submissions set representation_paid_at=now();

do $$ declare later_stage text; begin
  foreach later_stage in array array['disclosure_requested','crown_offer_received','done_reduced',
    'done_withdrawn','trial_proceeding','trial_date_pending','trial_date_set',
    'trial_concluded_reduced','trial_concluded_upheld'] loop
    update admin_ticket_case_status set stage=later_stage where kind='submission';
    perform test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
      'later staff stage requires reconciliation: '||later_stage);
  end loop;
end $$;
delete from admin_ticket_case_status where kind='submission';
update admin_ticket_case_status set stage='partial';
insert into ticket_intake_drafts(id,converted_submission_id,deleted_at) values
  ('60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',null);
insert into admin_ticket_case_status(kind,ticket_id,stage,version) values
  ('draft','60000000-0000-4000-8000-000000000002','paid',1);
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'multiple inherited staff statuses fail closed even when both stages are allowed');
select test_assert(disclosure_approval_staff_state('30000000-0000-4000-8000-000000000001')->'ambiguous'='true'::jsonb,
  'ambiguous inheritance is explicit');

insert into admin_ticket_case_status(kind,ticket_id,stage,version) values
  ('submission','30000000-0000-4000-8000-000000000001','partial',4);
insert into disclosure_portal_approvals(id,submission_id,ticket_number,case_label,token_hash,portal_session_id,case_fingerprint,
  source_snapshot,consent_sha256,terms_url,terms_version,terms_text,terms_sha256,scope,recipient_phone,status,decided_at)
values('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','T12345678Z','Fixture C.',repeat('a',64),
  '50000000-0000-4000-8000-000000000001',repeat('b',64),disclosure_approval_case_snapshot('30000000-0000-4000-8000-000000000001'),
  repeat('c',64),'https://traffictickets.alberta.ca/','Observed in test',repeat('Test terms. ',10),repeat('d',64),
  'Test scope','+15555550100','approved',now());

savepoint approved_state;
update admin_ticket_case_status set stage='paid',version=5 where kind='submission';
select test_assert(disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),
  'changed stage may still be eligible for a new approval');
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),
  'allowed stage change invalidates the old approval snapshot');
rollback to approved_state;
update admin_ticket_case_status set version=5 where kind='submission';
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),
  'same-stage version change invalidates the old approval snapshot');
rollback to approved_state;
update ticket_submissions set deleted_at=now();
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),
  'soft deletion after phone approval prevents consumption');
rollback to approved_state;
select test_assert(consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),
  'unchanged eligible staff state can consume the approval once');

set local role anon;
do $$ begin
  begin perform public.disclosure_approval_staff_state('30000000-0000-4000-8000-000000000001'); raise exception 'anon staff read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'disclosure staff workflow guard tests passed' as result;
