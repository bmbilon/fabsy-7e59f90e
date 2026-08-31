-- Run only in the disposable local PostgreSQL test runner. Roll back all
-- synthetic rows so the existing accounting/race fixtures remain unchanged.
begin;
set request.jwt.claim.role = 'service_role';
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Assertion failed: %',message; end if; end;
$$;

do $$
declare
  locale text;
  bundle boolean;
  client_id uuid := gen_random_uuid();
  order_id uuid;
  proof_id uuid;
  ticket public.ticket_submissions%rowtype;
  expected_identity jsonb;
begin
  insert into public.clients(id,email,phone) values(client_id,'product-locales@example.test','5875550199');
  foreach locale in array array['pa','tl','zh-hans','zh-hant','ar','hi','es'] loop
    foreach bundle in array array[false,true] loop
      order_id := gen_random_uuid();
      insert into public.ticket_submissions(id,client_id,declared_licence_class,preferred_locale,
        ticket_type,order_type,review_path,representation_access_token_hash)
      values(order_id,client_id,'1',locale,'officer_issued','rapid_resolution','standard',repeat('c',64));
      select * into ticket from public.ticket_submissions where id = order_id;
      expected_identity := jsonb_build_object('client_id',ticket.client_id,'drivers_license',ticket.drivers_license,
        'first_name',ticket.first_name,'last_name',ticket.last_name,'ticket_type',ticket.ticket_type,
        'representation_access_token_hash',ticket.representation_access_token_hash);
      begin
        perform public.begin_pro_licence_verification(order_id,'1',repeat('d',64),'png',expected_identity);
        raise exception 'Non-English proof was minted';
      exception when raise_exception then if sqlerrm <> 'PRO_LOCALE_NOT_RELEASED' then raise; end if; end;
      begin
        insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,
          expected_amount_cents,status,pro_verification_id,pro_coupon,pro_subtotal_cents,pro_discount_cents)
        values(client_id,order_id,case when bundle then 'addon' else 'ticket' end,
          case when bundle then 'ticket_with_addon' else 'ticket_only' end,
          case when bundle then 3100 else 19800 end,'open',gen_random_uuid(),'PRO20',
          case when bundle then 22900 else 19800 end,case when bundle then 4580 else 3960 end);
        raise exception 'Non-English Pro discount was reserved';
      exception when raise_exception then if sqlerrm <> 'PRO_LOCALE_NOT_RELEASED' then raise; end if; end;
      -- The same locale can still buy ordinary RR or its report bundle. A new
      -- immutable full-price reservation is not a Pro Driver product release.
      insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,
        expected_amount_cents,status,pro_subtotal_cents,pro_discount_cents)
      values(client_id,order_id,case when bundle then 'addon' else 'ticket' end,
        case when bundle then 'ticket_with_addon' else 'ticket_only' end,
        case when bundle then 3100 else 19800 end,'open',case when bundle then 22900 else 19800 end,0);
    end loop;
    order_id := gen_random_uuid();
    insert into public.ticket_submissions(id,client_id,declared_licence_class,preferred_locale,
      ticket_type,order_type,review_path,registered_owner_on_offence_date,representation_access_token_hash)
    values(order_id,client_id,'unknown',locale,'photo_radar','photo_radar','ate','yes',repeat('c',64));
    begin
      insert into public.idr_checkout_intents(client_id,ticket_submission_id,type,checkout_kind,expected_amount_cents,status)
      values(client_id,order_id,'photo_radar','photo_radar',7900,'open');
      raise exception 'Non-English Photo Radar checkout was reserved';
    exception when raise_exception then if sqlerrm <> 'PHOTO_RADAR_LOCALE_NOT_RELEASED' then raise; end if; end;
  end loop;

  order_id := gen_random_uuid();
  insert into public.ticket_submissions(id,client_id,declared_licence_class,preferred_locale,
    ticket_type,order_type,review_path,representation_access_token_hash)
  values(order_id,client_id,'1','en','officer_issued','rapid_resolution','standard',repeat('e',64));
  select * into ticket from public.ticket_submissions where id = order_id;
  expected_identity := jsonb_build_object('client_id',ticket.client_id,'drivers_license',ticket.drivers_license,
    'first_name',ticket.first_name,'last_name',ticket.last_name,'ticket_type',ticket.ticket_type,
    'representation_access_token_hash',ticket.representation_access_token_hash);
  proof_id := (public.begin_pro_licence_verification(order_id,'1',repeat('f',64),'jpg',expected_identity)->>'id')::uuid;
  update public.ticket_submissions set preferred_locale = 'pa' where id = order_id;
  perform pg_temp.assert(not public.finish_pro_licence_verification(proof_id,'1','AB',true,current_date+365,'verified'),
    'a locale change while OCR is running invalidates proof');
  perform pg_temp.assert((select not pro_verified and pro_verification_id is null from public.ticket_submissions where id=order_id),
    'locale change removes the stale parent verification link');

  update public.ticket_submissions set preferred_locale = 'en' where id = order_id;
  proof_id := (public.begin_pro_licence_verification(order_id,'1',repeat('f',64),'jpg',expected_identity)->>'id')::uuid;
  perform pg_temp.assert(public.finish_pro_licence_verification(proof_id,'1','AB',true,current_date+365,'verified'),
    'a new English verification still succeeds');
  update public.ticket_submissions set preferred_locale = 'ar' where id = order_id;
  perform pg_temp.assert((select not pro_verified and pro_verification_id is null from public.ticket_submissions where id=order_id),
    'changing locale after verification invalidates the usable proof');
end $$;
rollback;
