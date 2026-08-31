-- Combined migration tests are synthetic and run only in the disposable runner.
set request.jwt.claim.role = 'service_role';
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Assertion failed: %',message; end if; end;
$$;
select pg_temp.assert((select public = false from storage.buckets where id = 'pro-licences'),'licence evidence bucket is private');

insert into auth.users(id,email,email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000001','staff@example.test',now()),
  ('20000000-0000-4000-8000-000000000001','referrer@example.test',now()),
  ('20000000-0000-4000-8000-000000000002','customer@example.test',now());
insert into public.user_roles values('10000000-0000-4000-8000-000000000001','admin');

create function pg_temp.make_order(p_id uuid,p_class text default '1',p_type text default 'officer_issued')
returns uuid language plpgsql as $$
declare client_id uuid := gen_random_uuid();
begin
  insert into public.clients(id,email,phone) values(client_id,replace(p_id::text,'-','') || '@example.test','587555' || right(p_id::text,4));
  insert into public.ticket_submissions(id,client_id,declared_licence_class,ticket_type,order_type,review_path,registered_owner_on_offence_date,representation_access_token_hash)
    values(p_id,client_id,p_class,p_type,case p_type when 'photo_radar' then 'photo_radar' else 'rapid_resolution' end,
      case p_type when 'photo_radar' then 'ate' else 'standard' end,case p_type when 'photo_radar' then 'yes' else null end,repeat('a',64));
  return client_id;
end;
$$;

create function pg_temp.expected_identity(p_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('client_id',client_id,'drivers_license',drivers_license,'first_name',first_name,
    'last_name',last_name,'ticket_type',ticket_type,'representation_access_token_hash',representation_access_token_hash)
    from public.ticket_submissions where id = p_id;
$$;

create function pg_temp.begin_evidence(p_id uuid,p_class text default '1') returns uuid language plpgsql as $$
declare result jsonb;
begin
  result := public.begin_pro_licence_verification(p_id,p_class,repeat('b',64),'jpg',pg_temp.expected_identity(p_id));
  return (result->>'id')::uuid;
end;
$$;

create function pg_temp.verify_order(p_id uuid,p_class text default '1') returns uuid language plpgsql as $$
declare evidence_id uuid;
begin
  evidence_id := pg_temp.begin_evidence(p_id,p_class);
  perform pg_temp.assert(public.finish_pro_licence_verification(evidence_id,p_class,'AB',true,current_date+365,'verified'),'matching Alberta evidence is verified');
  return evidence_id;
end;
$$;

create function pg_temp.checkout(p_id uuid,p_bundle boolean default false,p_coupon boolean default true)
returns uuid language plpgsql as $$
declare result uuid := gen_random_uuid(); ticket public.ticket_submissions%rowtype;
begin
  select * into ticket from public.ticket_submissions where id = p_id;
  insert into public.idr_checkout_intents(id,client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status,
    pro_verification_id,pro_coupon,pro_subtotal_cents,pro_discount_cents)
    values(result,ticket.client_id,ticket.id,case when p_bundle then 'addon' else 'ticket' end,
      case when p_bundle then 'ticket_with_addon' else 'ticket_only' end,case when p_bundle then 3100 else 19800 end,'open',
      case when p_coupon then ticket.pro_verification_id else null end,case when p_coupon then 'PRO20' else null end,
      case when p_bundle then 22900 else 19800 end,case when not p_coupon then 0 when p_bundle then 4580 else 3960 end);
  return result;
end;
$$;

-- All eligible classes, and only eligible classes, can mint valid evidence.
select pg_temp.make_order('30000000-0000-4000-8000-000000000001','1');
select pg_temp.make_order('30000000-0000-4000-8000-000000000002','2');
select pg_temp.make_order('30000000-0000-4000-8000-000000000004','4');
select pg_temp.verify_order('30000000-0000-4000-8000-000000000001','1');
select pg_temp.verify_order('30000000-0000-4000-8000-000000000002','2');
select pg_temp.verify_order('30000000-0000-4000-8000-000000000004','4');
select pg_temp.assert((select count(*) = 3 from public.ticket_submissions where pro_verified),'Class 1, 2 and 4 pass');
do $$ begin
  begin
    insert into public.pro_licence_verifications(ticket_submission_id,declared_class,read_class,jurisdiction,identity_matches,
      identity_snapshot,evidence_path,evidence_sha256,status,expires_on,completed_at)
      values('30000000-0000-4000-8000-000000000001','1',null,'AB',true,'synthetic','null-proof.jpg',repeat('f',64),'verified',current_date+365,now());
    raise exception 'NULL read class escaped verified CHECK';
  exception when check_violation then null; end;
  begin
    insert into public.pro_licence_verifications(ticket_submission_id,declared_class,read_class,jurisdiction,identity_matches,
      identity_snapshot,evidence_path,evidence_sha256,status,expires_on,completed_at)
      values('30000000-0000-4000-8000-000000000001','1','1',null,true,'synthetic','null-jurisdiction.jpg',repeat('f',64),'verified',current_date+365,now());
    raise exception 'NULL jurisdiction escaped verified CHECK';
  exception when check_violation then null; end;
end $$;
select pg_temp.make_order('30000000-0000-4000-8000-000000000005','5');
select pg_temp.make_order('30000000-0000-4000-8000-000000000006','1','photo_radar');
do $$ begin
  begin perform pg_temp.begin_evidence('30000000-0000-4000-8000-000000000005','5'); raise exception 'Class 5 admitted';
  exception when raise_exception then if sqlerrm <> 'PRO_INVALID_VERIFICATION' then raise; end if; end;
  begin perform pg_temp.begin_evidence('30000000-0000-4000-8000-000000000006','1'); raise exception 'Camera admitted';
  exception when raise_exception then if sqlerrm <> 'PRO_INVALID_VERIFICATION' then raise; end if; end;
end $$;

-- Evidence identity binds the authorised pre-AI view to the fresh locked order.
select pg_temp.make_order('30000000-0000-4000-8000-000000000007');
do $$ declare snapshot jsonb; begin
  snapshot := pg_temp.expected_identity('30000000-0000-4000-8000-000000000007');
  update public.ticket_submissions set first_name = 'Changed after authorization' where id = '30000000-0000-4000-8000-000000000007';
  begin
    perform public.begin_pro_licence_verification('30000000-0000-4000-8000-000000000007','1',repeat('b',64),'jpg',snapshot);
    raise exception 'Old identity admitted';
  exception when raise_exception then if sqlerrm <> 'PRO_INTAKE_CHANGED' then raise; end if; end;
  snapshot := pg_temp.expected_identity('30000000-0000-4000-8000-000000000007');
  update public.ticket_submissions set representation_access_token_hash = repeat('c',64) where id = '30000000-0000-4000-8000-000000000007';
  begin
    perform public.begin_pro_licence_verification('30000000-0000-4000-8000-000000000007','1',repeat('b',64),'jpg',snapshot);
    raise exception 'Rotated capability admitted';
  exception when raise_exception then if sqlerrm <> 'PRO_INTAKE_CHANGED' then raise; end if; end;
end $$;

-- Mid-read changes, declaration mismatch, false identity, and expiry fail closed.
select pg_temp.make_order('30000000-0000-4000-8000-000000000008');
select pg_temp.make_order('30000000-0000-4000-8000-000000000009');
select pg_temp.make_order('30000000-0000-4000-8000-000000000010');
select pg_temp.make_order('30000000-0000-4000-8000-000000000011');
do $$ declare evidence_id uuid; begin
  evidence_id := pg_temp.begin_evidence('30000000-0000-4000-8000-000000000008');
  update public.ticket_submissions set drivers_license = 'CHANGED999' where id = '30000000-0000-4000-8000-000000000008';
  perform pg_temp.assert(not public.finish_pro_licence_verification(evidence_id,'1','AB',true,current_date+365,'verified'),'mid-read identity change invalidates proof');
  evidence_id := pg_temp.begin_evidence('30000000-0000-4000-8000-000000000009');
  perform pg_temp.assert(not public.finish_pro_licence_verification(evidence_id,'2','AB',true,current_date+365,'verified'),'read and declaration must agree');
  evidence_id := pg_temp.begin_evidence('30000000-0000-4000-8000-000000000010');
  perform pg_temp.assert(not public.finish_pro_licence_verification(evidence_id,'1','AB',false,current_date+365,'verified'),'identity mismatch invalidates proof');
  evidence_id := pg_temp.begin_evidence('30000000-0000-4000-8000-000000000011');
  perform pg_temp.assert(not public.finish_pro_licence_verification(evidence_id,'1','AB',true,current_date-1,'verified'),'expired licence cannot qualify');
end $$;

-- Table grants plus RLS protect evidence, refund rows and private storage.
insert into storage.objects(bucket_id,name) values('pro-licences','synthetic-private-licence.jpg');
select pg_temp.assert(not has_function_privilege('authenticated','public.begin_pro_licence_verification(uuid,text,text,text,jsonb)','execute'),'browser cannot claim evidence');
select pg_temp.assert(not has_function_privilege('anon','public.finish_pro_licence_verification(uuid,text,text,boolean,date,text)','execute'),'anonymous cannot certify proof');
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) = 0 from public.pro_licence_verifications),'ordinary portal account cannot read licences');
select pg_temp.assert((select count(*) = 0 from public.pro_discount_refunds),'ordinary portal account cannot read refunds');
select pg_temp.assert((select count(*) = 0 from storage.objects where bucket_id = 'pro-licences'),'ordinary portal account cannot read evidence storage');
do $$ begin
  begin
    update public.ticket_submissions set pro_verified = true where id = '30000000-0000-4000-8000-000000000005';
    raise exception 'Browser asserted verified';
  exception when raise_exception then if sqlerrm <> 'PRO_SERVER_ONLY' then raise; end if; end;
  begin
    update public.ticket_submissions set declared_licence_class = '1' where id = '30000000-0000-4000-8000-000000000005';
    raise exception 'Browser changed declaration';
  exception when raise_exception then if sqlerrm <> 'PRO_SERVER_ONLY' then raise; end if; end;
end $$;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) > 0 from public.pro_licence_verifications),'staff may review licence evidence');
reset role;
set request.jwt.claim.role = 'service_role';

-- New officer snapshots retain base prices and exactly 20% discounts. Bundled
-- report allocation is $24.80, while the overall bundle becomes $183.20 pre-tax.
select pg_temp.checkout('30000000-0000-4000-8000-000000000001');
select pg_temp.checkout('30000000-0000-4000-8000-000000000004',true);
select pg_temp.assert((select pro_subtotal_cents-pro_discount_cents = 15840 from public.idr_checkout_intents where ticket_submission_id = '30000000-0000-4000-8000-000000000001'),'officer net subtotal is $158.40');
select pg_temp.assert((select pro_subtotal_cents-pro_discount_cents = 18320 from public.idr_checkout_intents where ticket_submission_id = '30000000-0000-4000-8000-000000000004'),'bundle net subtotal is $183.20');
insert into public.idr_orders(ticket_submission_id,type,price_paid,discount_applied)
  values('30000000-0000-4000-8000-000000000004','addon',24.80,'PRO20');
do $$ declare ticket public.ticket_submissions%rowtype; begin
  begin insert into public.idr_orders(type,price_paid) values('addon',24.80); raise exception 'Unmarked $24.80 addon admitted';
  exception when check_violation then null; end;
  begin insert into public.idr_orders(type,price_paid,discount_applied) values('standalone',24.80,'PRO20'); raise exception 'Standalone received PRO20';
  exception when check_violation then null; end;
  select * into ticket from public.ticket_submissions where id = '30000000-0000-4000-8000-000000000002';
  begin
    insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status,pro_verification_id,pro_coupon,pro_subtotal_cents,pro_discount_cents)
      values(ticket.client_id,ticket.id,'ticket','ticket_only',19800,'open',
        (select pro_verification_id from public.ticket_submissions where id = '30000000-0000-4000-8000-000000000001'),'PRO20',19800,3960);
    raise exception 'Another order evidence admitted';
  exception when raise_exception then if sqlerrm <> 'PRO_VERIFICATION_REQUIRED' then raise; end if; end;
  begin
    insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status,pro_verification_id,pro_coupon,pro_subtotal_cents,pro_discount_cents)
      values(ticket.client_id,ticket.id,'addon','ticket_with_addon',3100,'open',ticket.pro_verification_id,'PRO20',22900,3960);
    raise exception 'Wrong bundle discount admitted';
  exception when raise_exception then if sqlerrm <> 'PRO_VERIFICATION_REQUIRED' then raise; end if; end;
  select * into ticket from public.ticket_submissions where id = '30000000-0000-4000-8000-000000000006';
  begin
    insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status,pro_subtotal_cents,pro_discount_cents)
      values(ticket.client_id,ticket.id,'photo_radar','photo_radar',7900,'open',19800,0);
    raise exception 'Camera received pro snapshot';
  exception when raise_exception then if sqlerrm <> 'PRO_INVALID_PRICE_SNAPSHOT' then raise; end if; end;
end $$;

-- A claimed snapshot cannot be rebound to another order or edited in place.
do $$ declare intent_id uuid; begin
  select id into intent_id from public.idr_checkout_intents where ticket_submission_id = '30000000-0000-4000-8000-000000000001';
  begin update public.idr_checkout_intents set pro_discount_cents = 0,pro_coupon = null,pro_verification_id = null where id = intent_id;
    raise exception 'Active quote edited without another attempt';
  exception when raise_exception then if sqlerrm <> 'PRO_CHECKOUT_SNAPSHOT_IMMUTABLE' then raise; end if; end;
  begin update public.idr_checkout_intents set ticket_submission_id = '30000000-0000-4000-8000-000000000002',
      client_id = (select client_id from public.ticket_submissions where id = '30000000-0000-4000-8000-000000000002') where id = intent_id;
    raise exception 'Snapshot moved to another ticket';
  exception when raise_exception then if sqlerrm <> 'PRO_CHECKOUT_IDENTITY_IMMUTABLE' then raise; end if; end;
  update public.idr_checkout_intents set status = 'paid' where id = intent_id;
  begin update public.idr_checkout_intents set attempts = attempts+1,pro_discount_cents = 0,pro_coupon = null,pro_verification_id = null where id = intent_id;
    raise exception 'Paid snapshot changed';
  exception when raise_exception then if sqlerrm <> 'PRO_CHECKOUT_SNAPSHOT_IMMUTABLE' then raise; end if; end;
end $$;

-- Pro pricing does not lower the referrer reward or give a second discount to
-- the referee. Both independent server rules apply to the same paid file.
select public.ensure_referral_code('20000000-0000-4000-8000-000000000001');
update public.referral_codes set code = 'STACKED' where user_id = '20000000-0000-4000-8000-000000000001';
select pg_temp.assert(public.attach_referral_to_order('30000000-0000-4000-8000-000000000004','STACKED',now()),'bundle referral attribution');
update public.idr_checkout_intents set status = 'paid' where ticket_submission_id = '30000000-0000-4000-8000-000000000004';
select public.referral_record_checkout_payment('30000000-0000-4000-8000-000000000004','pi_bundle','cus_bundle');
select public.referral_record_payment_check('30000000-0000-4000-8000-000000000004','pi_bundle',now()-interval '9 days','cus_bundle');
select public.referral_review_order('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','accepted',true,false,true);
update public.ticket_submissions set referral_accepted_at = now()-interval '10 days' where id = '30000000-0000-4000-8000-000000000004';
select public.referral_recalculate('30000000-0000-4000-8000-000000000004');
select pg_temp.assert((select amount = 50 and status = 'eligible' from public.referrals where order_id = '30000000-0000-4000-8000-000000000004'),'pro bundle still earns one-sided $50 officer reward');
select pg_temp.assert((select pro_discount_cents = 4580 from public.idr_checkout_intents where ticket_submission_id = '30000000-0000-4000-8000-000000000004'),'referral attribution does not change PRO20 pricing');

-- A legacy $488/$99 quote cannot be relabelled as current PRO20 pricing.
do $$ declare ticket public.ticket_submissions%rowtype; begin
  select * into ticket from public.ticket_submissions where id = '30000000-0000-4000-8000-000000000002';
  begin
    insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status,
      pro_verification_id,pro_coupon,pro_subtotal_cents,pro_discount_cents)
    values(ticket.client_id,ticket.id,'ticket','ticket_only',48800,'open',ticket.pro_verification_id,'PRO20',19800,3960);
    raise exception 'Legacy ticket price mixed with current discount';
  exception when raise_exception then if sqlerrm <> 'PRO_INVALID_PRICE_SNAPSHOT' then raise; end if; end;
  begin
    insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status,
      pro_verification_id,pro_coupon,pro_subtotal_cents,pro_discount_cents)
    values(ticket.client_id,ticket.id,'addon','ticket_with_addon',9900,'open',ticket.pro_verification_id,'PRO20',22900,4580);
    raise exception 'Legacy addon price mixed with current discount';
  exception when raise_exception then if sqlerrm <> 'PRO_INVALID_PRICE_SNAPSHOT' then raise; end if; end;
end $$;

-- Full-price checkout followed by verification: refund reservation and parent
-- discount facts change atomically, with monotonically reconciled Stripe states.
select pg_temp.make_order('40000000-0000-4000-8000-000000000001','unknown');
select pg_temp.checkout('40000000-0000-4000-8000-000000000001',false,false);
update public.idr_checkout_intents set status = 'paid' where ticket_submission_id = '40000000-0000-4000-8000-000000000001';
update public.ticket_submissions set status = 'pending' where id = '40000000-0000-4000-8000-000000000001';
select pg_temp.verify_order('40000000-0000-4000-8000-000000000001','1');
insert into public.pro_discount_refunds(ticket_submission_id,checkout_intent_id,verification_id,stripe_payment_intent_id,amount_cents,discount_cents,tax_cents)
  select t.id,i.id,t.pro_verification_id,'pi_refund_fixture',4158,3960,198
  from public.ticket_submissions t join public.idr_checkout_intents i on i.ticket_submission_id = t.id
  where t.id = '40000000-0000-4000-8000-000000000001';

select pg_temp.assert(not has_function_privilege('authenticated','public.complete_pro_discount_refund(uuid,text,text,integer,text)','execute'),'browser cannot record refund success');
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) = 0 from public.pro_discount_refunds),'ordinary user cannot read an actual populated refund row');
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) = 1 from public.pro_discount_refunds),'staff may review an actual refund row');
reset role;
set request.jwt.claim.role = 'service_role';

do $$ begin
  begin
    perform public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001',null,'re_fixture',4158,'succeeded');
    raise exception 'NULL payment bypassed comparison';
  exception when raise_exception then
    if sqlerrm = 'NULL payment bypassed comparison' then raise; end if; end;
  begin
    perform public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',null,'succeeded');
    raise exception 'NULL amount bypassed comparison';
  exception when raise_exception then
    if sqlerrm = 'NULL amount bypassed comparison' then raise; end if; end;
  begin
    perform public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_other','re_fixture',4158,'succeeded');
    raise exception 'Other payment accepted';
  exception when raise_exception then if sqlerrm <> 'PRO_REFUND_RESULT_MISMATCH' then raise; end if; end;
  begin
    perform public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',4809,'succeeded');
    raise exception 'Other amount accepted';
  exception when raise_exception then if sqlerrm <> 'PRO_REFUND_RESULT_MISMATCH' then raise; end if; end;
end $$;

select pg_temp.assert(public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',4158,'pending') = 'pending','pending refund remains pending');
select pg_temp.assert((select discount_applied is null from public.ticket_submissions where id = '40000000-0000-4000-8000-000000000001'),'pending refund does not claim paid discount');
select pg_temp.assert(public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',4158,'succeeded') = 'succeeded','refund can complete');
select pg_temp.assert((select r.status = 'succeeded' and t.discount_applied = 'PRO20' and t.pro_discount_cents = 3960
  from public.pro_discount_refunds r join public.ticket_submissions t on t.id = r.ticket_submission_id where t.id = '40000000-0000-4000-8000-000000000001'),'refund success and order flags agree in one transaction');
select pg_temp.assert(public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',4158,'pending') = 'succeeded','late pending cannot downgrade success');
do $$ begin
  begin
    perform public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_other',4158,'succeeded');
    raise exception 'Second refund id admitted';
  exception when raise_exception then if sqlerrm <> 'PRO_REFUND_RESULT_MISMATCH' then raise; end if; end;
end $$;
select pg_temp.assert(public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',4158,'needs_review') = 'needs_review','actual reversal/failure stays visible');
select pg_temp.assert((select discount_applied is null and pro_discount_cents = 0 from public.ticket_submissions where id = '40000000-0000-4000-8000-000000000001'),'failed refund clears claimed paid discount');
select pg_temp.assert(public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',4158,'pending') = 'needs_review','late pending cannot erase a bound failure');
select pg_temp.assert(public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000001','pi_refund_fixture','re_fixture',4158,'succeeded') = 'needs_review','late success cannot erase a bound failure');

-- Leave a fresh reservation for the runner's two real concurrent workers.
select pg_temp.make_order('40000000-0000-4000-8000-000000000002','unknown');
select pg_temp.checkout('40000000-0000-4000-8000-000000000002',false,false);
update public.idr_checkout_intents set status = 'paid' where ticket_submission_id = '40000000-0000-4000-8000-000000000002';
update public.ticket_submissions set status = 'pending' where id = '40000000-0000-4000-8000-000000000002';
select pg_temp.verify_order('40000000-0000-4000-8000-000000000002','1');
insert into public.pro_discount_refunds(ticket_submission_id,checkout_intent_id,verification_id,stripe_payment_intent_id,amount_cents,discount_cents,tax_cents)
  select t.id,i.id,t.pro_verification_id,'pi_refund_race',4158,3960,198
  from public.ticket_submissions t join public.idr_checkout_intents i on i.ticket_submission_id = t.id
  where t.id = '40000000-0000-4000-8000-000000000002';

-- Aggregate report fixtures: one ordinary current-price officer, one legacy
-- quote which must not be price-imputed, and a paid camera fleet exclusion.
select pg_temp.make_order('60000000-0000-4000-8000-000000000001','5');
select pg_temp.checkout('60000000-0000-4000-8000-000000000001',false,false);
update public.idr_checkout_intents set status = 'paid' where ticket_submission_id = '60000000-0000-4000-8000-000000000001';
select pg_temp.make_order('60000000-0000-4000-8000-000000000002','unknown');
insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status)
  select client_id,id,'ticket','ticket_only',48800,'paid' from public.ticket_submissions
  where id = '60000000-0000-4000-8000-000000000002';
select pg_temp.make_order('60000000-0000-4000-8000-000000000003','unknown','photo_radar');
select public.attach_referral_to_order('60000000-0000-4000-8000-000000000003','STACKED',now());
insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status)
  select client_id,id,'photo_radar','photo_radar',7900,'paid' from public.ticket_submissions
  where id = '60000000-0000-4000-8000-000000000003';
select public.referral_record_checkout_payment('60000000-0000-4000-8000-000000000003','pi_metricscamera','cus_metricscamera');
select public.referral_review_order('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','accepted',true,true,true);
