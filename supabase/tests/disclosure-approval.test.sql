create function public.test_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
select set_config('request.jwt.claim.role','service_role',false);
select test_assert(disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),'paid ready explicit instruction eligible');
begin;
update ticket_submissions set intake_consent=jsonb_set(intake_consent,'{pleadNotGuilty}','false'),defense_strategy='not_guilty';
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),'explicit false cannot fall back');
rollback;
begin;
update ticket_submissions set representation_paid_at=null;
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),'unpaid blocked');
rollback;
begin;
update ticket_submissions set intake_review_status='pending_scan';
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),'unreviewed photo blocked');
rollback;
begin;
update ticket_submissions set referral_refunded_at=now();
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),'refund blocked');
rollback;
begin;
insert into disclosure_confirmations values('30000000-0000-4000-8000-000000000001','T12345678Z');
select test_assert(not disclosure_approval_case_eligible('30000000-0000-4000-8000-000000000001'),'prior disclosure blocked');
rollback;

insert into disclosure_portal_approvals(id,submission_id,ticket_number,case_label,token_hash,portal_session_id,case_fingerprint,
  source_snapshot,consent_sha256,terms_url,terms_version,terms_text,terms_sha256,scope,recipient_phone,status)
values('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','T12345678Z','Fixture C.',repeat('a',64),
  '50000000-0000-4000-8000-000000000001',repeat('b',64),disclosure_approval_case_snapshot('30000000-0000-4000-8000-000000000001'),
  repeat('c',64),'https://traffictickets.alberta.ca/','Observed in test',repeat('Test terms. ',10),repeat('d',64),'Test scope','+15555550100','pending');

do $$ begin
  begin perform decide_disclosure_portal_approval(repeat('a',64),'approved',repeat('e',64)); raise exception 'wrong terms accepted';
  exception when others then if sqlerrm not like '%APPROVAL_UNAVAILABLE%' then raise; end if; end;
end $$;
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),'pending cannot consume');
select test_assert(decide_disclosure_portal_approval(repeat('a',64),'approved',repeat('d',64))='approved','explicit approval works');
do $$ begin
  begin perform decide_disclosure_portal_approval(repeat('a',64),'rejected',repeat('d',64)); raise exception 'decision replay accepted';
  exception when others then if sqlerrm not like '%APPROVAL_UNAVAILABLE%' then raise; end if; end;
end $$;
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',repeat('b',64),repeat('c',64),repeat('d',64)),'different portal session blocked');
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('e',64),repeat('d',64)),'changed consent blocked');
begin;
update clients set date_of_birth='2001-01-01';
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),'changed client identity blocked');
rollback;
begin;
update ticket_submissions set representation_paid_at=null;
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),'eligibility rechecked before use');
rollback;
begin;
update disclosure_portal_approvals set created_at=now()-interval '1 hour',expires_at=now()-interval '30 minutes';
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),'expired approval blocked');
rollback;
select test_assert(consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),'matching approval consumed');
select test_assert(not consume_disclosure_portal_approval('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64)),'consume replay blocked');
do $$ declare item disclosure_portal_approvals; begin
  select * into item from disclosure_portal_approvals limit 1;
  item.id=gen_random_uuid(); item.token_hash=repeat('e',64); item.status='pending';
  begin insert into disclosure_portal_approvals select (item).*; raise exception 'second approval accepted';
  exception when unique_violation then null; end;
end $$;

set role anon;
do $$ begin
  begin perform 1 from public.disclosure_portal_approvals; raise exception 'anon read allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.decide_disclosure_portal_approval(repeat('a',64),'approved',repeat('d',64)); raise exception 'anon rpc allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'disclosure approval database tests passed' as result;
