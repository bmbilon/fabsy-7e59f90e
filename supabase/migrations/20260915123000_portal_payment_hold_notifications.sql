-- Capture refunds and disputes for every Stripe product, including standalone
-- insurance-report orders that are not attached to a representation referral.
begin;

create function public.emit_payment_hold_portal_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  client_id uuid;
  submission_id uuid;
  ticket_number text;
  product text;
  snapshot jsonb;
begin
  select t.client_id,t.id,t.ticket_number,coalesce(t.order_type,t.service_type)
    into client_id,submission_id,ticket_number,product
    from public.ticket_submissions t where t.referral_payment_intent_id=new.payment_intent_id limit 1;
  if client_id is null then
    select o.client_id,o.ticket_submission_id,'insurance_damage_report'
      into client_id,submission_id,product
      from public.idr_orders o where o.stripe_payment_intent_id=new.payment_intent_id limit 1;
    if submission_id is not null then
      select t.ticket_number into ticket_number from public.ticket_submissions t where t.id=submission_id;
    end if;
  end if;
  snapshot := public.portal_client_snapshot(client_id) || jsonb_build_object(
    'submission_id',submission_id,
    'ticket_number',ticket_number,
    'product',coalesce(product,'Stripe payment'),
    'stripe_payment_intent_id',new.payment_intent_id
  );

  if new.refunded_at is not null and (tg_op='INSERT' or old.refunded_at is null) then
    perform public.enqueue_portal_activity('refund:'||new.payment_intent_id,
      'payment_refunded','payment_hold',null,snapshot || jsonb_build_object('status','refunded'));
  end if;
  if new.disputed_at is not null and (tg_op='INSERT' or old.disputed_at is null) then
    perform public.enqueue_portal_activity('dispute:'||new.payment_intent_id,
      'payment_disputed','payment_hold',null,snapshot || jsonb_build_object('status','disputed'));
  end if;
  return new;
end;
$$;
create trigger emit_payment_hold_portal_activity after insert or update on public.referral_payment_holds
  for each row execute function public.emit_payment_hold_portal_activity();
revoke all on function public.emit_payment_hold_portal_activity() from public,anon,authenticated,service_role;

commit;
