-- Durable disclosure acknowledgements. No case deadlines/outcomes/disclosure clocks are changed.
create table public.disclosure_automation_state (
  id boolean primary key default true check (id),
  delivery_enabled boolean not null default false,
  routing_configured boolean not null default false,
  last_webhook_at timestamptz,
  last_worker_at timestamptz,
  last_worker_error text
);
insert into public.disclosure_automation_state(id) values(true);

create table public.disclosure_confirmations (
  id uuid primary key default gen_random_uuid(),
  source_message_id text not null unique check(length(source_message_id) between 1 and 500),
  sender text not null check(sender = 'noreply@gov.ab.ca'),
  ticket_number text,
  confirmed_at timestamptz,
  confirmed_on date generated always as ((confirmed_at at time zone 'America/Edmonton')::date) stored,
  timeframe_text text check(length(timeframe_text) <= 250),
  body_excerpt text not null check(length(body_excerpt) <= 12000),
  authentication_result text not null check(length(authentication_result) <= 2000),
  parse_error text,
  status text not null default 'pending' check(status in ('pending','matched','duplicate','needs_review')),
  review_reason text,
  submission_id uuid references public.ticket_submissions(id) on delete restrict,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status <> 'matched' or (submission_id is not null and confirmed_at is not null and timeframe_text is not null and parse_error is null))
);
create unique index disclosure_confirmation_case_day on public.disclosure_confirmations(submission_id,confirmed_on) where status='matched';
create index disclosure_confirmation_review on public.disclosure_confirmations(received_at) where status in ('pending','needs_review');
create index disclosure_ticket_lookup on public.ticket_submissions ((regexp_replace(upper(ticket_number),'[^A-Z0-9]','','g')));

create table public.disclosure_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null unique references public.disclosure_confirmations(id) on delete restrict,
  submission_id uuid not null references public.ticket_submissions(id) on delete restrict,
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  email_payload jsonb check(jsonb_typeof(email_payload)='object'),
  status text not null default 'pending' check(status in ('pending','processing','sent','needs_review')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  provider_email_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check(status <> 'sent' or (provider_email_id is not null and sent_at is not null))
);
create index disclosure_outbox_due on public.disclosure_notification_outbox(next_attempt_at) where status in ('pending','processing');

alter table public.disclosure_confirmations enable row level security;
alter table public.disclosure_notification_outbox enable row level security;
alter table public.disclosure_automation_state enable row level security;
revoke all on public.disclosure_confirmations,public.disclosure_notification_outbox,public.disclosure_automation_state from public,anon,authenticated;
grant select on public.disclosure_confirmations,public.disclosure_notification_outbox,public.disclosure_automation_state to authenticated;
grant all on public.disclosure_confirmations,public.disclosure_notification_outbox,public.disclosure_automation_state to service_role;
create policy "Staff read disclosure confirmations" on public.disclosure_confirmations for select to authenticated using(public.is_idr_staff());
create policy "Staff read disclosure deliveries" on public.disclosure_notification_outbox for select to authenticated using(public.is_idr_staff());
create policy "Staff read disclosure health" on public.disclosure_automation_state for select to authenticated using(public.is_idr_staff());

create function public.match_disclosure_confirmation(p_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare item public.disclosure_confirmations%rowtype; ticket public.ticket_submissions%rowtype;
  client public.clients%rowtype; matches uuid[]; reason text;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED'; end if;
  select * into item from public.disclosure_confirmations where id=p_id for update;
  if not found then raise exception 'CONFIRMATION_NOT_FOUND'; end if;
  if item.status in ('matched','duplicate') then return item.status; end if;
  if item.parse_error is not null then
    update public.disclosure_confirmations set status='needs_review',review_reason=item.parse_error,updated_at=now() where id=p_id;
    return 'needs_review';
  end if;
  -- Include ALL representation matches before checking state: do not pick one of two matching records.
  select array_agg(id) into matches from public.ticket_submissions
    where service_type='representation' and regexp_replace(upper(ticket_number),'[^A-Z0-9]','','g')=item.ticket_number;
  if coalesce(cardinality(matches),0)=0 then reason := 'No exact representation case found. Correct or create the case, then retry matching.';
  elsif cardinality(matches)>1 then reason := 'Multiple representation cases have this ticket number. Resolve the duplicate records before retrying.';
  else
    select * into ticket from public.ticket_submissions where id=matches[1] for share;
    select * into client from public.clients where id=ticket.client_id for share;
    if ticket.status not in ('pending','in_progress') or ticket.case_outcome is not null then
      reason := 'Case is unpaid, closed or outside the active representation workflow.';
    elsif ticket.representation_paid_at is null and not exists (
      select 1 from public.idr_checkout_intents where ticket_submission_id=ticket.id and client_id=ticket.client_id
        and status='paid' and checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
    ) then reason := 'Representation payment is not recorded. Verify payment before retrying.';
    elsif client.id is null or coalesce(client.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      reason := 'The matched case has no valid client email.';
    end if;
  end if;
  if reason is not null then
    update public.disclosure_confirmations set status='needs_review',review_reason=reason,updated_at=now() where id=p_id;
    return 'needs_review';
  end if;
  -- Serializes independent provider IDs acknowledging the same case on the same day.
  perform pg_advisory_xact_lock(hashtextextended(ticket.id::text || ':' || item.confirmed_on::text,0));
  if exists(select 1 from public.disclosure_confirmations where submission_id=ticket.id and confirmed_on=item.confirmed_on and status='matched') then
    update public.disclosure_confirmations set status='duplicate',submission_id=ticket.id,
      review_reason='A confirmation is already recorded for this case and date.',updated_at=now() where id=p_id;
    return 'duplicate';
  end if;
  update public.disclosure_confirmations set status='matched',submission_id=ticket.id,review_reason=null,updated_at=now() where id=p_id;
  insert into public.disclosure_notification_outbox(confirmation_id,submission_id,snapshot)
    values(p_id,ticket.id,jsonb_build_object('recipient',client.email,'first_name',client.first_name,
      'ticket_number',item.ticket_number,'confirmed_on',item.confirmed_on,'timeframe_text',item.timeframe_text,'submission_id',ticket.id));
  return 'matched';
end $$;

create function public.ingest_disclosure_confirmation(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare event_id uuid; result text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  insert into public.disclosure_confirmations(source_message_id,sender,ticket_number,confirmed_at,timeframe_text,body_excerpt,authentication_result,parse_error)
    values(p_event->>'source_message_id',p_event->>'sender',p_event->>'ticket_number',(p_event->>'confirmed_at')::timestamptz,
      p_event->>'timeframe_text',p_event->>'body_excerpt',p_event->>'authentication_result',p_event->>'parse_error')
    on conflict(source_message_id) do nothing returning id into event_id;
  if event_id is null then
    select id,status into event_id,result from public.disclosure_confirmations where source_message_id=p_event->>'source_message_id';
    return jsonb_build_object('id',event_id,'status',result,'replayed',true);
  end if;
  result := public.match_disclosure_confirmation(event_id);
  return jsonb_build_object('id',event_id,'status',result,'replayed',false);
end $$;

create function public.claim_disclosure_notices(p_limit integer default 5) returns setof public.disclosure_notification_outbox
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if not (select delivery_enabled from public.disclosure_automation_state where id) then return; end if;
  -- Never retry an ambiguous send outside the provider's 24h idempotency window.
  update public.disclosure_notification_outbox set status='needs_review',claim_token=null,lease_until=null,
    last_error='Delivery is uncertain or retry limit reached. Check Resend before any manual resend.'
    where status in ('pending','processing') and (lease_until is null or lease_until<now())
      and (first_attempt_at < now()-interval '23 hours' or attempts>=15);
  -- Recipient/case changes before the first send require review. Retries always use their frozen snapshot.
  update public.disclosure_notification_outbox o set status='needs_review',last_error='Case state or recipient changed before delivery. Review the case.'
    where status='pending' and first_attempt_at is null and not exists(
      select 1 from public.ticket_submissions t join public.clients c on c.id=t.client_id
      where t.id=o.submission_id and t.status in ('pending','in_progress') and t.case_outcome is null
        and c.email=o.snapshot->>'recipient');
  return query
    with due as (
      select id from public.disclosure_notification_outbox
      where next_attempt_at<=now() and (status='pending' or (status='processing' and lease_until<now()))
        and (first_attempt_at is null or first_attempt_at>=now()-interval '23 hours') and attempts<15
      order by next_attempt_at,id for update skip locked limit greatest(1,least(p_limit,5))
    ) update public.disclosure_notification_outbox o set status='processing',claim_token=gen_random_uuid(),
      lease_until=now()+interval '5 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
      from due where o.id=due.id returning o.*;
end $$;

create function public.freeze_disclosure_notice(p_id uuid,p_claim uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare payload jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  update public.disclosure_notification_outbox set email_payload=coalesce(email_payload,p_payload)
    where id=p_id and claim_token=p_claim and status='processing' and lease_until>now()
    returning email_payload into payload;
  if payload is null then raise exception 'LEASE_LOST'; end if;
  return payload;
end $$;

create function public.complete_disclosure_notice(p_id uuid,p_claim uuid,p_provider_id text default null,p_error text default null) returns boolean
language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if nullif(p_provider_id,'') is null and nullif(p_error,'') is null then raise exception 'RESULT_REQUIRED'; end if;
  update public.disclosure_notification_outbox set
    status=case when nullif(p_provider_id,'') is not null then 'sent' else 'pending' end,
    provider_email_id=nullif(p_provider_id,''),sent_at=case when nullif(p_provider_id,'') is not null then now() else null end,
    last_error=case when nullif(p_provider_id,'') is not null then null else left(p_error,500) end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts,6)))::integer),
    claim_token=null,lease_until=null
    where id=p_id and claim_token=p_claim and status='processing';
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create function public.get_case_disclosure_confirmations(p_submission_id uuid)
returns table(id uuid,confirmed_on date,timeframe_text text,notification_status text,sent_at timestamptz)
language sql stable security definer set search_path=public as $$
  select d.id,d.confirmed_on,d.timeframe_text,o.status,o.sent_at
  from public.disclosure_confirmations d left join public.disclosure_notification_outbox o on o.confirmation_id=d.id
  where d.submission_id=p_submission_id and d.status='matched' and (
    public.is_idr_staff() or exists(select 1 from public.ticket_submissions t join public.clients c on c.id=t.client_id
      where t.id=p_submission_id and c.auth_user_id=auth.uid())
  ) order by d.confirmed_on desc;
$$;

revoke all on function public.match_disclosure_confirmation(uuid),public.ingest_disclosure_confirmation(jsonb),
  public.claim_disclosure_notices(integer),public.freeze_disclosure_notice(uuid,uuid,jsonb),
  public.complete_disclosure_notice(uuid,uuid,text,text),public.get_case_disclosure_confirmations(uuid) from public,anon,authenticated;
grant execute on function public.match_disclosure_confirmation(uuid),public.ingest_disclosure_confirmation(jsonb),
  public.claim_disclosure_notices(integer),public.freeze_disclosure_notice(uuid,uuid,jsonb),
  public.complete_disclosure_notice(uuid,uuid,text,text) to service_role;
grant execute on function public.match_disclosure_confirmation(uuid),public.get_case_disclosure_confirmations(uuid) to authenticated;

comment on table public.disclosure_confirmations is 'Crown request acknowledgements only; never complete disclosure receipt. Email content is untrusted data.';
comment on table public.disclosure_notification_outbox is 'Frozen transactional notices. Sent means accepted by Resend; not proven delivered to the inbox.';
