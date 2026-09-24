begin;
create table public.ticket_recovery_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  activated_at timestamptz,
  enrollment_since timestamptz,
  mailing_address text,
  cadence_hours integer[] not null default array[24,72,168],
  last_worker_at timestamptz,
  last_worker_error text,
  check(cadence_hours in (array[24],array[24,72],array[24,72,168])),
  check(not enabled or (activated_at is not null and enrollment_since is not null and coalesce(length(trim(mailing_address)),0)>=12))
);
insert into public.ticket_recovery_settings(singleton) values(true);
create table public.ticket_recovery_suppressions (
  channel text not null check(channel in ('email','sms')),
  recipient text not null,
  created_at timestamptz not null default now(),
  reason text not null,
  primary key(channel,recipient)
);
create table public.ticket_recovery_events (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check(source_kind in ('submission','draft')),
  source_id uuid not null,
  channel text not null check(channel in ('email','sms')),
  stage integer not null check(stage between 1 and 3),
  due_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','claimed','attempting','sent','held','suppressed','failed','uncertain','historical')),
  reason text,
  claim_id uuid,
  claim_expires_at timestamptz,
  attempted_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  delivery_key text unique,
  recipient text,
  ticket_number text,
  completion_mode text,
  created_at timestamptz not null default now(),
  unique(source_kind,source_id,channel,stage),
  check(status<>'sent' or (provider_id is not null and sent_at is not null))
);
create index ticket_recovery_due on public.ticket_recovery_events(due_at) where status='pending';

-- Read current state. JSON access keeps optional intake fields compatible with older rows.
create function public.ticket_recovery_snapshot(p_kind text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; t jsonb; s jsonb; fields jsonb:='{}'; recipient text; phone text; number text;
  has_consent boolean:=false; paid boolean:=false; reason text; related uuid[]; sessions jsonb;
  source_at timestamptz; legacy_at timestamptz; mode text; submission_id uuid; opts boolean:=false;
  contact_ok boolean:=false; ambiguous boolean:=false;
begin
  if p_kind='draft' then
    select to_jsonb(x) into d from ticket_intake_drafts x where id=p_id;
    if d is null then return jsonb_build_object('eligible',false,'reason','source_missing'); end if;
    if d->>'deleted_at' is not null or d->>'status' not in ('active','converted') or (d->>'expires_at')::timestamptz<=now()
      then reason:='intake_closed'; end if;
    if d->>'staff_follow_up_status'<>'open' then reason:='staff_followed_up'; end if;
    if nullif(d->>'pending_ticket_document_path','') is not null then reason:='upload_in_progress'; end if;
    fields:=coalesce(d->'draft_data','{}'); s:=d; source_at:=(d->>'ticket_uploaded_at')::timestamptz;
    contact_ok:=d->>'contact_permission'='true' and d->>'contact_permission_recorded_at' is not null;
    opts:=fields->>'smsOptIn'='true';
    select sent_at into legacy_at from abandoned_ticket_emails where draft_id=p_id and status='sent';
    select to_jsonb(x) into t from ticket_submissions x where id=coalesce((d->>'converted_submission_id')::uuid,p_id);
  elsif p_kind='submission' then
    select to_jsonb(x) into t from ticket_submissions x where id=p_id;
    source_at:=(t->>'created_at')::timestamptz;
  else return jsonb_build_object('eligible',false,'reason','source_invalid'); end if;
  if t is not null then
    s:=t; fields:='{}'; submission_id:=(t->>'id')::uuid;
    opts:=t->>'sms_opt_in'='true'; contact_ok:=true;
    if t->>'deleted_at' is not null or t->>'service_type'<>'representation'
      or t->>'status' not in ('awaiting_payment','pending','in_progress') or nullif(t->>'case_outcome','') is not null then reason:='case_closed'; end if;
    if t->>'intake_mode'='photo_only' and t->>'intake_review_status' not in ('ready','complete') then reason:=coalesce(reason,'ticket_review_required'); end if;
  end if;
  if s is null then return jsonb_build_object('eligible',false,'reason','source_missing'); end if;
  recipient:=lower(trim(coalesce(s->>'email','')));
  phone:=regexp_replace(coalesce(s->>'phone',''),'[^0-9]','','g');
  if length(phone)=10 then phone:='1'||phone; end if;
  phone:=case when phone ~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$' then '+'||phone else '' end;
  number:=trim(coalesce(fields->>'ticketNumber',s->>'ticket_number',''));
  select max(a.sent_at) into legacy_at from abandoned_ticket_emails a join ticket_intake_drafts prior on prior.id=a.draft_id
    where a.status='sent' and (prior.id=p_id or (recipient<>'' and lower(trim(prior.email))=recipient
      and regexp_replace(upper(prior.draft_data->>'ticketNumber'),'[^A-Z0-9]','','g')=regexp_replace(upper(number),'[^A-Z0-9]','','g')));
  if number !~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,49}$' or number !~ '[0-9]' then reason:='ticket_number_required'; end if;
  if source_at is null or nullif(s->>'ticket_document_path','') is null then reason:=coalesce(reason,'upload_required'); end if;
  if nullif(s->>'ticket_document_path','') is not null and not exists(
    select 1 from storage.objects where name=s->>'ticket_document_path' and bucket_id in ('assessment-tickets','ticket-documents','ticket-images'))
    then reason:=coalesce(reason,'upload_not_verified'); end if;
  if not coalesce(contact_ok,false) then reason:=coalesce(reason,'contact_permission_required'); end if;
  -- Match restarts by email + real ticket. A phone-only source still checks its own case.
  select coalesce(array_agg(x.id),'{}') into related from ticket_submissions x where x.id=submission_id or
    (recipient<>'' and lower(trim(x.email))=recipient and regexp_replace(upper(x.ticket_number),'[^A-Z0-9]','','g')=regexp_replace(upper(number),'[^A-Z0-9]','','g'));
  select exists(select 1 from ticket_submissions x where x.id=any(related) and x.representation_paid_at is not null)
    or exists(select 1 from idr_checkout_intents i where i.ticket_submission_id=any(related) and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and i.status='paid') into paid;
  select exists(select 1 from ticket_submissions x where x.id=any(related) and nullif(x.consent_form_path,'') is not null)
    or exists(select 1 from representation_consent_invites i where i.ticket_submission_id=any(related) and i.signed_at is not null and i.revoked_at is null and i.pdf_path is not null) into has_consent;
  -- A completed universal checkout may still await staff matching. Hold ambiguous matches rather than requesting a second payment.
  select exists(select 1 from service_orders o where o.email=recipient and o.product<>'insurance_report' and o.ticket_submission_id is null
    and (o.ticket_number is null or upper(o.ticket_number)=upper(number)) and (o.payment_status in ('paid','refunded','disputed') or o.consent_form_path is not null)) into ambiguous;
  if ambiguous then reason:=coalesce(reason,'service_order_matching_required'); end if;
  paid:=paid or exists(select 1 from service_orders o where o.ticket_submission_id=any(related) and o.payment_status='paid');
  has_consent:=has_consent or exists(select 1 from service_orders o where o.ticket_submission_id=any(related) and o.consent_form_path is not null);
  if exists(select 1 from ticket_submissions x where x.id=any(related) and (to_jsonb(x)->>'referral_refunded_at' is not null or to_jsonb(x)->>'referral_disputed_at' is not null))
    or exists(select 1 from service_orders o where o.ticket_submission_id=any(related) and o.payment_status in ('refunded','disputed')) then reason:='payment_review_required'; end if;
  if t->>'status' in ('pending','in_progress') and not paid then reason:=coalesce(reason,'payment_status_review_required'); end if;
  if recipient in ('hello@fabsy.ca','brett@execom.ca','brettbilon@gmail.com') then reason:=coalesce(reason,'internal_contact_review'); end if;
  if paid and has_consent then reason:='complete'; end if;
  select coalesce(jsonb_agg(distinct session_id),'[]') into sessions from (
    select stripe_checkout_session_id session_id from idr_checkout_intents where ticket_submission_id=any(related) and checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
    union select representation_checkout_session_id from ticket_submissions where id=any(related)
    union select stripe_session_id from service_orders where ticket_submission_id=any(related)
  ) q where session_id is not null;
  mode:=case when paid then 'consent' when has_consent then 'payment' else 'checkout' end;
  return jsonb_build_object('eligible',reason is null,'reason',reason,'email',recipient,'phone',phone,'sms_opt_in',coalesce(opts,false),
    'can_email',coalesce(contact_ok,false) and recipient ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$',
    'first_name',coalesce(fields->>'firstName',s->>'first_name',''),'ticket_number',number,'paid',paid,'has_consent',has_consent,
    'mode',mode,'uploaded_at',source_at,'legacy_sent_at',legacy_at,'session_ids',sessions,'preferred_locale',coalesce(s->>'preferred_locale','en'));
end $$;

create function public.ticket_recovery_sources() returns table(source_kind text,source_id uuid,uploaded_at timestamptz)
language sql security definer set search_path=public,pg_temp as $$
  select 'draft',d.id,d.ticket_uploaded_at from ticket_intake_drafts d,ticket_recovery_settings cfg
    where cfg.singleton and d.ticket_uploaded_at>=coalesce(cfg.enrollment_since,now()-interval '14 days') and d.deleted_at is null
  union all
  select 'submission',t.id,t.created_at from ticket_submissions t,ticket_recovery_settings cfg
    where cfg.singleton and t.created_at>=coalesce(cfg.enrollment_since,now()-interval '14 days') and t.deleted_at is null
      and t.service_type='representation' and t.ticket_document_path is not null
      and not exists(select 1 from ticket_intake_drafts d where d.id=t.id or d.converted_submission_id=t.id);
$$;

create function public.enqueue_ticket_recovery() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg ticket_recovery_settings; source record; event_row record; snapshot jsonb; anchor timestamptz; due timestamptz; stage_no integer; hours integer; channel_name text; n integer:=0;
begin
  select * into cfg from ticket_recovery_settings where singleton;
  if not cfg.enabled then return 0; end if;
  update ticket_recovery_events set status='suppressed',reason='reminder_window_elapsed'
    where status in ('pending','held') and created_at<now()-interval '30 days';
  for source in select * from ticket_recovery_sources() where uploaded_at>now()-interval '30 days' loop
    snapshot:=ticket_recovery_snapshot(source.source_kind,source.source_id);
    if snapshot->>'reason' in ('complete','case_closed','intake_closed','staff_followed_up') then
      update ticket_recovery_events set status='suppressed',reason=snapshot->>'reason'
        where source_kind=source.source_kind and source_id=source.source_id and status in ('pending','held');
      continue;
    end if;
    anchor:=greatest(source.uploaded_at,cfg.activated_at-interval '24 hours');
    for stage_no in 1..cardinality(cfg.cadence_hours) loop
      hours:=cfg.cadence_hours[stage_no];
      due:=anchor+make_interval(hours=>hours);
      if snapshot->>'legacy_sent_at' is not null and stage_no>=2 then
        due:=greatest(source.uploaded_at+make_interval(hours=>hours),
          (snapshot->>'legacy_sent_at')::timestamptz+make_interval(hours=>hours-24),
          cfg.activated_at+make_interval(hours=>hours-72));
      end if;
      foreach channel_name in array array['email','sms'] loop
        insert into ticket_recovery_events(source_kind,source_id,channel,stage,due_at,status,reason,sent_at)
        values(source.source_kind,source.source_id,channel_name,stage_no,case when channel_name='email' then due else anchor+make_interval(hours=>hours) end,
          case when channel_name='email' and stage_no=1 and snapshot->>'legacy_sent_at' is not null then 'historical' else 'pending' end,
          case when channel_name='email' and stage_no=1 and snapshot->>'legacy_sent_at' is not null then 'previous_reminder' end,
          case when channel_name='email' and stage_no=1 then (snapshot->>'legacy_sent_at')::timestamptz end)
        on conflict(source_kind,source_id,channel,stage) do nothing;
        n:=n+1;
      end loop;
    end loop;
  end loop;
  -- Recheck safe, never-attempted holds when staff fix a record or a customer opts in.
  for event_row in select * from ticket_recovery_events where status='held' and attempted_at is null
    and reason in ('ticket_number_required','ticket_review_required','email_unavailable','sms_opt_in_required','phone_unavailable',
      'upload_required','upload_not_verified','upload_in_progress','contact_permission_required','payment_check_unavailable','preflight_unavailable','source_changed',
      'service_order_matching_required','payment_status_review_required','stripe_payment_reconciliation_required') loop
    snapshot:=ticket_recovery_snapshot(event_row.source_kind,event_row.source_id);
    if snapshot->>'reason' in ('complete','case_closed','intake_closed','staff_followed_up') then
      update ticket_recovery_events set status='suppressed',reason=snapshot->>'reason' where id=event_row.id;
    elsif snapshot->>'eligible'='true' and
      ((event_row.channel='email' and snapshot->>'can_email'='true') or
       (event_row.channel='sms' and snapshot->>'sms_opt_in'='true' and nullif(snapshot->>'phone','') is not null)) then
      update ticket_recovery_events set status='pending',reason=null,claim_id=null,claim_expires_at=null where id=event_row.id;
    end if;
  end loop;
  return n;
end $$;

create function public.claim_ticket_recovery() returns setof public.ticket_recovery_events
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from ticket_recovery_settings where singleton and enabled) then return; end if;
  if extract(hour from now() at time zone 'America/Edmonton') not between 9 and 17 then return; end if;
  update ticket_recovery_events set status='uncertain',reason='attempt_interrupted' where status='attempting' and claim_expires_at<now();
  update ticket_recovery_events set status='pending',claim_id=null,claim_expires_at=null where status='claimed' and claim_expires_at<now();
  return query with candidate as (
    select e.id from ticket_recovery_events e where e.status='pending' and e.due_at<=now()
      and not exists(select 1 from ticket_recovery_events prior where prior.source_kind=e.source_kind and prior.source_id=e.source_id
        and prior.channel=e.channel and prior.stage<e.stage and (prior.status in ('pending','claimed','attempting','uncertain','failed','held')
          or coalesce(prior.sent_at,prior.attempted_at)>now()-interval '48 hours'))
    order by e.due_at,e.stage,e.id limit 1 for update skip locked
  ) update ticket_recovery_events e set status='claimed',claim_id=gen_random_uuid(),claim_expires_at=now()+interval '5 minutes'
    from candidate c where e.id=c.id returning e.*;
end $$;

-- Compare the complete current snapshot at the last boundary before dispatch.
create function public.begin_ticket_recovery_attempt(p_id uuid,p_claim uuid,p_snapshot jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare e ticket_recovery_events; latest jsonb; destination text; key text;
begin
  select * into e from ticket_recovery_events where id=p_id and claim_id=p_claim and status='claimed' and claim_expires_at>now() for update;
  if e.id is null or not exists(select 1 from ticket_recovery_settings where singleton and enabled) then return false; end if;
  latest:=ticket_recovery_snapshot(e.source_kind,e.source_id);
  if latest is distinct from p_snapshot or latest->>'eligible'<>'true' then return false; end if;
  destination:=latest->>case e.channel when 'sms' then 'phone' else 'email' end;
  if (e.channel='sms' and (latest->>'sms_opt_in'<>'true' or destination='')) or (e.channel='email' and latest->>'can_email'<>'true') then return false; end if;
  if exists(select 1 from ticket_recovery_suppressions where channel=e.channel and recipient=destination) then return false; end if;
  key:=encode(extensions.digest(e.channel||':'||destination||':'||regexp_replace(upper(latest->>'ticket_number'),'[^A-Z0-9]','','g')||':'||e.stage,'sha256'),'hex');
  if exists(select 1 from ticket_recovery_events where delivery_key=key and id<>e.id) then
    update ticket_recovery_events set status='suppressed',reason='duplicate_recipient_ticket' where id=e.id; return false;
  end if;
  update ticket_recovery_events set status='attempting',attempted_at=now(),delivery_key=key,recipient=destination,
    ticket_number=latest->>'ticket_number',completion_mode=latest->>'mode' where id=e.id;
  return true;
exception when unique_violation then return false;
end $$;

create function public.finish_ticket_recovery(p_id uuid,p_claim uuid,p_status text,p_reason text default null,p_provider text default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if p_status not in ('held','suppressed','sent','failed','uncertain') or (p_status='sent' and nullif(p_provider,'') is null) then raise exception 'RECOVERY_OUTCOME_INVALID'; end if;
  update ticket_recovery_events set status=p_status,reason=p_reason,provider_id=p_provider,
    sent_at=case when p_status='sent' then now() end,claim_expires_at=null
    where id=p_id and claim_id=p_claim and ((status='claimed' and p_status in ('held','suppressed')) or (status='attempting' and p_status in ('sent','failed','uncertain')));
  get diagnostics n=row_count; return n=1;
end $$;

create function public.configure_ticket_recovery(p_enabled boolean,p_address text,p_cadence integer[] default array[24,72,168]) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_enabled and exists(select 1 from abandoned_ticket_emails where status='sending' and claim_expires_at>now()) then raise exception 'LEGACY_DELIVERY_IN_PROGRESS'; end if;
  update ticket_recovery_settings set enabled=p_enabled,mailing_address=p_address,cadence_hours=p_cadence,
    activated_at=coalesce(activated_at,now()),enrollment_since=coalesce(enrollment_since,now()-interval '14 days') where singleton;
  if p_enabled then update abandoned_ticket_email_settings set enabled=false where singleton; end if;
end $$;

alter table ticket_recovery_settings enable row level security;
alter table ticket_recovery_events enable row level security;
alter table ticket_recovery_suppressions enable row level security;
revoke all on ticket_recovery_settings,ticket_recovery_events,ticket_recovery_suppressions from public,anon,authenticated;
grant all on ticket_recovery_settings,ticket_recovery_events,ticket_recovery_suppressions to service_role;
grant select on ticket_recovery_settings,ticket_recovery_events to authenticated;
create policy "Staff read recovery settings" on ticket_recovery_settings for select to authenticated using(is_idr_staff());
create policy "Staff read recovery events" on ticket_recovery_events for select to authenticated using(is_idr_staff());
do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in (
    'ticket_recovery_snapshot','ticket_recovery_sources','enqueue_ticket_recovery','claim_ticket_recovery',
    'begin_ticket_recovery_attempt','finish_ticket_recovery','configure_ticket_recovery') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
    perform cron.schedule('fabsy-ticket-recovery','*/15 * * * *',$job$
      select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='idr_project_url')||'/functions/v1/process-ticket-recovery',
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
        body:='{}'::jsonb,timeout_milliseconds:=150000);
    $job$);
  end if;
end $$;
commit;
