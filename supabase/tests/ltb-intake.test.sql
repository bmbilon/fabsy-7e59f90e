-- Ontario LTB intake: registration, uploads, alerts and practice isolation.
-- Run with psql against a database that has the LTB migration applied.
-- Everything happens inside one transaction that is rolled back.
begin;

create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'LTB test failed: %', label; end if;
end $$;

insert into auth.users (id, email) values
  ('71100000-0000-4000-8000-000000000001', 'licensee@practice.test'),
  ('71100000-0000-4000-8000-000000000002', 'fabsy-admin@test'),
  ('71100000-0000-4000-8000-000000000003', 'fabsy-case-manager@test');
insert into public.user_roles (user_id, role) values
  ('71100000-0000-4000-8000-000000000002', 'admin'),
  ('71100000-0000-4000-8000-000000000003', 'case_manager');
insert into public.ltb_practice_members (practice_id, user_id, role)
  values ('anderhue-paralegal', '71100000-0000-4000-8000-000000000001', 'licensee');

set local role service_role;

-- New client with two declared uploads.
create temp table first_intake on commit drop as
select * from public.ltb_register_intake('anderhue-paralegal',
  '{"email":"Owner@Example.com","firstName":"Mary","lastName":"Owner","phone":"9055550100","city":"Hamilton","issue":"arrears","noticeServed":"yes"}',
  repeat('a', 64),
  '[{"id":"71200000-0000-4000-8000-000000000001","extension":"jpg","contentType":"image/jpeg","size":100,"name":"lease.jpg"},
    {"id":"71200000-0000-4000-8000-000000000002","extension":"pdf","contentType":"application/pdf","size":200,"name":"ledger.pdf"}]');
grant select on first_intake to authenticated, anon;
select pg_temp.ok((select case_number ~ '^LTB-\d{4}-\d{4}$' and not returning_client from first_intake), 'case opened for a new client');
select pg_temp.ok((select email = 'owner@example.com' and registration_status = 'provisional' from public.ltb_clients), 'client stored provisional with normalized email');
select pg_temp.ok((select count(*) = 0 from public.ltb_intake_alerts), 'no alert before documents are read');

do $$ begin
  perform public.ltb_finalize_intake((select case_id from first_intake), repeat('b', 64), '{}');
  raise exception 'wrong token accepted';
exception when raise_exception then
  if sqlerrm <> 'LTB_INTAKE_UNAUTHORIZED' then raise; end if;
end $$;
select pg_temp.ok(public.ltb_finalize_intake((select case_id from first_intake), repeat('a', 64),
  array['71200000-0000-4000-8000-000000000001'::uuid]) = 'pending_scan', 'upload confirmed');
select pg_temp.ok(public.ltb_claim_intake_scan((select case_id from first_intake)), 'scan claimed once');
select pg_temp.ok(not public.ltb_claim_intake_scan((select case_id from first_intake)), 'scan not claimed twice');
update public.ltb_cases set intake_review_status = 'ready' where id = (select case_id from first_intake);
select pg_temp.ok((select count(*) = 1 and bool_and(case_snapshot->'recipients' ? 'brett@execom.ca')
  from public.ltb_intake_alerts), 'alert queued for practice recipients once reading finishes');

-- Same email without documents: provisional record only gains empty fields.
select pg_temp.ok((select not returning_client from public.ltb_register_intake('anderhue-paralegal',
  '{"email":"owner@example.com","firstName":"Other","phone":"111"}', repeat('c', 64), '[]')), 'provisional client is not returning');
select pg_temp.ok((select first_name = 'Mary' and phone = '9055550100' from public.ltb_clients), 'provisional details not overwritten');
select pg_temp.ok((select count(*) = 2 from public.ltb_intake_alerts), 'no-document intake alerts immediately');

-- Alert outbox contract.
select pg_temp.ok((select count(*) = 2 from public.claim_ltb_intake_alerts(10)), 'alerts claimed');
select pg_temp.ok(public.finish_ltb_intake_alert(a.id, a.claim_id, 'sent', 'em_1', null), 'alert finished')
  from public.ltb_intake_alerts a where status = 'sending'
  and public.freeze_ltb_intake_alert_email(a.id, a.claim_id, '{"from":"f","to":["a@b.co"],"subject":"s","html":"h"}') is not null
  limit 1;

reset role;
set local role authenticated;

-- Fabsy case managers are not practice members.
select set_config('request.jwt.claim.sub', '71100000-0000-4000-8000-000000000003', true);
select pg_temp.ok((select count(*) = 0 from public.ltb_cases), 'Fabsy case manager cannot read practice files');
do $$ begin
  perform public.ltb_set_case_stage((select id from public.ltb_cases limit 1), 'filed');
  raise exception 'non-member stage change accepted';
exception when raise_exception then
  if sqlerrm not in ('LTB_CASE_NOT_FOUND') then raise; end if;
end $$;

-- Practice licensee works the file.
select set_config('request.jwt.claim.sub', '71100000-0000-4000-8000-000000000001', true);
select pg_temp.ok((select count(*) = 2 from public.ltb_cases), 'licensee reads practice files');
select pg_temp.ok((select stage = 'under_review' from public.ltb_set_case_stage(
  (select case_id from first_intake), 'under_review', null, 'Reviewing')), 'stage changed');
do $$ begin
  perform public.ltb_set_case_stage((select id from public.ltb_cases limit 1), 'closed');
  raise exception 'close without outcome accepted';
exception when raise_exception then
  if sqlerrm <> 'LTB_OUTCOME_REQUIRED' then raise; end if;
end $$;
do $$ begin
  update public.ltb_cases set case_number = 'X';
  raise exception 'case number edit accepted';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.ltb_set_client_registration((select id from public.ltb_clients), 'registered');
  raise exception 'incomplete registration accepted';
exception when raise_exception then
  if sqlerrm <> 'LTB_REGISTRATION_INCOMPLETE' then raise; end if;
end $$;
update public.ltb_clients set mailing_address = '1 Main St', occupation = 'Retired';
select pg_temp.ok((select registration_status = 'registered' from public.ltb_set_client_registration(
  (select id from public.ltb_clients), 'registered')), 'registration confirmed');
select pg_temp.ok((select count(*) > 0 from public.ltb_case_events where event = 'client_updated'), 'staff edits logged');

reset role;
set local role service_role;

-- A registered client is never changed by a later unauthenticated form.
select pg_temp.ok((select returning_client from public.ltb_register_intake('anderhue-paralegal',
  '{"email":"owner@example.com","firstName":"Someone","lastName":"Else","phone":"222"}', repeat('d', 64), '[]')),
  'registered client recognized');
select pg_temp.ok((select first_name = 'Mary' and phone = '9055550100' from public.ltb_clients), 'registered details unchanged');
select pg_temp.ok((select review_notes like '%differs from the registered record%'
  from public.ltb_cases order by case_number desc limit 1), 'differences left for staff');

reset role;
set local role anon;
do $$ begin
  perform public.ltb_register_intake('anderhue-paralegal', '{"email":"x@y.zz"}', repeat('e', 64), '[]');
  raise exception 'anonymous intake accepted';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'ltb-intake tests passed' as result;
rollback;
