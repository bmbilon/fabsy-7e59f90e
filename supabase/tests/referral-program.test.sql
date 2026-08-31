-- Synthetic fixtures only; test_referral_program.py owns the disposable server.
set request.jwt.claim.role = 'service_role';

create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Assertion failed: %',message; end if; end;
$$;

create function pg_temp.order_fixture(order_id uuid,email text,phone text default '5875550200',
  ticket_type text default 'officer_issued',address text default null)
returns uuid language plpgsql as $$
declare customer uuid := gen_random_uuid();
begin
  insert into public.clients(id,email,phone,address,city,postal_code)
    values(customer,email,phone,address,'Calgary','T2P 1A1');
  insert into public.ticket_submissions(id,client_id,ticket_type) values(order_id,customer,ticket_type);
  return customer;
end;
$$;

create function pg_temp.pay_order(order_id uuid,settled_at timestamptz default null,customer_id text default null)
returns void language plpgsql as $$
declare t public.ticket_submissions%rowtype; payment_id text := 'pi_' || replace(order_id::text,'-','');
begin
  select * into t from public.ticket_submissions where id = order_id;
  insert into public.idr_checkout_intents(ticket_submission_id,client_id,checkout_kind,status)
    values(order_id,t.client_id,case t.ticket_type when 'photo_radar' then 'photo_radar' else 'ticket_only' end,'paid');
  perform public.referral_record_checkout_payment(order_id,payment_id,customer_id);
  perform public.referral_record_payment_check(order_id,payment_id,settled_at,customer_id);
  update public.ticket_submissions set status = 'pending' where id = order_id;
end;
$$;

create function pg_temp.ready_order(order_id uuid,code text,email text)
returns void language plpgsql as $$
begin
  perform pg_temp.order_fixture(order_id,email);
  perform pg_temp.assert(public.attach_referral_to_order(order_id,code,now()),'attach eligible fixture');
  perform public.referral_review_order('10000000-0000-4000-8000-000000000001',order_id,'accepted',true,false,true);
  update public.ticket_submissions set referral_accepted_at = now() - interval '10 days' where id = order_id;
  perform pg_temp.pay_order(order_id,now() - interval '9 days');
end;
$$;

insert into auth.users(id,email,phone,email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000001','admin@example.test',null,now()),
  ('10000000-0000-4000-8000-000000000002','manager@example.test',null,now()),
  ('20000000-0000-4000-8000-000000000001','owner@example.test','+17805551000',now()),
  ('20000000-0000-4000-8000-000000000002','registered@example.test',null,now()),
  ('20000000-0000-4000-8000-000000000003','unverified@example.test',null,null),
  ('20000000-0000-4000-8000-000000000004','concurrent@example.test',null,now()),
  ('20000000-0000-4000-8000-000000000005','tax@example.test',null,now());
insert into public.user_roles values
  ('10000000-0000-4000-8000-000000000001','admin'),
  ('10000000-0000-4000-8000-000000000002','case_manager');
insert into public.clients(id,auth_user_id,email,phone,address,city,postal_code) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'owner@example.test','7805551000','10 First St.','Calgary','T2P 1A1');

select public.ensure_referral_code('20000000-0000-4000-8000-000000000001');
select public.ensure_referral_code('20000000-0000-4000-8000-000000000002');
select public.ensure_referral_code('20000000-0000-4000-8000-000000000004');
select public.ensure_referral_code('20000000-0000-4000-8000-000000000005');
update public.referral_codes set code = 'OWNER01' where user_id = '20000000-0000-4000-8000-000000000001';
update public.referral_codes set code = 'REGISTERED' where user_id = '20000000-0000-4000-8000-000000000002';
update public.referral_codes set code = 'CONCURRENT' where user_id = '20000000-0000-4000-8000-000000000004';
update public.referral_codes set code = 'TAXREF' where user_id = '20000000-0000-4000-8000-000000000005';
select pg_temp.assert((public.ensure_referral_code('20000000-0000-4000-8000-000000000001')).code = 'OWNER01','code creation is idempotent');

do $$ begin
  begin
    perform public.ensure_referral_code('20000000-0000-4000-8000-000000000003');
    raise exception 'unverified account was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ensure_client_referral_code('30000000-0000-4000-8000-000000000001');
    raise exception 'unpaid client was accepted as a past customer';
  exception when insufficient_privilege then null; end;
end $$;

-- Service-only ACLs include RPCs, identity hashes and private tax data.
select pg_temp.assert(not has_table_privilege('anon','public.referrals','select'),'anonymous cannot read ledger');
select pg_temp.assert(not has_table_privilege('authenticated','public.referral_payout_profiles','select'),'browser cannot read private tax table');
select pg_temp.assert(not has_function_privilege('authenticated','public.referral_mark_paid(uuid,uuid,text)','execute'),'browser cannot call payout RPC');
select pg_temp.assert(not has_function_privilege('authenticated','public.referral_review_order(uuid,uuid,text,boolean,boolean,boolean,text,text)','execute'),'browser cannot spoof staff actor through RPC');
select pg_temp.assert(not has_function_privilege('anon','public.attach_referral_to_order(uuid,text,timestamptz)','execute'),'anonymous cannot forge attribution timestamp');
select pg_temp.assert(has_function_privilege('service_role','public.referral_mark_paid(uuid,uuid,text)','execute'),'authenticated edge service can use payout RPC');
select pg_temp.assert(not has_table_privilege('service_role','public.referral_payouts','update'),'even an edge table write cannot rewrite payout history');
select pg_temp.assert(not has_table_privilege('service_role','public.referrals','insert'),'ledger creation must use the integrity RPC');

select pg_temp.order_fixture('40000000-0000-4000-8000-000000000001','officer@example.test');
set role authenticated;
set request.jwt.claim.role = 'authenticated';
do $$ begin
  begin
    update public.ticket_submissions set referral_scope_confirmed = true where id = '40000000-0000-4000-8000-000000000001';
    raise exception 'client changed trusted scope';
  exception when insufficient_privilege then null; end;
  begin
    update public.ticket_submissions set ref_code = 'OWNER01',referral_attributed_at = now() where id = '40000000-0000-4000-8000-000000000001';
    raise exception 'client forged attribution';
  exception when insufficient_privilege then null; end;
  begin
    perform public.referral_mark_paid('10000000-0000-4000-8000-000000000001',gen_random_uuid(),'FORGED');
    raise exception 'client spoofed admin RPC actor';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set request.jwt.claim.role = 'service_role';

select pg_temp.assert(not public.attach_referral_to_order('40000000-0000-4000-8000-000000000001','OWNER01',now()-interval '31 days'),'expired attribution is rejected');
select pg_temp.assert(not public.attach_referral_to_order('40000000-0000-4000-8000-000000000001','OWNER01',now()+interval '1 hour'),'future attribution is rejected');
select pg_temp.assert(not public.attach_referral_to_order('40000000-0000-4000-8000-000000000001','MISSING',now()),'unknown code is rejected');
select pg_temp.assert(public.attach_referral_to_order('40000000-0000-4000-8000-000000000001','REGISTERED',now()),'registered nonclient is a permitted referrer');
select pg_temp.assert(public.attach_referral_to_order('40000000-0000-4000-8000-000000000001','OWNER01',now()),'last valid touch replaces first touch');
select pg_temp.assert(not public.attach_referral_to_order('40000000-0000-4000-8000-000000000001','REGISTERED',now()-interval '1 second'),'older touch cannot replace newer touch');
select pg_temp.assert((select count(*) = 1 and min(amount) = 50 from public.referrals where order_id = '40000000-0000-4000-8000-000000000001'),'one $50 officer reward');
select pg_temp.pay_order('40000000-0000-4000-8000-000000000001');
select pg_temp.assert((select status = 'pending' and eligible_at is null from public.referrals where order_id = '40000000-0000-4000-8000-000000000001'),'checkout completion alone is not eligibility or settlement');
select pg_temp.assert(not public.attach_referral_to_order('40000000-0000-4000-8000-000000000001','REGISTERED',now()),'attribution freezes after payment');

do $$ begin
  begin
    perform public.referral_review_order('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','accepted',true,false,true);
    raise exception 'nonstaff accepted a case';
  exception when insufficient_privilege then null; end;
  begin
    perform public.referral_review_order('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','accepted',false,false,true);
    raise exception 'out-of-province file accepted';
  exception when raise_exception then
    if sqlerrm = 'out-of-province file accepted' then raise; end if;
  end;
end $$;

select public.referral_review_order('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','accepted',true,false,true);
select public.referral_record_payment_check('40000000-0000-4000-8000-000000000001','pi_40000000000040008000000000000001',now()-interval '1 day');
select pg_temp.assert((select r.status = 'pending' and r.eligible_at = t.referral_accepted_at + interval '7 days'
  from public.referrals r join public.ticket_submissions t on t.id = r.order_id where r.order_id = '40000000-0000-4000-8000-000000000001'),
  'seven days starts after later of settlement and acceptance');
do $$ begin
  begin
    perform public.referral_mark_paid('10000000-0000-4000-8000-000000000001',(select id from public.referrals where order_id = '40000000-0000-4000-8000-000000000001'),'EARLY');
    raise exception 'early payout accepted';
  exception when raise_exception then if sqlerrm = 'early payout accepted' then raise; end if; end;
end $$;

-- Camera representation is $20; standalone reviews/report add-ons earn nothing.
select pg_temp.order_fixture('40000000-0000-4000-8000-000000000002','camera@example.test','5875550202','photo_radar');
select public.attach_referral_to_order('40000000-0000-4000-8000-000000000002','OWNER01',now());
select pg_temp.pay_order('40000000-0000-4000-8000-000000000002');
select pg_temp.assert((select amount = 20 and ticket_type = 'camera' from public.referrals where order_id = '40000000-0000-4000-8000-000000000002'),'camera earns exactly $20');
select public.referral_review_order('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','accepted',true,true,true);
select pg_temp.assert((select status = 'void' and hold_reason = 'fleet_account' from public.referrals where order_id = '40000000-0000-4000-8000-000000000002'),'fleet referred accounts are excluded');
select pg_temp.order_fixture('40000000-0000-4000-8000-000000000003','assessment@example.test');
update public.ticket_submissions set service_type = 'ticket_insurance_assessment' where id = '40000000-0000-4000-8000-000000000003';
select pg_temp.assert(not public.attach_referral_to_order('40000000-0000-4000-8000-000000000003','OWNER01',now()),'assessment is not another payable representation order');

-- Historical identities survive an update; all five overlap kinds block rewards.
select pg_temp.assert(public.referral_identity_hash('phone','+1 (780) 555-1000') = public.referral_identity_hash('phone','7805551000'),'phone formats normalize');
update public.clients set email = 'new-owner@example.test',phone = '7805558888',address = '20 Other Street'
  where id = '30000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) = 2 from public.referral_identity_keys where subject_id = '30000000-0000-4000-8000-000000000001' and identity_kind = 'phone'),'old phone is retained');
select pg_temp.order_fixture('50000000-0000-4000-8000-000000000001','OWNER@EXAMPLE.TEST','5875550301');
select pg_temp.order_fixture('50000000-0000-4000-8000-000000000002','different-phone@example.test','+1 (780) 555-1000');
select pg_temp.order_fixture('50000000-0000-4000-8000-000000000003','different-address@example.test','5875550303','officer_issued','10 FIRST ST');
select pg_temp.order_fixture('50000000-0000-4000-8000-000000000004','different-plate@example.test','5875550304');
select pg_temp.order_fixture('50000000-0000-4000-8000-000000000005','different-stripe@example.test','5875550305');
select public.referral_remember_identity('client','30000000-0000-4000-8000-000000000001','plate','ABC 123');
select public.referral_remember_identity('client','30000000-0000-4000-8000-000000000001','stripe_customer','cus_OWNER');
do $$ declare order_id uuid; begin
  for order_id in select id from public.ticket_submissions where id::text like '50000000%' loop
    perform public.attach_referral_to_order(order_id,'OWNER01',now());
  end loop;
end $$;
select public.referral_review_order('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','accepted',true,false,true,'ABC-123');
select pg_temp.pay_order('50000000-0000-4000-8000-000000000005',now(),'cus_OWNER');
select pg_temp.assert((select count(*) = 5 from public.referrals where order_id::text like '50000000%' and status = 'void' and hold_reason = 'self_referral'),'email, phone, address, plate and Stripe customer each block self-referrals');
select pg_temp.order_fixture('50000000-0000-4000-8000-000000000006','declared-plate@example.test','5875550306');
select public.attach_referral_to_order('50000000-0000-4000-8000-000000000006','OWNER01',now());
select public.referral_record_declared_plate('50000000-0000-4000-8000-000000000006','ABC123');
select pg_temp.assert((select status = 'void' and hold_reason = 'self_referral' from public.referrals where order_id = '50000000-0000-4000-8000-000000000006'),'declared plate can only add an identity denial');
select pg_temp.assert((select referral_plate is null and referral_identity_checked_at is null from public.ticket_submissions where id = '50000000-0000-4000-8000-000000000006'),'declared plate cannot impersonate staff verification');

-- First payout can precede the tax profile; a second cannot, including a race.
select pg_temp.ready_order('60000000-0000-4000-8000-000000000001','OWNER01','payout1@example.test');
do $$ begin
  begin
    perform public.referral_mark_paid('10000000-0000-4000-8000-000000000002',(select id from public.referrals where order_id = '60000000-0000-4000-8000-000000000001'),'MANAGER');
    raise exception 'case manager recorded money';
  exception when insufficient_privilege then null; end;
end $$;
update public.ticket_submissions set referral_payment_checked_at = now() - interval '2 minutes' where id = '60000000-0000-4000-8000-000000000001';
do $$ begin
  begin
    perform public.referral_mark_paid('10000000-0000-4000-8000-000000000001',(select id from public.referrals where order_id = '60000000-0000-4000-8000-000000000001'),'STALE');
    raise exception 'stale Stripe check accepted';
  exception when raise_exception then if sqlerrm = 'stale Stripe check accepted' then raise; end if; end;
end $$;
select public.referral_record_payment_check('60000000-0000-4000-8000-000000000001','pi_60000000000040008000000000000001',now()-interval '9 days');
select public.referral_mark_paid('10000000-0000-4000-8000-000000000001',(select id from public.referrals where order_id = '60000000-0000-4000-8000-000000000001'),'INTERAC-001');
select public.referral_mark_paid('10000000-0000-4000-8000-000000000001',(select id from public.referrals where order_id = '60000000-0000-4000-8000-000000000001'),'INTERAC-001');
select pg_temp.assert((select count(*) = 1 from public.referral_payouts where payout_reference = 'INTERAC-001'),'same transfer replay is idempotent');
select pg_temp.ready_order('60000000-0000-4000-8000-000000000002','OWNER01','payout2@example.test');
select pg_temp.assert((select status = 'eligible' and hold_reason = 'payout_profile_required' from public.referrals where order_id = '60000000-0000-4000-8000-000000000002'),'second payout waits for legal profile');
do $$ begin
  begin
    perform public.referral_mark_paid('10000000-0000-4000-8000-000000000001',(select id from public.referrals where order_id = '60000000-0000-4000-8000-000000000002'),'INTERAC-002');
    raise exception 'second payout without profile accepted';
  exception when raise_exception then if sqlerrm = 'second payout without profile accepted' then raise; end if; end;
end $$;
select public.referral_save_profile('20000000-0000-4000-8000-000000000001','Test Referrer','123 Tax Street','','Edmonton','AB','T5J 1N9','owner@example.test');
select public.referral_mark_paid('10000000-0000-4000-8000-000000000001',(select id from public.referrals where order_id = '60000000-0000-4000-8000-000000000002'),'INTERAC-002');
select pg_temp.assert((select legal_name = 'Test Referrer' and address_snapshot->>'postal_code' = 'T5J 1N9'
  from public.referral_payouts where payout_reference = 'INTERAC-002'),'private payout retains tax snapshot');

-- Refunds are permanent holds, including partial pro refunds. Paid history stays
-- paid and is flagged for human recovery review; an early refund is not lost.
select public.referral_record_payment_hold('pi_60000000000040008000000000000001',now(),null,'evt_partial_refund');
select public.referral_record_payment_hold('pi_60000000000040008000000000000001',now(),null,'evt_partial_refund');
select pg_temp.assert((select status = 'paid' and refund_review_required and amount = 50 and payout_reference = 'INTERAC-001'
  from public.referrals where order_id = '60000000-0000-4000-8000-000000000001'),'paid refund preserves financial history and flags review');
select pg_temp.order_fixture('60000000-0000-4000-8000-000000000003','out-of-order@example.test');
select public.attach_referral_to_order('60000000-0000-4000-8000-000000000003','OWNER01',now());
select public.referral_record_payment_hold('pi_60000000000040008000000000000003',now(),null,'evt_before_checkout');
select pg_temp.pay_order('60000000-0000-4000-8000-000000000003',now());
select pg_temp.assert((select status = 'void' and hold_reason = 'refund' from public.referrals where order_id = '60000000-0000-4000-8000-000000000003'),'refund before checkout linkage still voids reward');

-- Tax review is calendar-year based and rewards have no program cap.
select public.referral_save_profile('20000000-0000-4000-8000-000000000005','Tax Recipient','456 Tax Street','','Edmonton','AB','T5J 1N9','tax@example.test');
do $$ declare i integer; fixture_order_id uuid; totals record; begin
  for i in 1..11 loop
    fixture_order_id := ('70000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    perform pg_temp.ready_order(fixture_order_id,'TAXREF','tax-referee-' || i || '@example.test');
    perform public.referral_mark_paid('10000000-0000-4000-8000-000000000001',
      (select id from public.referrals where referrals.order_id = fixture_order_id),'TAX-TRANSFER-' || i);
    if i = 10 then
      select * into totals from public.referral_payee_details(array[(select id from public.referral_codes where code = 'TAXREF')]);
      perform pg_temp.assert(totals.year_to_date_paid = 500,'calendar-year total reaches exactly $500');
    end if;
  end loop;
  select * into totals from public.referral_payee_details(array[(select id from public.referral_codes where code = 'TAXREF')]);
  perform pg_temp.assert(totals.year_to_date_paid = 550 and totals.paid_count = 11,'uncapped rewards exceed $500 tax review threshold');
end $$;

-- Several intake/client rows for one purchase email must not create separate
-- identities or hide the outcome-issued code when the person joins the portal.
insert into public.clients(id,email,phone,created_at) values
  ('80000000-0000-4000-8000-000000000001','past@example.test','5875558001',now()-interval '1 year');
select pg_temp.order_fixture('80000000-0000-4000-8000-000000000002','past@example.test','5875558002');
select pg_temp.pay_order('80000000-0000-4000-8000-000000000002');
select public.ensure_client_referral_code((select client_id from public.ticket_submissions where id = '80000000-0000-4000-8000-000000000002'));
select pg_temp.order_fixture('80000000-0000-4000-8000-000000000003','past@example.test','5875558003');
select pg_temp.pay_order('80000000-0000-4000-8000-000000000003');
select public.ensure_client_referral_code((select client_id from public.ticket_submissions where id = '80000000-0000-4000-8000-000000000003'));
insert into auth.users(id,email,email_confirmed_at) values('80000000-0000-4000-8000-000000000004','past@example.test',now());
select public.ensure_referral_code('80000000-0000-4000-8000-000000000004');
select pg_temp.assert((select count(*) = 1 from public.referral_codes r join public.clients c on c.id = r.client_id where c.email = 'past@example.test'),'one code across multiple purchases with the same email');
select pg_temp.assert((select c.id <> '80000000-0000-4000-8000-000000000001' from public.referral_codes r join public.clients c on c.id = r.client_id where r.user_id = '80000000-0000-4000-8000-000000000004'),'portal claims existing paid-outcome code instead of an older unrelated client row');

-- Leave two ready orders for the runner's genuinely concurrent payout test.
select pg_temp.ready_order('90000000-0000-4000-8000-000000000001','CONCURRENT','race1@example.test');
select pg_temp.ready_order('90000000-0000-4000-8000-000000000002','CONCURRENT','race2@example.test');

-- Payment-intent linkage and a refund will arrive concurrently in the runner.
select pg_temp.order_fixture('91000000-0000-4000-8000-000000000001','checkout-refund-race@example.test');
select public.attach_referral_to_order('91000000-0000-4000-8000-000000000001','OWNER01',now());
insert into public.idr_checkout_intents(ticket_submission_id,client_id,checkout_kind,status)
  select id,client_id,'ticket_only','paid' from public.ticket_submissions where id = '91000000-0000-4000-8000-000000000001';
