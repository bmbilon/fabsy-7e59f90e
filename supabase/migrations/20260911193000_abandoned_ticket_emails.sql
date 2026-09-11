begin;

-- Disabled on installation. Activation is explicit and never backfills old uploads.
create table public.abandoned_ticket_email_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  activated_at timestamptz,
  check (not enabled or activated_at is not null)
);
insert into public.abandoned_ticket_email_settings (singleton) values (true);

create table public.abandoned_ticket_emails (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.ticket_intake_drafts(id) on delete cascade,
  uploaded_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','sending','retry','sent','failed','suppressed','indeterminate')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null,
  claim_id uuid,
  claim_expires_at timestamptz,
  email_payload jsonb,
  delivery_key text unique,
  provider_email_id text,
  sent_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (due_at = uploaded_at + interval '30 minutes'),
  check (status <> 'sending' or (claim_id is not null and claim_expires_at is not null)),
  check (status <> 'sent' or (provider_email_id is not null and sent_at is not null))
);
create index abandoned_ticket_emails_pending_idx on public.abandoned_ticket_emails (next_attempt_at, id)
  where status in ('pending','retry','sending');
alter table public.abandoned_ticket_email_settings enable row level security;
alter table public.abandoned_ticket_email_settings force row level security;
alter table public.abandoned_ticket_emails enable row level security;
alter table public.abandoned_ticket_emails force row level security;
revoke all on public.abandoned_ticket_email_settings, public.abandoned_ticket_emails from public, anon, authenticated;
grant select, update on public.abandoned_ticket_email_settings to service_role;
grant select, insert, update, delete on public.abandoned_ticket_emails to service_role;

create function public.queue_abandoned_ticket_email()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare activation timestamptz;
begin
  if new.ticket_uploaded_at is null or
     (tg_op = 'UPDATE' and old.ticket_uploaded_at is not null) then return new; end if;
  select activated_at into activation from public.abandoned_ticket_email_settings where singleton and enabled;
  if activation is null or new.ticket_uploaded_at < activation or new.deleted_at is not null then return new; end if;
  insert into public.abandoned_ticket_emails (draft_id,uploaded_at,due_at,next_attempt_at)
    values (new.id,new.ticket_uploaded_at,new.ticket_uploaded_at + interval '30 minutes',new.ticket_uploaded_at + interval '30 minutes')
    on conflict (draft_id) do nothing;
  return new;
end $$;
create trigger queue_abandoned_ticket_email
  after insert or update of ticket_uploaded_at on public.ticket_intake_drafts
  for each row execute function public.queue_abandoned_ticket_email();

create function public.claim_abandoned_ticket_emails(p_limit integer default 1)
returns setof public.abandoned_ticket_emails
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then raise exception 'ABANDONED_TICKET_EMAIL_LIMIT_INVALID'; end if;
  if not exists (select 1 from public.abandoned_ticket_email_settings where singleton and enabled) then return; end if;
  update public.abandoned_ticket_emails
    set status='indeterminate',failure_code='idempotency_window_elapsed',claim_id=null,claim_expires_at=null
    where status in ('retry','sending') and first_attempt_at <= clock_timestamp() - interval '23 hours'
      and (status <> 'sending' or claim_expires_at <= clock_timestamp());
  update public.abandoned_ticket_emails a
    set status='suppressed',failure_code='intake_unavailable',claim_id=null,claim_expires_at=null
    from public.ticket_intake_drafts d where d.id=a.draft_id
      and a.status in ('pending','retry','sending') and (a.status <> 'sending' or a.claim_expires_at <= clock_timestamp())
      and (d.deleted_at is not null or d.expires_at <= clock_timestamp() or d.status='expired');
  return query with candidates as (
    select id from public.abandoned_ticket_emails
    where due_at <= clock_timestamp() and
      ((status in ('pending','retry') and next_attempt_at <= clock_timestamp()) or
       (status='sending' and claim_expires_at <= clock_timestamp()))
      and (first_attempt_at is null or first_attempt_at > clock_timestamp() - interval '23 hours')
    order by due_at,id limit p_limit for update skip locked
  ) update public.abandoned_ticket_emails a
    set status='sending',claim_id=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '3 minutes',
      first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempt_count=attempt_count+1,failure_code=null
    from candidates c where a.id=c.id returning a.*;
end $$;

create function public.get_abandoned_ticket_email_context(p_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  job public.abandoned_ticket_emails%rowtype;
  draft public.ticket_intake_drafts%rowtype;
  submission public.ticket_submissions%rowtype;
  recipient text;
  number_key text;
  delivery_key_value text;
  related_ids uuid[];
  sessions jsonb;
  reason text;
begin
  select * into job from public.abandoned_ticket_emails where id=p_id and claim_id=p_claim_id
    and status='sending' and claim_expires_at > clock_timestamp();
  if not found then raise exception 'ABANDONED_TICKET_EMAIL_CLAIM_LOST'; end if;
  select * into draft from public.ticket_intake_drafts where id=job.draft_id;
  select * into submission from public.ticket_submissions where id=coalesce(draft.converted_submission_id,draft.id);
  recipient:=lower(btrim(draft.email));
  number_key:=regexp_replace(upper(coalesce(nullif(btrim(draft.draft_data->>'ticketNumber'),''),submission.ticket_number,'')),'[^A-Z0-9]','','g');
  if not exists(select 1 from public.abandoned_ticket_email_settings where singleton and enabled) then reason:='disabled';
  elsif draft.id is null or draft.deleted_at is not null or draft.status not in ('active','converted') or draft.expires_at <= clock_timestamp() then reason:='intake_unavailable';
  elsif draft.ticket_uploaded_at is null or job.due_at > clock_timestamp() then reason:='upload_not_due';
  elsif not draft.contact_permission or not draft.alberta_confirmed then reason:='contact_not_permitted';
  elsif draft.staff_follow_up_status <> 'open' then reason:='staff_followed_up';
  elsif recipient is null or length(recipient) > 255 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then reason:='email_unavailable';
  elsif job.email_payload is not null and job.email_payload->'to'->>0 is distinct from recipient then reason:='recipient_changed';
  elsif job.first_attempt_at <= clock_timestamp()-interval '23 hours' then reason:='idempotency_window_elapsed';
  end if;
  if reason is not null then return jsonb_build_object('eligible',false,'reason',reason,'retryable',reason='disabled'); end if;

  -- A converted draft is still abandoned until its representation checkout is paid.
  -- Match restarts by recipient and ticket number. When the number is missing,
  -- conservatively check same-email unfinished or recent representation purchases.
  select array_agg(t.id) into related_ids from public.ticket_submissions t
    where t.id=coalesce(draft.converted_submission_id,draft.id) or
      (t.service_type='representation' and lower(btrim(t.email))=recipient and
       ((number_key<>'' and regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g')=number_key) or
        (number_key='' and (t.created_at>=job.uploaded_at or t.status='awaiting_payment' or
          t.representation_paid_at>=job.uploaded_at or exists(
            select 1 from public.idr_checkout_intents paid_intent where paid_intent.ticket_submission_id=t.id
              and paid_intent.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
              and paid_intent.status='paid' and paid_intent.updated_at>=job.uploaded_at)))));
  if draft.status='converted' and not exists(select 1 from public.ticket_submissions t
      where t.id=draft.converted_submission_id and t.status='awaiting_payment' and t.deleted_at is null) then
    return jsonb_build_object('eligible',false,'reason','submission_unavailable','retryable',false);
  end if;
  if exists(select 1 from public.ticket_submissions t where t.id=any(related_ids) and
      (t.representation_paid_at is not null or t.status <> 'awaiting_payment')) or
    exists(select 1 from public.idr_checkout_intents i where i.ticket_submission_id=any(related_ids)
      and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and i.status='paid') then
    return jsonb_build_object('eligible',false,'reason','already_paid_or_active','retryable',false);
  end if;
  if exists(select 1 from public.idr_checkout_intents i where i.ticket_submission_id=any(related_ids)
    and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and i.status in ('creating','open')
    and i.stripe_checkout_session_id is null) then
    return jsonb_build_object('eligible',false,'reason','checkout_creating','retryable',true);
  end if;
  delivery_key_value:=encode(sha256(convert_to(recipient||':'||case when number_key<>'' then number_key else draft.id::text end,'UTF8')),'hex');
  if job.delivery_key is not null and job.delivery_key<>delivery_key_value then
    return jsonb_build_object('eligible',false,'reason','ticket_identity_changed','retryable',false);
  end if;
  if exists(select 1 from public.abandoned_ticket_emails a where a.id<>job.id and a.delivery_key=delivery_key_value) then
    return jsonb_build_object('eligible',false,'reason','duplicate_ticket','retryable',false);
  end if;
  select coalesce(jsonb_agg(distinct checkout.session_id),'[]'::jsonb) into sessions from (
    select i.stripe_checkout_session_id as session_id from public.idr_checkout_intents i
      where i.ticket_submission_id=any(related_ids) and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')
    union select t.representation_checkout_session_id from public.ticket_submissions t where t.id=any(related_ids)
  ) checkout where checkout.session_id is not null;
  return jsonb_build_object('eligible',true,'email',recipient,'firstName',coalesce(nullif(btrim(draft.draft_data->>'firstName'),''),submission.first_name,''),
    'ticketType',coalesce(nullif(btrim(draft.draft_data->>'violation'),''),nullif(btrim(draft.draft_data->>'offenceDescription'),''),nullif(submission.violation,''),
      case when coalesce(draft.draft_data->>'ticketType',submission.ticket_type)='photo_radar' then 'Photo Radar' else '' end),
    'ticketNumber',coalesce(nullif(btrim(draft.draft_data->>'ticketNumber'),''),submission.ticket_number,''),'checkoutSessionIds',sessions,
    'deliveryKey',delivery_key_value,'retryable',false);
end $$;

create function public.freeze_abandoned_ticket_email(p_id uuid,p_claim_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare context jsonb; frozen jsonb;
begin
  perform 1 from public.abandoned_ticket_emails where id=p_id and claim_id=p_claim_id and status='sending'
    and claim_expires_at>clock_timestamp() for update;
  if not found then raise exception 'ABANDONED_TICKET_EMAIL_CLAIM_LOST'; end if;
  context:=public.get_abandoned_ticket_email_context(p_id,p_claim_id);
  if context->>'eligible' <> 'true' then raise exception 'ABANDONED_TICKET_EMAIL_INELIGIBLE'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'to') is distinct from 'array' or
     jsonb_array_length(p_payload->'to')<>1 or p_payload->'to'->>0 is distinct from context->>'email' or
     coalesce(p_payload->>'html','')='' or coalesce(p_payload->>'subject','')='' then
    raise exception 'ABANDONED_TICKET_EMAIL_PAYLOAD_INVALID';
  end if;
  update public.abandoned_ticket_emails set email_payload=coalesce(email_payload,p_payload),delivery_key=context->>'deliveryKey'
    where id=p_id and claim_id=p_claim_id returning email_payload into frozen;
  return frozen;
end $$;

create function public.finish_abandoned_ticket_email(p_id uuid,p_claim_id uuid,p_status text,
  p_provider_email_id text default null,p_failure_code text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if p_status not in ('sent','retry','failed','suppressed') or
    (p_status='sent' and (coalesce(p_provider_email_id,'')='' or p_failure_code is not null)) or
    (p_status<>'sent' and coalesce(p_failure_code,'') !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'ABANDONED_TICKET_EMAIL_OUTCOME_INVALID';
  end if;
  update public.abandoned_ticket_emails set status=p_status,provider_email_id=p_provider_email_id,
    sent_at=case when p_status='sent' then clock_timestamp() else null end,failure_code=p_failure_code,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(attempt_count,7)))::integer),
    claim_id=null,claim_expires_at=null
    where id=p_id and claim_id=p_claim_id and status='sending' and claim_expires_at>clock_timestamp();
  get diagnostics affected=row_count;
  return affected=1;
end $$;

revoke all on function public.queue_abandoned_ticket_email() from public,anon,authenticated;
revoke all on function public.claim_abandoned_ticket_emails(integer) from public,anon,authenticated;
revoke all on function public.get_abandoned_ticket_email_context(uuid,uuid) from public,anon,authenticated;
revoke all on function public.freeze_abandoned_ticket_email(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_abandoned_ticket_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_abandoned_ticket_emails(integer) to service_role;
grant execute on function public.get_abandoned_ticket_email_context(uuid,uuid) to service_role;
grant execute on function public.freeze_abandoned_ticket_email(uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_abandoned_ticket_email(uuid,uuid,text,text,text) to service_role;
comment on table public.abandoned_ticket_emails is
  'Private one-time unpaid-ticket follow-up outbox; only first uploads after activation. Frozen payload expires with its intake.';

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_namespace where nspname='vault') then
    if exists(select 1 from vault.secrets where name='idr_project_url') and exists(select 1 from vault.secrets where name='idr_cron_secret') then
      perform cron.schedule('fabsy-abandoned-ticket-emails','* * * * *',$job$
        select net.http_post(
          url:=(select decrypted_secret from vault.decrypted_secrets where name='idr_project_url')||'/functions/v1/process-abandoned-ticket-emails',
          headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
          body:='{}'::jsonb,timeout_milliseconds:=150000);
      $job$);
    end if;
  end if;
end $$;
commit;
