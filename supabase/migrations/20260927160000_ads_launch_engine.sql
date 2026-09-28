begin;
insert into storage.buckets(id,name,public) values('ads-engine','ads-engine',false) on conflict(id) do nothing;
create table public.ads_batches (
 id uuid primary key default gen_random_uuid(), payload jsonb not null, payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','revoked')),
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(),
 unique(payload_hash), check(status <> 'approved' or (approved_by is not null and approved_at is not null))
);
create table public.ads_engine_state (
 id boolean primary key default true check(id), paused boolean not null default true, frozen boolean not null default false,
 config jsonb, approved_batch_id uuid references public.ads_batches(id), lease_id uuid, lease_until timestamptz, last_error text
);
insert into public.ads_engine_state(id) values(true);
create table public.ads_actions (
 id uuid primary key default gen_random_uuid(), idempotency_key text not null unique, batch_id uuid not null references public.ads_batches(id), kind text not null,
 status text not null default 'committing' check(status in ('committing','applied','failed','uncertain','reconciled')),
 before_state jsonb not null, payload jsonb not null, after_state jsonb, rollback jsonb not null,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.ads_attribution (
 submission_id uuid primary key references public.ticket_submissions(id), fields jsonb not null default '{}', consent_version text,
 readable_at timestamptz, readable_by uuid references auth.users(id), contact_verified_at timestamptz, contact_verified_by uuid references auth.users(id),
 contact_evidence text, created_at timestamptz not null default now()
);
create table public.ads_funnel_events (
 event_id text primary key, submission_id uuid not null references public.ticket_submissions(id),
 event_type text not null check(event_type in ('ticket_uploaded','qualified_ticket_upload','checkout_started','client_paid')),
 service text not null check(service in ('officer','camera')), attribution jsonb not null default '{}', livemode boolean not null default true,
 value_cents bigint, tax_cents bigint, currency text not null default 'CAD' check(currency='CAD'), line_items jsonb,
 occurred_at timestamptz not null default now(), check(value_cents is null or value_cents>=0), check(tax_cents is null or tax_cents>=0)
);
create index ads_funnel_event_date on public.ads_funnel_events(occurred_at);
create table public.ads_reports (
 date date primary key, payload jsonb not null, memo text, created_at timestamptz not null default now()
);
create table public.ads_spend_snapshots (
 id uuid primary key default gen_random_uuid(), payload jsonb not null, observed_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['ads_batches','ads_engine_state','ads_actions','ads_attribution','ads_funnel_events','ads_reports','ads_spend_snapshots'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.ads_review_batch(p_id uuid,p_hash text,p_approve boolean) returns void
language plpgsql security definer set search_path=public as $$
declare b public.ads_batches;
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'admin') then raise exception 'ADMIN_TAP_REQUIRED'; end if;
 select * into b from public.ads_batches where id=p_id for update;
 if b.id is null or b.status<>'pending' or b.payload_hash<>p_hash then raise exception 'BATCH_CHANGED'; end if;
 if p_approve and b.payload->>'kind'='measurement_setup' and (
  jsonb_array_length(b.payload->'holds')<>0 or coalesce((b.payload->'config'->>'spendingAuthorized')::boolean,true)
  or b.payload->'config'->>'currency'<>'CAD' or b.payload->'config'->>'timezone'<>'America/Edmonton'
  or jsonb_array_length(b.payload->'plan'->'operations')>3
  or exists(select 1 from jsonb_array_elements(b.payload->'plan'->'operations') o where not o ? 'conversionActionOperation')
 ) then raise exception 'MEASUREMENT_SETUP_SCOPE_INVALID'; end if;
 if p_approve and coalesce(b.payload->>'kind','launch')<>'measurement_setup' and (jsonb_array_length(b.payload->'holds')<>0 or not coalesce((b.payload->'aiReview'->>'passed')::boolean,false)
  or coalesce((b.payload->'config'->>'learningSpendLimitCad')::numeric,0)<=0
  or b.payload->'config'->>'currency'<>'CAD' or b.payload->'config'->>'timezone'<>'America/Edmonton'
  or not coalesce((b.payload->'config'->>'spendingAuthorized')::boolean,false)) then raise exception 'BATCH_NOT_LAUNCH_ELIGIBLE'; end if;
 update public.ads_batches set status=case when p_approve then 'approved' else 'rejected' end,
 approved_by=auth.uid(),approved_at=clock_timestamp() where id=p_id;
 if p_approve and coalesce(b.payload->>'kind','launch')<>'measurement_setup' then update public.ads_engine_state set config=b.payload->'config',approved_batch_id=p_id,paused=false where id; end if;
end $$;
revoke all on function public.ads_review_batch(uuid,text,boolean) from public,anon,service_role;
grant execute on function public.ads_review_batch(uuid,text,boolean) to authenticated;

create function public.ads_claim_action(p_key text,p_batch uuid,p_kind text,p_before jsonb,p_payload jsonb,p_rollback jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.ads_engine_state; a public.ads_actions;
begin
 select * into s from public.ads_engine_state where id for update;
 select * into a from public.ads_actions where idempotency_key=p_key;
 if a.id is not null then
  if a.payload<>p_payload or a.batch_id<>p_batch or a.kind<>p_kind then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',a.id,'duplicate',true,'status',a.status);
 end if;
 update public.ads_actions set status='uncertain' where status='committing' and created_at<now()-interval '3 minutes';
 if exists(select 1 from public.ads_actions where status='committing' or status='uncertain' and p_kind not in ('pause','safety_pause')) then raise exception 'UNCERTAIN_ACTION_HOLD'; end if;
 if s.lease_until>now() then raise exception 'JOB_OVERLAP'; end if;
 if p_kind not in ('pause','safety_pause') and (s.frozen or (s.paused and p_kind not in ('sync','measurement_setup'))) then raise exception 'ACTIONS_FROZEN'; end if;
 if not exists(select 1 from public.ads_batches where id=p_batch and status='approved') then raise exception 'APPROVAL_REQUIRED'; end if;
 insert into public.ads_actions(idempotency_key,batch_id,kind,before_state,payload,rollback)
 values(p_key,p_batch,p_kind,p_before,p_payload,p_rollback) returning * into a;
 update public.ads_engine_state set lease_id=a.id,lease_until=now()+interval '3 minutes' where id;
 return jsonb_build_object('id',a.id,'duplicate',false,'status',a.status);
end $$;
create function public.ads_finish_action(p_id uuid,p_status text,p_after jsonb,p_rollback jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 update public.ads_actions set status=p_status,after_state=p_after,rollback=p_rollback,completed_at=now() where id=p_id and status='committing';
 if not found then raise exception 'ACTION_LEASE_LOST'; end if;
 update public.ads_engine_state set lease_id=null,lease_until=null,frozen=frozen or p_status='uncertain',last_error=case when p_status='uncertain' then 'Reconcile live platform state before retrying.' else last_error end where id and lease_id=p_id;
end $$;
create function public.ads_claim_job(p_kind text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v uuid=gen_random_uuid(); s public.ads_engine_state;
begin
 select * into s from public.ads_engine_state where id for update;
 if exists(select 1 from public.ads_actions where status='committing' and created_at<now()-interval '3 minutes') then
  update public.ads_actions set status='uncertain' where status='committing' and created_at<now()-interval '3 minutes';
  update public.ads_engine_state set frozen=true,last_error='Interrupted platform write requires reconciliation.' where id;
 end if;
 if s.lease_until>now() then return null; end if;
 update public.ads_engine_state set lease_id=v,lease_until=now()+interval '3 minutes' where id;
 return v;
end $$;
revoke all on function public.ads_claim_action(text,uuid,text,jsonb,jsonb,jsonb),public.ads_finish_action(uuid,text,jsonb,jsonb),public.ads_claim_job(text) from public,anon,authenticated;
grant execute on function public.ads_claim_action(text,uuid,text,jsonb,jsonb,jsonb),public.ads_finish_action(uuid,text,jsonb,jsonb),public.ads_claim_job(text) to service_role;

alter table public.portal_push_outbox add column ads_batch_id uuid references public.ads_batches(id);
create function public.ads_batch_push() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.portal_push_outbox(subscription_id,ads_batch_id,dedupe_key)
 select s.id,new.id,'ads-batch:'||new.id from public.portal_push_subscriptions s where s.active and public.has_role(s.user_id,'admin') on conflict do nothing;
 return new;
end $$;
revoke all on function public.ads_batch_push() from public,anon,authenticated;
create trigger ads_batch_push after insert on public.ads_batches for each row execute function public.ads_batch_push();

-- Install using existing Vault credentials. Functions fail closed when no approved config exists.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net')
 and exists(select 1 from vault.secrets where name='idr_project_url') and exists(select 1 from vault.secrets where name='idr_cron_secret') then
 perform cron.schedule('fabsy-ads-spend-monitor','*/15 * * * *',$job$
 select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='idr_project_url')||'/functions/v1/ads-engine',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),body:='{"action":"monitor"}'::jsonb,timeout_milliseconds:=150000); $job$);
 -- Hourly invocation chooses 08:00 Edmonton, including daylight saving changes.
 perform cron.schedule('fabsy-ads-morning-report','5 * * * *',$job$
 select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='idr_project_url')||'/functions/v1/ads-engine',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),body:='{"action":"report-scheduled"}'::jsonb,timeout_milliseconds:=150000); $job$);
 end if;
end $$;
commit;
