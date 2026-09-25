-- A staff-only invalidation signal. No client or financial data enters Realtime.
create table public.admin_workspace_updates (
 id boolean primary key default true check(id), revision bigint not null default 0,
 changed_at timestamptz not null default clock_timestamp()
);
insert into public.admin_workspace_updates(id) values(true);
alter table public.admin_workspace_updates enable row level security;
revoke all on public.admin_workspace_updates from public,anon,authenticated;
grant select on public.admin_workspace_updates to authenticated;
grant all on public.admin_workspace_updates to service_role;
create policy staff_read_workspace_revision on public.admin_workspace_updates for select to authenticated using(public.is_idr_staff());

create function public.notify_admin_workspace_update() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 update public.admin_workspace_updates set revision=revision+1,changed_at=clock_timestamp() where id;
 return null;
end $$;
revoke all on function public.notify_admin_workspace_update() from public,anon,authenticated;

create function public.sync_verified_payment_case_stage(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare ticket public.ticket_submissions; verified boolean;
begin
 if p_id is null then return; end if;
 select * into ticket from public.ticket_submissions where id=p_id;
 if not found or ticket.deleted_at is not null or ticket.service_type<>'representation'
  or ticket.case_outcome is not null or ticket.status not in ('awaiting_payment','pending','in_progress') then return; end if;
 -- Read trusted, server-verified evidence. Never infer payment from lifecycle status.
 verified := (ticket.representation_paid_at is not null and ticket.representation_checkout_session_id is not null)
  or exists(select 1 from public.idr_checkout_intents where ticket_submission_id=p_id and client_id=ticket.client_id
     and status='paid' and stripe_checkout_session_id is not null and checkout_kind in ('ticket_only','ticket_with_addon','photo_radar'))
  or exists(select 1 from public.service_orders where ticket_submission_id=p_id and client_id=ticket.client_id
     and mode<>'consent' and product in ('rapid_resolution','bundle','photo_radar') and payment_status='paid'
     and paid_at is not null and stripe_session_id is not null and stripe_payment_intent_id is not null);
 if not verified or exists(select 1 from public.service_orders where ticket_submission_id=p_id and payment_status in ('refunded','disputed')) then return; end if;
 -- Preserve later tracking inherited from an intake as well as canonical stages.
 if exists(select 1 from public.ticket_intake_drafts d join public.admin_ticket_case_status s on s.kind='draft' and s.ticket_id=d.id
   where d.converted_submission_id=p_id and s.stage not in ('partial','paid')) then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('submission'||p_id::text,731904219::bigint));
 insert into public.admin_ticket_case_status(kind,ticket_id,stage,version,note)
 values('submission',p_id,'paid',1,'Verified Stripe payment received.')
 on conflict(kind,ticket_id) do update set stage='paid',version=admin_ticket_case_status.version+1,
   updated_at=clock_timestamp(),updated_by=null,note=excluded.note
 where admin_ticket_case_status.stage='partial';
end $$;
revoke all on function public.sync_verified_payment_case_stage(uuid) from public,anon,authenticated;
grant execute on function public.sync_verified_payment_case_stage(uuid) to service_role;

create function public.sync_case_after_payment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='ticket_submissions' then perform public.sync_verified_payment_case_stage(new.id);
 else perform public.sync_verified_payment_case_stage(new.ticket_submission_id); end if;
 return null;
end $$;
revoke all on function public.sync_case_after_payment() from public,anon,authenticated;
create trigger sync_stripe_submission_stage after insert or update of representation_paid_at,representation_checkout_session_id on public.ticket_submissions
 for each row execute function public.sync_case_after_payment();
create trigger sync_stripe_intent_stage after insert or update of status,ticket_submission_id,stripe_checkout_session_id on public.idr_checkout_intents
 for each row execute function public.sync_case_after_payment();
create trigger sync_stripe_service_order_stage after insert or update of payment_status,ticket_submission_id,paid_at on public.service_orders
 for each row execute function public.sync_case_after_payment();

create trigger live_submission_payment after insert or update of representation_paid_at,assessment_paid_at,status on public.ticket_submissions
 for each statement execute function public.notify_admin_workspace_update();
create trigger live_checkout_payment after insert or update of status,ticket_submission_id on public.idr_checkout_intents
 for each statement execute function public.notify_admin_workspace_update();
create trigger live_service_payment after insert or update of payment_status,ticket_submission_id,applied_at on public.service_orders
 for each statement execute function public.notify_admin_workspace_update();
create trigger live_idr_payment after insert or update of paid_at,status on public.idr_orders
 for each statement execute function public.notify_admin_workspace_update();
create trigger live_case_stage after insert or update or delete on public.admin_ticket_case_status
 for each statement execute function public.notify_admin_workspace_update();
create trigger live_paid_metrics after insert or update on analytics_private.paid_payment_purchases
 for each statement execute function public.notify_admin_workspace_update();
create trigger live_refund_metrics after insert or update on analytics_private.paid_payment_refunds
 for each statement execute function public.notify_admin_workspace_update();

-- These tables are supplied by the separately deployed cloud portal runner.
do $$ begin
 if to_regclass('public.portal_agent_jobs') is not null then
  execute 'create trigger live_portal_jobs after insert or update of status on public.portal_agent_jobs for each statement execute function public.notify_admin_workspace_update()';
 end if;
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
 alter publication supabase_realtime add table public.admin_workspace_updates;
end $$;

create function public.portal_recent_payments() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED'; end if;
 select coalesce(jsonb_agg(x order by x.paid_at desc),'[]'::jsonb) into result from (
  select * from (
   select o.id,o.ticket_submission_id,coalesce(t.ticket_number,o.ticket_number) as ticket_number,o.name as client_name,
    o.product,o.payment_status,o.paid_at,s.stage as case_stage,
    case when o.payment_status in ('refunded','disputed') then 'Payment needs review'
      when o.product='insurance_report' then 'Insurance report payment'
      when o.ticket_submission_id is null then 'Payment received — match to a case'
      when o.applied_at is null then 'Payment received — intake or consent review needed'
      else 'Payment applied to case' end as detail
   from public.service_orders o left join public.ticket_submissions t on t.id=o.ticket_submission_id
   left join public.admin_ticket_case_status s on s.kind='submission' and s.ticket_id=t.id
   where o.mode<>'consent' and o.payment_status in ('paid','refunded','disputed') and o.stripe_session_id is not null
    and (t.id is null or t.deleted_at is null)
   union all
   select t.id,t.id,t.ticket_number,coalesce(c.first_name,'')||' '||coalesce(c.last_name,''),
    t.service_type,'paid',t.representation_paid_at,s.stage,'Payment applied to case'
   from public.ticket_submissions t left join public.clients c on c.id=t.client_id
   left join public.admin_ticket_case_status s on s.kind='submission' and s.ticket_id=t.id
   where t.deleted_at is null and t.representation_paid_at is not null and t.representation_checkout_session_id is not null
    and not exists(select 1 from public.service_orders o where o.ticket_submission_id=t.id and o.mode<>'consent' and o.payment_status in ('paid','refunded','disputed'))
  ) combined order by paid_at desc nulls last limit 20
 ) x;
 return result;
end $$;
revoke all on function public.portal_recent_payments() from public,anon;
grant execute on function public.portal_recent_payments() to authenticated,service_role;

-- Repair a missing required initial version in the earlier cloud offer trigger.
do $$ declare definition text; begin
 if to_regprocedure('public.sync_new_offer_case_stage()') is not null then
  definition:=pg_get_functiondef('public.sync_new_offer_case_stage()'::regprocedure);
  definition:=replace(definition,'admin_ticket_case_status(kind,ticket_id,stage,note)','admin_ticket_case_status(kind,ticket_id,stage,version,note)');
  definition:=replace(definition,'''crown_offer_received'',''Authenticated','''crown_offer_received'',1,''Authenticated');
  execute definition;
 end if;
end $$;
