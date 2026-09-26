-- Run against an isolated test database with the Meta migrations applied.
-- Synthetic attribution only; this script never calls Meta and rolls back.
begin;
do $$
declare
  first_id uuid;
  retry_id uuid;
  synthetic_hash text := repeat('f', 64);
begin
  if public.enqueue_meta_capi_purchase(synthetic_hash, 7900, now(), 'photo_radar') is not null then
    raise exception 'Purchase without attribution was queued';
  end if;
  perform public.record_meta_checkout_attribution(
    synthetic_hash, 'meta-measurement-v1', now() - interval '1 minute',
    'Synthetic database test/1.0', 'fb.1.1788350000000.1234567890', null
  );
  first_id := public.enqueue_meta_capi_purchase(synthetic_hash, 7900, now(), 'photo_radar');
  retry_id := public.enqueue_meta_capi_purchase(synthetic_hash, 7900, now(), 'photo_radar');
  if first_id is null or retry_id is distinct from first_id then
    raise exception 'Photo Radar did not enqueue exactly once';
  end if;
  begin
    perform public.enqueue_meta_capi_purchase(synthetic_hash, 8295, now(), 'photo_radar');
    raise exception 'Tax-inclusive purchase was admitted';
  exception when others then
    if sqlerrm <> 'META_CAPI_VALUE_INVALID' then raise; end if;
  end;
  begin
    perform public.enqueue_meta_capi_purchase(synthetic_hash, 7900, now(), 'rapid_resolution');
    raise exception 'Cross-paired product/value was admitted';
  exception when others then
    if sqlerrm <> 'META_CAPI_VALUE_INVALID' then raise; end if;
  end;
  begin
    perform public.enqueue_meta_capi_purchase(synthetic_hash, null, now(), 'photo_radar');
    raise exception 'Missing purchase value was admitted';
  exception when others then
    if sqlerrm <> 'META_CAPI_VALUE_INVALID' then raise; end if;
  end;
  perform public.withdraw_meta_checkout_attribution(synthetic_hash);
  if exists (select 1 from meta_private.meta_capi_outbox where id = first_id and status = 'pending') then
    raise exception 'Withdrawal left a sendable purchase';
  end if;
  if has_function_privilege('anon', 'public.enqueue_meta_capi_purchase(text,integer,timestamp with time zone,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.enqueue_meta_capi_purchase(text,integer,timestamp with time zone,text)', 'EXECUTE') then
    raise exception 'Public clients can enqueue purchases';
  end if;
end;
$$;
rollback;
