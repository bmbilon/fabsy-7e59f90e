begin;
set local lock_timeout = '3s';

-- Keep the production queue's shared Stripe session key available to every
-- checkout producer, including on databases initialized from migrations.
create or replace function public.enqueue_portal_activity(
  p_event_key text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  key_value text := p_event_key;
  existing_id uuid;
  session_id text;
begin
  if p_event_key is null or length(p_event_key) not between 1 and 500 or
     p_event_type is null or length(p_event_type) not between 1 and 80 or
     p_entity_type is null or length(p_entity_type) not between 1 and 80 or
     p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'PORTAL_ACTIVITY_INVALID';
  end if;

  session_id := nullif(p_payload->>'stripe_checkout_session_id', '');
  if p_event_type = 'payment_paid' and session_id is not null then
    key_value := 'payment:checkout:' || session_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(key_value, 0));
  select id into existing_id
  from public.portal_activity_events
  where event_key = key_value or (
    p_event_type = 'payment_paid' and session_id is not null and
    event_type = 'payment_paid' and payload->>'stripe_checkout_session_id' = session_id
  )
  order by occurred_at
  limit 1;

  if existing_id is not null then
    update public.portal_activity_events
    set payload = payload || jsonb_strip_nulls(p_payload)
    where id = existing_id and status = 'pending' and attempts = 0;
    return;
  end if;

  insert into public.portal_activity_events(event_key, event_type, entity_type, entity_id, payload)
  values (key_value, p_event_type, p_entity_type, p_entity_id, p_payload)
  on conflict (event_key) do nothing;
end;
$$;

create function public.emit_service_order_payment_portal_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.payment_status <> 'paid' or new.mode = 'consent' or new.paid_at is null or
     coalesce(new.stripe_session_id, '') !~ '^cs_live_[A-Za-z0-9]+$' or
     coalesce(new.stripe_payment_intent_id, '') !~ '^pi_[A-Za-z0-9]+$' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.payment_status = 'paid' and old.paid_at is not null and
       old.stripe_session_id = new.stripe_session_id and
       old.stripe_payment_intent_id = new.stripe_payment_intent_id then
      return new;
    end if;
  end if;

  -- The general checkout records payment before it can match or apply the case.
  perform public.enqueue_portal_activity(
    'service-order:' || new.id || ':paid',
    'payment_paid',
    'service_order',
    new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'order_id', new.id,
      'submission_id', new.ticket_submission_id,
      'ticket_number', new.ticket_number,
      'client_name', new.name,
      'client_email', new.email,
      'product', new.product,
      'amount_cents', new.subtotal_cents,
      'status', new.payment_status,
      'intake_source', 'General checkout',
      'stripe_checkout_session_id', new.stripe_session_id
    ))
  );
  return new;
end;
$$;
revoke all on function public.emit_service_order_payment_portal_activity() from public, anon, authenticated, service_role;

create trigger emit_service_order_payment_portal_activity
after insert or update of payment_status, paid_at, stripe_session_id, stripe_payment_intent_id on public.service_orders
for each row execute function public.emit_service_order_payment_portal_activity();

commit;
