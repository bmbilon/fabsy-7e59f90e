begin;

do $$
declare
  click_cookie text := 'fb.123.1788350000000000.' || repeat('a', 512);
  accepted_at timestamptz := clock_timestamp();
  lease record;
  delivery record;
begin
  if has_function_privilege('anon', 'public.record_meta_checkout_attribution(text,text,timestamptz,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.record_meta_checkout_attribution(text,text,timestamptz,text,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.record_meta_checkout_attribution(text,text,timestamptz,text,text,text)', 'EXECUTE') then
    raise exception 'RPC access boundary changed';
  end if;

  if not public.record_meta_checkout_attribution(
    repeat('a', 64), 'meta-measurement-v1', accepted_at, 'Synthetic Browser/1.0', null, click_cookie
  ) then raise exception '512-character click was rejected'; end if;
  if (select fbc from meta_private.meta_checkout_attribution where session_hash = repeat('a', 64)) <> click_cookie then
    raise exception 'Stored click was altered';
  end if;

  begin
    perform public.record_meta_checkout_attribution(
      repeat('b', 64), 'meta-measurement-v1', accepted_at, 'Synthetic Browser/1.0', null, click_cookie || 'a'
    );
    raise exception 'Overlong click was accepted';
  exception when others then
    if sqlerrm <> 'META_ATTRIBUTION_FBC_INVALID' then raise; end if;
  end;
  begin
    perform public.record_meta_checkout_attribution(
      repeat('b', 64), 'meta-measurement-v1', accepted_at, 'Synthetic Browser/1.0',
      'fb.1.1788350000000.' || repeat('a', 201), null
    );
    raise exception 'Browser-ID bound was widened';
  exception when others then
    if sqlerrm <> 'META_ATTRIBUTION_FBP_INVALID' then raise; end if;
  end;
  begin
    update meta_private.meta_checkout_attribution set fbc = click_cookie || 'a' where session_hash = repeat('a', 64);
    raise exception 'Table constraint accepted overlong click';
  exception when check_violation then null;
  end;

  perform public.enqueue_meta_capi_purchase(repeat('a', 64), 19800, clock_timestamp(), 'rapid_resolution');
  select * into lease from public.claim_meta_capi_purchases(1, 90);
  select * into delivery from public.begin_meta_capi_purchase_delivery(lease.outbox_id, lease.lease_token);
  if delivery.fbc is distinct from click_cookie then raise exception 'Outbox delivery dropped full click'; end if;
  perform public.complete_meta_capi_purchase(lease.outbox_id, lease.lease_token);
  if exists (select 1 from meta_private.meta_checkout_attribution where session_hash = repeat('a', 64) and fbc is not null) then
    raise exception 'Terminal cleanup retained browser identifiers';
  end if;

  perform public.record_meta_checkout_attribution(
    repeat('c', 64), 'meta-measurement-v1', accepted_at, 'Synthetic Browser/1.0', null, click_cookie
  );
  perform public.withdraw_meta_checkout_attribution(repeat('c', 64));
  if public.record_meta_checkout_attribution(
    repeat('c', 64), 'meta-measurement-v1', accepted_at, 'Synthetic Browser/1.0', null, click_cookie
  ) then raise exception 'Withdrawal fence was bypassed'; end if;
end;
$$;

rollback;
select 'Meta full click-ID migration passed: 512-character roundtrip, outbox delivery, bounds, ACL, cleanup and withdrawal.' as result;
