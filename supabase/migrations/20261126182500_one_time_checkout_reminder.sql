begin;
set local lock_timeout = '3s';

-- Stage zero is reserved for an explicitly queued follow-up. Discovery still
-- creates only the three scheduled stages. Keep the existing unique key.
alter table public.ticket_checkout_reminder_events
  drop constraint ticket_checkout_reminder_events_stage_check,
  add constraint ticket_checkout_reminder_events_stage_check check (stage between 0 and 3);

do $migration$
declare
  definition text;
  freeze_point constant text := ' if ctx is distinct from p_context or ctx->>''valid''<>''true'' or ctx->>''review_reason'' is not null';
  finish_point constant text := '   where id=(select campaign_id from public.ticket_checkout_reminder_events where id=p_id and stage=3)';
begin
  definition := pg_get_functiondef('public.begin_ticket_checkout_reminder(uuid,uuid,jsonb,text,text,jsonb)'::regprocedure);
  if position(freeze_point in definition) = 0 then raise exception 'UNEXPECTED_REMINDER_BEGIN_DEFINITION'; end if;
  execute replace(definition, freeze_point, $guard$
 if e.stage=0 and (e.source_context is distinct from ctx or p_channel is distinct from 'email'
  or ctx->>'paid' is distinct from 'false' or ctx->>'consented' is distinct from 'true' or c.opted_out_at is not null) then
  update public.ticket_checkout_reminder_events set status='skipped',claim_token=null,lease_until=null,
   last_error='One-time reminder eligibility changed before delivery' where id=e.id;
  return false;
 end if;
$guard$ || freeze_point);

  definition := pg_get_functiondef('public.finish_ticket_checkout_reminder(uuid,uuid,text,text,text)'::regprocedure);
  if position(finish_point in definition) = 0 then raise exception 'UNEXPECTED_REMINDER_FINISH_DEFINITION'; end if;
  execute replace(definition, finish_point, $finish$
   where id=(select e.campaign_id from public.ticket_checkout_reminder_events e where e.id=p_id
    and (e.stage=3 or (e.stage=0 and not exists (
     select 1 from public.ticket_checkout_reminder_events remaining where remaining.campaign_id=e.campaign_id
      and remaining.id<>e.id and remaining.status not in ('sent','skipped')
    ))))
$finish$);
end
$migration$;
commit;
