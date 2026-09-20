begin;

create table public.consent_welcome_state (
  id boolean primary key default true check(id),
  activated_at timestamptz not null default clock_timestamp(),
  last_worker_at timestamptz, last_worker_error text
);
insert into public.consent_welcome_state(id) values(true);
create table public.consent_welcome_notifications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check(source_type in ('submission','invite')),
  submission_id uuid, invite_id uuid,
  consent_form_path text not null unique check(length(consent_form_path) between 1 and 1000),
  status text not null default 'pending' check(status in ('pending','preparing','sending','sent','failed','indeterminate')),
  created_at timestamptz not null default clock_timestamp(),
  next_attempt_at timestamptz not null default clock_timestamp(),
  preparation_attempts integer not null default 0,
  claim_id uuid, claim_expires_at timestamptz, attempted_at timestamptz,
  prepared_recipient text, prepared_source_fingerprint text, prepared_payload_sha256 text,
  prepared_attachment_fingerprints jsonb,
  provider_id text, sent_at timestamptz, failure_code text,
  check(source_type<>'submission' or submission_id is not null),
  check(source_type<>'invite' or invite_id is not null),
  check(failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  check(status not in ('preparing','sending') or (claim_id is not null and claim_expires_at is not null)),
  check(status<>'sending' or attempted_at is not null),
  check(status<>'sent' or (provider_id is not null and sent_at is not null))
);
create index consent_welcome_due on public.consent_welcome_notifications(next_attempt_at,id)
  where status in ('pending','preparing','sending');
create index consent_welcome_submission on public.consent_welcome_notifications(submission_id);
alter table public.consent_welcome_state enable row level security;
alter table public.consent_welcome_notifications enable row level security;
alter table public.consent_welcome_notifications force row level security;
revoke all on public.consent_welcome_state,public.consent_welcome_notifications from public,anon,authenticated,service_role;
grant select on public.consent_welcome_state,public.consent_welcome_notifications to authenticated,service_role;
create policy staff_read_consent_welcome_state on public.consent_welcome_state for select to authenticated using(public.is_idr_staff());
create policy staff_read_consent_welcome on public.consent_welcome_notifications for select to authenticated using(public.is_idr_staff());

-- This ownership decision shares the legacy dispatch claim's advisory fence.
-- A legacy dispatch may already have delivered its client email even when its
-- combined email/SMS outcome is indeterminate; never send it again automatically.
alter table public.ticket_submission_notification_dispatches add column client_email_owner text not null default 'legacy'
  check(client_email_owner in ('legacy','consent_welcome'));
create function public.enqueue_consent_welcome(p_source_type text,p_submission_id uuid,p_invite_id uuid,p_path text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare blocked boolean:=false;
begin
  if nullif(p_path,'') is null then return; end if;
  if p_submission_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_submission_id::text,731904223));
    select exists(select 1 from public.ticket_submission_notification_dispatches
      where submission_id=p_submission_id and client_email_owner='legacy'
        and status in ('sending','sent','indeterminate')) into blocked;
  end if;
  insert into public.consent_welcome_notifications(source_type,submission_id,invite_id,consent_form_path,status,failure_code)
    values(p_source_type,p_submission_id,p_invite_id,p_path,case when blocked then 'failed' else 'pending' end,
      case when blocked then 'legacy_delivery_exists' end)
    on conflict(consent_form_path) do update set source_type='invite',invite_id=excluded.invite_id
      where excluded.source_type='invite' and consent_welcome_notifications.source_type='submission'
        and consent_welcome_notifications.submission_id is not distinct from excluded.submission_id
        and consent_welcome_notifications.status in ('pending','preparing') and consent_welcome_notifications.attempted_at is null;
end $$;
revoke all on function public.enqueue_consent_welcome(text,uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.queue_submission_consent_welcome() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare linked_invite uuid;
begin
  if new.service_type<>'representation' or nullif(new.consent_form_path,'') is null
    or (tg_op='UPDATE' and new.consent_form_path is not distinct from old.consent_form_path) then return new; end if;
  -- A linked invite mirrored into the case still represents one canonical PDF.
  select id into linked_invite from public.representation_consent_invites
    where ticket_submission_id=new.id and pdf_path=new.consent_form_path and status='completed';
  perform public.enqueue_consent_welcome(case when linked_invite is null then 'submission' else 'invite' end,
    new.id,linked_invite,new.consent_form_path);
  return new;
end $$;
create trigger queue_submission_consent_welcome after insert or update of consent_form_path on public.ticket_submissions
  for each row execute function public.queue_submission_consent_welcome();
create function public.queue_invite_consent_welcome() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='completed' and new.pdf_path is not null
    and (tg_op='INSERT' or old.status is distinct from 'completed') then
    perform public.enqueue_consent_welcome('invite',new.ticket_submission_id,new.id,new.pdf_path);
  end if;
  return new;
end $$;
create trigger queue_invite_consent_welcome after insert or update of status on public.representation_consent_invites
  for each row execute function public.queue_invite_consent_welcome();
revoke all on function public.queue_submission_consent_welcome(),public.queue_invite_consent_welcome() from public,anon,authenticated,service_role;

create or replace function public.claim_ticket_submission_notification(p_submission_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer; current_dispatch public.ticket_submission_notification_dispatches%rowtype; owner text;
begin
  if p_submission_id is null or p_claim_id is null then raise exception 'TICKET_NOTIFICATION_CLAIM_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_submission_id::text,731904223));
  if not exists(select 1 from public.ticket_submissions where id=p_submission_id
    and service_type='representation' and status='awaiting_payment') then
    raise exception 'TICKET_NOTIFICATION_SUBMISSION_NOT_ELIGIBLE' using errcode='P0002'; end if;
  owner:=case when exists(select 1 from public.consent_welcome_notifications where submission_id=p_submission_id)
    then 'consent_welcome' else 'legacy' end;
  insert into public.ticket_submission_notification_dispatches(submission_id,claim_id,status,started_at,client_email_owner)
    values(p_submission_id,p_claim_id,'sending',clock_timestamp(),owner) on conflict(submission_id) do nothing;
  get diagnostics changed=row_count;
  if changed=1 then return jsonb_build_object('acquired',true,'status','sending','clientEmailOwner',owner); end if;
  update public.ticket_submission_notification_dispatches set status='indeterminate',completed_at=clock_timestamp(),failure_code='dispatch_timeout_manual_review'
    where submission_id=p_submission_id and status='sending' and started_at<=clock_timestamp()-interval '15 minutes';
  update public.ticket_submission_notification_dispatches set claim_id=p_claim_id,status='sending',started_at=clock_timestamp(),
    completed_at=null,failure_code=null,client_email_owner=owner where submission_id=p_submission_id and status='failed_before_delivery';
  get diagnostics changed=row_count;
  if changed=1 then return jsonb_build_object('acquired',true,'status','sending','clientEmailOwner',owner); end if;
  select * into current_dispatch from public.ticket_submission_notification_dispatches where submission_id=p_submission_id;
  return jsonb_build_object('acquired',false,'status',coalesce(current_dispatch.status,'indeterminate'),
    'failureCode',current_dispatch.failure_code,'manualReviewRequired',coalesce(current_dispatch.status,'indeterminate')='indeterminate',
    'clientEmailOwner',coalesce(current_dispatch.client_email_owner,owner));
end $$;

-- No historical scan or backfill: only future source completion events enqueue.
-- Missing contact/upload data remains pending until a later worker can verify it.
create function public.consent_welcome_source_context(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  job public.consent_welcome_notifications%rowtype; ticket public.ticket_submissions%rowtype;
  invite public.representation_consent_invites%rowtype; client public.clients%rowtype;
  recipient text; first_name_value text; last_name_value text; number_value text; locale text:='en';
  reason text; result jsonb; sessions jsonb:='[]'; payment_link jsonb; paid boolean:=false; payment_unknown boolean:=true;
  numbers text[]; candidate_number text;
  consent_hash text; signature text; completed timestamptz; ticket_owner uuid;
  consent_object jsonb; ticket_object jsonb; manual_object jsonb; manual_path text; manual_hash text;
begin
  select * into job from public.consent_welcome_notifications where id=p_id;
  if not found then return jsonb_build_object('eligible',false,'reason','source_unavailable','retryable',false); end if;
  if job.submission_id is not null then
    select * into ticket from public.ticket_submissions where id=job.submission_id;
    if not found or ticket.deleted_at is not null or ticket.service_type<>'representation' then reason:='submission_unavailable'; end if;
    select * into client from public.clients where id=ticket.client_id;
    ticket_owner:=coalesce(ticket.source_assessment_id,ticket.id);
    locale:=coalesce(to_jsonb(ticket)->>'preferred_locale','en');
    if ticket.id is not null then
      select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'client_id',i.client_id,'ticket_submission_id',i.ticket_submission_id,
        'checkout_kind',i.checkout_kind,'status',i.status,'stripe_checkout_session_id',i.stripe_checkout_session_id) order by i.id),'[]'::jsonb)
        into sessions from public.idr_checkout_intents i where i.ticket_submission_id=ticket.id
          and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar');
      paid:=ticket.representation_paid_at is not null or exists(select 1 from public.idr_checkout_intents i
        where i.ticket_submission_id=ticket.id and i.client_id=ticket.client_id and i.status='paid'
          and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar'));
      payment_unknown:=(not paid and ticket.status<>'awaiting_payment')
        or (not paid and to_jsonb(ticket)->>'referral_payment_intent_id' is not null)
        or to_jsonb(ticket)->>'referral_refunded_at' is not null or to_jsonb(ticket)->>'referral_disputed_at' is not null
        or exists(select 1 from public.referral_payment_holds h where h.payment_intent_id in
          (to_jsonb(ticket)->>'referral_payment_intent_id',to_jsonb(ticket)->>'representation_payment_intent_id')
          or exists(select 1 from public.idr_orders o where o.ticket_submission_id=ticket.id and o.stripe_payment_intent_id=h.payment_intent_id))
        or exists(select 1 from public.idr_checkout_intents i where i.ticket_submission_id=ticket.id
          and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and i.client_id is distinct from ticket.client_id);
      select jsonb_build_object('code',l.code,'expires_at',l.expires_at,'checkout_intent_id',i.id,'stripe_checkout_session_id',i.stripe_checkout_session_id)
        into payment_link from public.ticket_checkout_links l join public.idr_checkout_intents i on i.id=l.checkout_intent_id
        where l.submission_id=ticket.id and i.ticket_submission_id=ticket.id and i.client_id=ticket.client_id
          and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and i.status='open'
          and i.stripe_checkout_session_id is not null and l.expires_at>clock_timestamp()
        order by l.expires_at desc,l.code limit 1;
    end if;
  end if;
  if job.source_type='invite' then
    select * into invite from public.representation_consent_invites where id=job.invite_id;
    if not found or invite.status<>'completed' or invite.access_revoked_at is not null
      or invite.pdf_path is distinct from job.consent_form_path or invite.ticket_submission_id is distinct from job.submission_id then reason:='consent_source_changed'; end if;
    recipient:=lower(btrim(invite.client_email)); first_name_value:=to_jsonb(invite)->>'client_first_name'; last_name_value:=to_jsonb(invite)->>'client_last_name';
    if nullif(first_name_value,'') is null then first_name_value:=invite.client_legal_name; end if;
    number_value:=invite.ticket_number; consent_hash:=invite.pdf_sha256; signature:=invite.signature_method; completed:=invite.signed_at;
    if job.consent_form_path not like 'standalone/'||job.invite_id::text||'/%/signed-consent.pdf'
      or coalesce(consent_hash,'') !~ '^[0-9a-f]{64}$' then reason:='consent_document_invalid'; end if;
    if ticket.id is not null and (lower(btrim(client.email)) is distinct from recipient
      or regexp_replace(upper(ticket.ticket_number),'[^A-Z0-9]','','g') is distinct from regexp_replace(upper(number_value),'[^A-Z0-9]','','g')) then reason:='linked_identity_mismatch'; end if;
    if signature='manual_scan' then manual_path:=invite.manual_scan_pdf_path; manual_hash:=invite.manual_scan_pdf_sha256;
      if coalesce(manual_path,'') not like 'manual/'||job.invite_id::text||'/%/signed-scan.pdf'
        or coalesce(manual_hash,'') !~ '^[0-9a-f]{64}$' or position('..' in manual_path)>0 then reason:='manual_document_invalid'; end if;
    end if;
  else
    recipient:=lower(btrim(ticket.email)); first_name_value:=ticket.first_name; last_name_value:=ticket.last_name; number_value:=ticket.ticket_number;
    signature:=coalesce(ticket.intake_consent->>'method','typed'); completed:=(ticket.intake_consent->>'acceptedAt')::timestamptz;
    if ticket.consent_form_path is distinct from job.consent_form_path then reason:='consent_source_changed'; end if;
    if job.consent_form_path not like job.submission_id::text||'/%' then reason:='consent_document_invalid'; end if;
    if nullif(btrim(client.email),'') is not null and lower(btrim(client.email)) is distinct from recipient then reason:='linked_identity_mismatch'; end if;
  end if;
  if position('..' in job.consent_form_path)>0 then reason:='consent_document_invalid'; end if;
  if recipient is null or length(recipient)>320 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then reason:=coalesce(reason,'email_unavailable'); end if;
  numbers:=array_prepend(number_value,case when job.source_type='invite' then invite.ticket_numbers else array[]::text[] end);
  foreach candidate_number in array numbers loop
    if nullif(btrim(candidate_number),'') is null or candidate_number !~ '^[A-Za-z0-9 -]+$'
      or btrim(candidate_number) ~* '^(unknown|pending|unavailable|tbd|n/?a)(\y|[0-9_-])'
      or regexp_replace(upper(candidate_number),'[^A-Z0-9]','','g') !~ '^[A-Z0-9]{5,30}$'
      or candidate_number !~ '[0-9]' then reason:=coalesce(reason,'ticket_number_unavailable'); end if;
  end loop;
  select jsonb_build_object('id',o.id,'updated_at',o.updated_at,'metadata',o.metadata) into consent_object
    from storage.objects o where o.bucket_id='consent-forms' and o.name=job.consent_form_path;
  if consent_object is null then reason:=coalesce(reason,'consent_document_unavailable'); end if;
  if job.submission_id is not null then
    if nullif(ticket.ticket_document_path,'') is null then reason:=coalesce(reason,'ticket_document_unavailable');
    elsif ticket.ticket_document_path not like ticket_owner::text||'/%'
      or position('..' in ticket.ticket_document_path)>0 then reason:=coalesce(reason,'ticket_document_invalid'); end if;
    select jsonb_build_object('id',o.id,'updated_at',o.updated_at,'metadata',o.metadata) into ticket_object
      from storage.objects o where o.bucket_id='assessment-tickets' and o.name=ticket.ticket_document_path;
    if ticket_object is null then reason:=coalesce(reason,'ticket_document_unavailable'); end if;
  end if;
  if signature='manual_scan' then
    select jsonb_build_object('id',o.id,'updated_at',o.updated_at,'metadata',o.metadata) into manual_object
      from storage.objects o where o.bucket_id='representation-consent-scans' and o.name=manual_path;
    if manual_object is null then reason:=coalesce(reason,'manual_document_unavailable'); end if;
  end if;
  result:=jsonb_build_object('eligible',reason is null,'reason',reason,'retryable',reason is null or reason in
    ('email_unavailable','ticket_number_unavailable','ticket_document_unavailable','consent_document_unavailable','manual_document_unavailable'),
    'id',job.id,'source_type',job.source_type,
    'submission_id',job.submission_id,'invite_id',job.invite_id,'recipient',recipient,'first_name',first_name_value,'last_name',last_name_value,
    'preferred_locale',locale,'ticket_number',number_value,'ticket_numbers',to_jsonb(invite)->'ticket_numbers',
    'client_id',ticket.client_id,'ticket_document_path',ticket.ticket_document_path,'ticket_document_owner_id',ticket_owner,
    'ticket_document_bucket','assessment-tickets','ticket_upload_required',job.submission_id is not null,
    'consent_form_path',job.consent_form_path,'consent_bucket','consent-forms','consent_sha256',consent_hash,
    'signature_method',signature,'completed_at',completed,'manual_scan_pdf_path',manual_path,'manual_scan_pdf_sha256',manual_hash,
    'manual_scan_bucket','representation-consent-scans','manual_scan_review_status',to_jsonb(invite)->>'manual_scan_review_status',
    'representation_paid_at',ticket.representation_paid_at,'payment_recorded',paid,'payment_unknown',payment_unknown,
    'submission_status',ticket.status,'payment_not_started_verified',ticket.id is not null and ticket.status='awaiting_payment'
      and not paid and not payment_unknown and sessions='[]'::jsonb
      and to_jsonb(ticket)->>'representation_checkout_session_id' is null and to_jsonb(ticket)->>'representation_payment_intent_id' is null,
    'checkout_sessions',sessions,'representation_checkout_session_id',to_jsonb(ticket)->>'representation_checkout_session_id',
    'representation_payment_intent_id',to_jsonb(ticket)->>'representation_payment_intent_id',
    'payment_link',case when not paid and not payment_unknown then payment_link end,
    'consent_storage',consent_object,'ticket_storage',ticket_object,'manual_storage',manual_object);
  return result||jsonb_build_object('source_fingerprint',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end $$;
revoke all on function public.consent_welcome_source_context(uuid) from public,anon,authenticated,service_role;

create function public.get_consent_welcome_context(p_id uuid,p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'CONSENT_WELCOME_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.consent_welcome_notifications where id=p_id and claim_id=p_claim_id
    and status='preparing' and claim_expires_at>clock_timestamp()) then raise exception 'CONSENT_WELCOME_CLAIM_LOST'; end if;
  return public.consent_welcome_source_context(p_id);
end $$;

create function public.claim_consent_welcome_notifications(p_limit integer default 5)
returns setof public.consent_welcome_notifications language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'CONSENT_WELCOME_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>5 then raise exception 'CONSENT_WELCOME_LIMIT_INVALID'; end if;
  update public.consent_welcome_notifications set status='indeterminate',failure_code='sending_lease_expired',claim_id=null,claim_expires_at=null
    where status='sending' and claim_expires_at<=clock_timestamp();
  update public.consent_welcome_notifications set status='pending',failure_code='preparation_lease_expired',claim_id=null,claim_expires_at=null
    where status='preparing' and claim_expires_at<=clock_timestamp() and attempted_at is null;
  return query with due as(select id from public.consent_welcome_notifications where status='pending' and attempted_at is null
    and next_attempt_at<=clock_timestamp() order by next_attempt_at,id limit p_limit for update skip locked)
    update public.consent_welcome_notifications n set status='preparing',claim_id=gen_random_uuid(),
      claim_expires_at=clock_timestamp()+interval '5 minutes',preparation_attempts=n.preparation_attempts+1
      from due where n.id=due.id returning n.*;
end $$;

create function public.begin_consent_welcome_send(p_id uuid,p_claim_id uuid,p_source_fingerprint text,
  p_payload_sha256 text,p_attachment_fingerprints jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.consent_welcome_notifications%rowtype; context jsonb; item jsonb; expected integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'CONSENT_WELCOME_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if coalesce(p_source_fingerprint,'') !~ '^[0-9a-f]{64}$' or coalesce(p_payload_sha256,'') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_attachment_fingerprints) is distinct from 'array' then raise exception 'CONSENT_WELCOME_PREPARATION_INVALID'; end if;
  select * into job from public.consent_welcome_notifications where id=p_id for update;
  if not found or job.claim_id is distinct from p_claim_id or job.status<>'preparing'
    or job.claim_expires_at<=clock_timestamp() or job.attempted_at is not null then return false; end if;
  context:=public.consent_welcome_source_context(p_id);
  if context->'eligible' is distinct from 'true'::jsonb or context->>'source_fingerprint' is distinct from p_source_fingerprint then return false; end if;
  expected:=1+case when context->'ticket_upload_required'='true'::jsonb then 1 else 0 end
    +case when context->>'signature_method'='manual_scan' then 1 else 0 end;
  if jsonb_array_length(p_attachment_fingerprints)<>expected or
    (select count(distinct a->>'path') from jsonb_array_elements(p_attachment_fingerprints) a)<>expected then
    raise exception 'CONSENT_WELCOME_ATTACHMENTS_INVALID'; end if;
  for item in select * from jsonb_array_elements(p_attachment_fingerprints) loop
    if coalesce(item->>'sha256','') !~ '^[0-9a-f]{64}$' then raise exception 'CONSENT_WELCOME_ATTACHMENTS_INVALID'; end if;
    if item->>'path'='consent-forms/'||(context->>'consent_form_path') then
      if context->>'consent_sha256' is not null and item->>'sha256' is distinct from context->>'consent_sha256' then raise exception 'CONSENT_WELCOME_ATTACHMENTS_INVALID'; end if;
    elsif context->'ticket_upload_required'='true'::jsonb and item->>'path'='assessment-tickets/'||(context->>'ticket_document_path') then
      null; -- Ticket bytes are identity evidence, never an outgoing attachment.
    elsif context->>'signature_method'='manual_scan' and item->>'path'='representation-consent-scans/'||(context->>'manual_scan_pdf_path') then
      if item->>'sha256' is distinct from context->>'manual_scan_pdf_sha256' then raise exception 'CONSENT_WELCOME_ATTACHMENTS_INVALID'; end if;
    else raise exception 'CONSENT_WELCOME_ATTACHMENTS_INVALID'; end if;
  end loop;
  update public.consent_welcome_notifications set status='sending',attempted_at=clock_timestamp(),claim_expires_at=clock_timestamp()+interval '3 minutes',
    prepared_recipient=context->>'recipient',prepared_source_fingerprint=p_source_fingerprint,prepared_payload_sha256=p_payload_sha256,
    prepared_attachment_fingerprints=p_attachment_fingerprints,failure_code=null where id=p_id;
  return true;
end $$;

create function public.finish_consent_welcome_notification(p_id uuid,p_claim_id uuid,p_status text,
  p_provider_id text default null,p_failure_code text default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'CONSENT_WELCOME_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_status is null or p_status not in ('pending','sent','failed','indeterminate')
    or (p_status='sent' and (nullif(p_provider_id,'') is null or length(p_provider_id)>200 or p_failure_code is not null))
    or (p_status<>'sent' and (p_provider_id is not null or coalesce(p_failure_code,'') !~ '^[a-z0-9_]{1,80}$')) then
    raise exception 'CONSENT_WELCOME_OUTCOME_INVALID'; end if;
  update public.consent_welcome_notifications set status=p_status,provider_id=p_provider_id,
    sent_at=case when p_status='sent' then clock_timestamp() end,failure_code=p_failure_code,
    next_attempt_at=case when p_status='pending' then clock_timestamp()+interval '5 minutes' else next_attempt_at end,
    claim_id=null,claim_expires_at=null where id=p_id and claim_id=p_claim_id
      and ((status='preparing' and p_status in ('pending','failed')) or (status='sending' and p_status in ('sent','failed','indeterminate')));
  get diagnostics changed=row_count; return changed=1;
end $$;
create function public.record_consent_welcome_worker_health(p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'CONSENT_WELCOME_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_error is not null and p_error !~ '^[a-z0-9_]{1,80}$' then raise exception 'CONSENT_WELCOME_HEALTH_INVALID'; end if;
  update public.consent_welcome_state set last_worker_at=clock_timestamp(),last_worker_error=p_error where id;
end $$;
revoke all on function public.get_consent_welcome_context(uuid,uuid),public.claim_consent_welcome_notifications(integer),
  public.begin_consent_welcome_send(uuid,uuid,text,text,jsonb),public.finish_consent_welcome_notification(uuid,uuid,text,text,text),
  public.record_consent_welcome_worker_health(text) from public,anon,authenticated;
grant execute on function public.get_consent_welcome_context(uuid,uuid),public.claim_consent_welcome_notifications(integer),
  public.begin_consent_welcome_send(uuid,uuid,text,text,jsonb),public.finish_consent_welcome_notification(uuid,uuid,text,text,text),
  public.record_consent_welcome_worker_health(text) to service_role;

-- Preserve the installed reminder guard in full; add only queue ownership.
alter function public.get_abandoned_ticket_email_context(uuid,uuid) rename to get_abandoned_ticket_email_context_before_consent_welcome;
revoke all on function public.get_abandoned_ticket_email_context_before_consent_welcome(uuid,uuid) from public,anon,authenticated,service_role;
create function public.get_abandoned_ticket_email_context(p_id uuid,p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  result:=public.get_abandoned_ticket_email_context_before_consent_welcome(p_id,p_claim_id);
  if exists(select 1 from public.abandoned_ticket_emails e join public.ticket_intake_drafts d on d.id=e.draft_id
    join public.consent_welcome_notifications n on n.submission_id=coalesce(d.converted_submission_id,d.id)
    where e.id=p_id) then return jsonb_build_object('eligible',false,'reason','consent_welcome_owns_followup','retryable',false); end if;
  return result;
end $$;
revoke all on function public.get_abandoned_ticket_email_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_abandoned_ticket_email_context(uuid,uuid) to service_role;

-- Gmail can accept a staff consent copy before the worker loses its response.
-- Preserve the installed general activity claimant, but never recycle that
-- explicitly marked consent send after a crash.
alter function public.claim_portal_activity_events(integer) rename to claim_portal_activity_events_before_consent_welcome;
revoke all on function public.claim_portal_activity_events_before_consent_welcome(integer) from public,anon,authenticated,service_role;
create function public.claim_portal_activity_events(p_limit integer default 10)
returns setof public.portal_activity_events language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_limit is null or p_limit<1 or p_limit>25 then raise exception 'PORTAL_ACTIVITY_BATCH_INVALID'; end if;
  update public.portal_activity_events set status='needs_review',claim_token=null,lease_until=null,
    last_error='Consent copy delivery is uncertain; reconcile provider history before resending.'
    where event_type='representation_consent_signed' and status='processing'
      and last_error='consent_provider_request_started' and (lease_until is null or lease_until<=clock_timestamp());
  return query select * from public.claim_portal_activity_events_before_consent_welcome(p_limit);
end $$;
revoke all on function public.claim_portal_activity_events(integer) from public,anon,authenticated;
grant execute on function public.claim_portal_activity_events(integer) to service_role;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_namespace where nspname='vault') then
    if exists(select 1 from vault.secrets where name='idr_project_url') and exists(select 1 from vault.secrets where name='idr_cron_secret') then
      perform cron.schedule('fabsy-consent-welcome','* * * * *',$job$
        select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='idr_project_url') || '/functions/v1/process-consent-welcome',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
          body := '{}'::jsonb,timeout_milliseconds := 150000);
      $job$);
    end if;
  end if;
end $$;
comment on table public.consent_welcome_notifications is 'Prospective signed-consent client email delivery, one canonical PDF across sources. Preparing retries are safe; any uncertain send is held. Staff copies use the separate portal activity queue.';
notify pgrst, 'reload schema';
commit;
