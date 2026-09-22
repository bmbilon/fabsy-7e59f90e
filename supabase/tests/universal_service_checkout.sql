-- Run after the migration in one transaction and roll back all fixtures.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare oid uuid := 'ffff1111-1111-4111-8111-111111111111'; tid uuid := 'ffff2222-2222-4222-8222-222222222222';
  second_id uuid := 'ffff3333-3333-4333-8333-333333333333'; evidence jsonb;
begin
  if has_table_privilege('anon','public.service_orders','SELECT') then raise exception 'Anonymous order access'; end if;
  if has_function_privilege('authenticated','public.apply_service_order(uuid)','EXECUTE') then raise exception 'Public payment mutation'; end if;
  evidence := '{"version":"universal-service-consent-v1","accepted":true,"method":"checkbox","acceptedAt":"2026-09-22T12:00:00Z","pleadNotGuilty":false}';
  insert into public.clients(id,first_name,last_name,email,phone) values(tid,'Synthetic','Example','universal-fixture@example.test','');
  insert into public.ticket_submissions(id,client_id,first_name,last_name,email,phone,ticket_number,violation,fine_amount,status,service_type,
    ticket_type,order_type,review_path,registered_owner_on_offence_date)
    values(tid,tid,'Synthetic','Example','universal-fixture@example.test','','SYNTHETIC-ONLY','Speeding','100','awaiting_payment','representation','photo_radar','photo_radar','ate','yes');
  insert into public.service_orders(id,access_token_hash,request_fingerprint,product,mode,name,represented_name,email,
    subtotal_cents,gst_cents,total_cents,consent,purchase_terms,consent_form_path,client_id)
    values(oid,repeat('a',64),'fixture','photo_radar','both','Synthetic Example','Synthetic Example','universal-fixture@example.test',
      7900,395,8295,evidence,'{"accepted":true}','service-orders/synthetic/consent.pdf',tid);
  if public.match_service_order(oid) is distinct from tid then raise exception 'Exact email identity match failed'; end if;
  if public.apply_service_order(oid) then raise exception 'Unpaid order activated'; end if;
  update public.service_orders set payment_status='paid',paid_at=now(),stripe_session_id='cs_test_universal_fixture',stripe_payment_intent_id='pi_test_universal_fixture' where id=oid;
  if not public.apply_service_order(oid) then raise exception 'Paid photo order was not activated'; end if;
  if not public.apply_service_order(oid) then raise exception 'Retry not idempotent'; end if;
  if (select status from public.ticket_submissions where id=tid)<>'pending' then raise exception 'Case not activated'; end if;
  if (select intake_consent->>'pleadNotGuilty' from public.ticket_submissions where id=tid)<>'false' then raise exception 'Plea changed'; end if;
  if not exists(select 1 from public.ate_reviews where ticket_submission_id=tid) then raise exception 'Missing ATE queue'; end if;
  begin
    update public.service_orders set email='attacker@example.test' where id=oid;
    raise exception 'Expected immutable acceptance failure';
  exception when raise_exception then
    if sqlerrm <> 'SERVICE_ORDER_ACCEPTANCE_IMMUTABLE' then raise; end if;
  end;
  begin
    update public.service_orders set payment_status='open' where id=oid;
    raise exception 'Expected immutable paid state failure';
  exception when raise_exception then
    if sqlerrm <> 'SERVICE_ORDER_PAYMENT_IMMUTABLE' then raise; end if;
  end;
  -- A shared email with a different legal identity is not silently attached.
  insert into public.service_orders(id,access_token_hash,request_fingerprint,product,mode,name,represented_name,email,
    subtotal_cents,gst_cents,total_cents,consent,purchase_terms)
    values(second_id,repeat('b',64),'fixture2','photo_radar','consent','Different Person','Different Person','universal-fixture@example.test',7900,395,8295,evidence,'{"accepted":true}');
  if public.match_service_order(second_id) is not null then raise exception 'Ambiguous identity matched'; end if;
  if (select match_status from public.service_orders where id=second_id)<>'needs_review' then raise exception 'Review not surfaced'; end if;
end $$;
select 'service order payment, identity, consent, RLS and retry tests passed' as result;
