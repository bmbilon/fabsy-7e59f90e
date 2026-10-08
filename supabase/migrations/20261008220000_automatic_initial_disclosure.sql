begin;

alter table public.portal_agent_state add column initial_disclosures_enabled boolean not null default false;
alter table public.portal_agent_state add column initial_disclosures_from timestamptz;
alter table public.portal_agent_state add constraint initial_disclosure_prospective_cutoff check(not initial_disclosures_enabled or initial_disclosures_from is not null);
alter table public.portal_agent_jobs drop constraint portal_agent_jobs_action_check;
alter table public.portal_agent_jobs add constraint portal_agent_jobs_action_check check(action in ('inspect_offer','inspect_disclosure','prepare_disclosure','prepare_offer_acceptance','submit_review_request','submit_initial_disclosure'));
create unique index one_initial_disclosure_per_ticket on public.portal_agent_jobs(ticket_number) where action='submit_initial_disclosure';

create table public.initial_disclosure_material (
 submission_id uuid primary key references public.ticket_submissions(id),
 case_fingerprint text not null check(case_fingerprint ~ '^[a-f0-9]{64}$'),
 source_path text not null, source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 consent_path text not null, consent_sha256 text not null check(consent_sha256 ~ '^[a-f0-9]{64}$'),
 verification_ciphertext jsonb not null, evidence jsonb not null,
 verified_at timestamptz not null default now()
);
create table public.portal_browser_sessions (
 id uuid primary key default gen_random_uuid(), browser_session_id text not null unique check(length(browser_session_id) between 1 and 200),
 terms_url text not null check(terms_url='https://traffictickets.alberta.ca/terms-of-use'),
 terms_text text not null check(length(terms_text) between 40 and 60000),
 terms_sha256 text not null check(terms_sha256 ~ '^[a-f0-9]{64}$'),
 scope jsonb not null check(jsonb_typeof(scope)='array' and jsonb_array_length(scope)>0),
 status text not null default 'pending' check(status in ('pending','accepted','expired')),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 accepted_by uuid references auth.users(id), accepted_at timestamptz,
 check(status<>'accepted' or (accepted_by is not null and accepted_at is not null)),
 check(expires_at>created_at and expires_at<=created_at+interval '11 minutes')
);
create table public.initial_disclosure_receipts (
 job_id uuid primary key references public.portal_agent_jobs(id),
 submission_id uuid not null unique references public.ticket_submissions(id),
 ticket_number text not null unique, session_id uuid not null references public.portal_browser_sessions(id),
 receipt jsonb not null, confirmation_sha256 text not null check(confirmation_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default now()
);
alter table public.initial_disclosure_material enable row level security;
alter table public.portal_browser_sessions enable row level security;
alter table public.initial_disclosure_receipts enable row level security;
revoke all on public.initial_disclosure_material,public.portal_browser_sessions,public.initial_disclosure_receipts from public,anon,authenticated;
grant all on public.initial_disclosure_material,public.portal_browser_sessions,public.initial_disclosure_receipts to service_role;
grant select on public.portal_browser_sessions,public.initial_disclosure_receipts to authenticated;
create policy "Administrators read browser terms" on public.portal_browser_sessions for select to authenticated using(public.has_role(auth.uid(),'admin'::public.app_role));
create policy "Staff read initial receipts" on public.initial_disclosure_receipts for select to authenticated using(public.is_idr_staff());

create function public.protect_portal_browser_session() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' and (new.browser_session_id,new.terms_url,new.terms_text,new.terms_sha256,new.scope,new.created_at,new.expires_at)
  is distinct from (old.browser_session_id,old.terms_url,old.terms_text,old.terms_sha256,old.scope,old.created_at,old.expires_at) then raise exception 'SESSION_TERMS_IMMUTABLE';end if;
 if (tg_op='INSERT' and (new.status='accepted' or new.accepted_by is not null or new.accepted_at is not null))
  or (tg_op='UPDATE' and (new.status,new.accepted_by,new.accepted_at) is distinct from (old.status,old.accepted_by,old.accepted_at) and (new.status='accepted' or old.status='accepted')) then
  if coalesce(auth.role(),'')<>'authenticated' or auth.uid() is null or new.accepted_by is distinct from auth.uid()
   or not coalesce(public.has_role(auth.uid(),'admin'::public.app_role),false) then raise exception 'ADMINISTRATOR_TAP_REQUIRED';end if;
  if tg_op='UPDATE' and old.status='accepted' then raise exception 'SESSION_ACCEPTANCE_IMMUTABLE';end if;
 end if;
 return new;
end $$;
create trigger protect_portal_browser_session before insert or update on public.portal_browser_sessions for each row execute function public.protect_portal_browser_session();

create function public.initial_disclosure_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('submission_id',t.id,'ticket_number',public.canonical_ticket_number(t.ticket_number),
 'defendant',concat_ws(' ',t.first_name,t.last_name),'fine_amount',t.fine_amount,
 'source_path',t.ticket_document_path,'consent_path',t.consent_form_path,'intake_consent',t.intake_consent,
 'defense_strategy',t.defense_strategy,'intake_mode',t.intake_mode,'ticket_type',t.ticket_type,
 'intake_review_status',t.intake_review_status,'representation_paid_at',t.representation_paid_at)
 from public.ticket_submissions t where t.id=p_id and t.deleted_at is null;
$$;
create function public.initial_disclosure_fingerprint(p_id uuid) returns text language sql stable security definer set search_path=public as $$
 select encode(sha256(convert_to(public.initial_disclosure_snapshot(p_id)::text,'UTF8')),'hex');
$$;
revoke all on function public.initial_disclosure_snapshot(uuid),public.initial_disclosure_fingerprint(uuid) from public,anon,authenticated;
grant execute on function public.initial_disclosure_snapshot(uuid),public.initial_disclosure_fingerprint(uuid) to service_role;

create function public.queue_initial_disclosure(p_id uuid,p_explicit boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.ticket_submissions; ticket text; queued uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 if not exists(select 1 from public.portal_agent_state where id and enabled and initial_disclosures_enabled) then return null;end if;
 select * into t from public.ticket_submissions where id=p_id;
 if not found or (not p_explicit and t.created_at<(select initial_disclosures_from from public.portal_agent_state where id)) then return null;end if;
 ticket:=public.canonical_ticket_number(t.ticket_number);
 if ticket !~ '^[A-Z][0-9]{8}[A-Z]$' or not public.disclosure_approval_case_eligible(p_id) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(ticket,731904220::bigint));
 -- Any existing initial job, legacy prepared request, receipt or acknowledgement blocks admission.
 if exists(select 1 from public.portal_agent_jobs where ticket_number=ticket and action in ('submit_initial_disclosure','prepare_disclosure'))
  or exists(select 1 from public.disclosure_portal_approvals where ticket_number=ticket and status in ('creating','pending','approved','consumed'))
  or exists(select 1 from public.initial_disclosure_receipts where ticket_number=ticket) then return null;end if;
 insert into public.portal_agent_jobs(dedupe_key,ticket_number,submission_id,action,source_url,result)
 values('initial-disclosure/'||ticket,ticket,p_id,'submit_initial_disclosure',
 'https://traffictickets.alberta.ca/ticket-number-search?ticketNumber='||ticket,
 jsonb_build_object('phase','queued','authorization_basis','Brett standing policy 2026-09-26','admitted_explicitly',p_explicit))
 on conflict do nothing returning id into queued;
 return queued;
end $$;
revoke all on function public.queue_initial_disclosure(uuid,boolean) from public,anon,authenticated;
grant execute on function public.queue_initial_disclosure(uuid,boolean) to service_role;

create function public.discover_initial_disclosures() returns integer language plpgsql security definer set search_path=public as $$
declare t record; n integer:=0; queued uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 if not exists(select 1 from public.portal_agent_state where id and enabled and initial_disclosures_enabled and initial_disclosures_from is not null) then return 0;end if;
 for t in select s.id from public.ticket_submissions s where s.created_at>=(select initial_disclosures_from from public.portal_agent_state where id)
  and s.service_type='representation' and s.status in ('pending','in_progress') and s.deleted_at is null
  and s.consent_form_path is not null and public.canonical_ticket_number(s.ticket_number) ~ '^[A-Z][0-9]{8}[A-Z]$'
  and public.disclosure_approval_case_eligible(s.id)
  and not exists(select 1 from public.portal_agent_jobs j where j.submission_id=s.id and j.action='submit_initial_disclosure')
  order by s.created_at limit 20 loop
  queued:=public.queue_initial_disclosure(t.id,false);if queued is not null then n:=n+1;end if;
 end loop;
 return n;
end $$;
revoke all on function public.discover_initial_disclosures() from public,anon,authenticated;
grant execute on function public.discover_initial_disclosures() to service_role;

create function public.on_initial_disclosure_ready() returns trigger language plpgsql security definer set search_path=public as $$
begin
 -- Client and staff writes are admitted by the next scheduled service-role discovery.
 if coalesce(auth.role(),'')<>'service_role' then return new;end if;
 if tg_table_name='ticket_submissions' then perform public.queue_initial_disclosure(new.id,false);
 elsif tg_table_name='case_payment_confirmations' then perform public.queue_initial_disclosure(new.submission_id,false);
 else perform public.queue_initial_disclosure(new.ticket_submission_id,false);end if;
 return new;
end $$;
revoke all on function public.on_initial_disclosure_ready() from public,anon,authenticated;
create trigger initial_disclosure_intake after insert or update of representation_paid_at,consent_form_path,intake_review_status on public.ticket_submissions for each row execute function public.on_initial_disclosure_ready();
create trigger initial_disclosure_operator_payment after insert or update on public.case_payment_confirmations for each row execute function public.on_initial_disclosure_ready();
create trigger initial_disclosure_stripe_payment after insert or update of status on public.idr_checkout_intents for each row execute function public.on_initial_disclosure_ready();

create function public.register_portal_browser_session(p_job uuid,p_lease uuid,p_browser text,p_terms text,p_hash text,p_expires timestamptz) returns uuid
language plpgsql security definer set search_path=public as $$
declare j public.portal_agent_jobs; s public.portal_browser_sessions; scope_value jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 select * into j from public.portal_agent_jobs where id=p_job for update;
 if not found or j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_expires_at<=now()
  or j.result->>'phase'='committing' then raise exception 'SESSION_LEASE_LOST';end if;
 if p_hash is distinct from encode(sha256(convert_to(p_terms,'UTF8')),'hex') or p_expires<=now() or p_expires>now()+interval '10 minutes' then raise exception 'SESSION_TERMS_INVALID';end if;
 scope_value:=jsonb_build_array(jsonb_build_object('job_id',j.id,'submission_id',j.submission_id,'ticket_number',j.ticket_number,'action',j.action));
 insert into public.portal_browser_sessions(browser_session_id,terms_url,terms_text,terms_sha256,scope,expires_at)
 values(p_browser,'https://traffictickets.alberta.ca/terms-of-use',p_terms,p_hash,scope_value,p_expires)
 on conflict(browser_session_id) do nothing returning * into s;
 if s.id is null then select * into s from public.portal_browser_sessions where browser_session_id=p_browser;end if;
 if s.scope is distinct from scope_value or s.terms_sha256 is distinct from p_hash or s.expires_at<=now() then raise exception 'SESSION_SCOPE_CHANGED';end if;
 update public.portal_agent_jobs set status='needs_review',lease_expires_at=null,
 result=coalesce(result,'{}'::jsonb)||jsonb_build_object('phase','awaiting_terms','session_id',p_browser,'session_expires_at',s.expires_at,'session_record_id',s.id,'terms_sha256',p_hash),
 review_reason='Accept the displayed government terms for this cloud session to continue automatically.',updated_at=now() where id=j.id;
 return s.id;
end $$;
revoke all on function public.register_portal_browser_session(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.register_portal_browser_session(uuid,uuid,text,text,text,timestamptz) to service_role;

create function public.accept_portal_browser_session(p_id uuid,p_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare s public.portal_browser_sessions; queued_job uuid;
begin
 if auth.uid() is null or not coalesce(public.has_role(auth.uid(),'admin'::public.app_role),false) then raise exception 'ADMINISTRATOR_REQUIRED';end if;
 select * into s from public.portal_browser_sessions where id=p_id for update;
 if not found or s.terms_sha256 is distinct from p_hash or s.expires_at<=now()+interval '30 seconds' or s.status='expired' then raise exception 'SESSION_EXPIRED_OR_CHANGED';end if;
 select (value->>'job_id')::uuid into queued_job from jsonb_array_elements(s.scope) limit 1;
 if s.status='accepted' then return queued_job;end if;
 if not exists(select 1 from public.portal_agent_jobs j where j.id=queued_job and j.status='needs_review'
  and j.result->>'session_record_id'=s.id::text and j.result->>'phase'='awaiting_terms') then raise exception 'SESSION_JOB_CHANGED';end if;
 update public.portal_browser_sessions set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=s.id;
 update public.portal_agent_jobs set status='queued',lease_token=null,lease_expires_at=null,review_reason=null,updated_at=now() where id=queued_job;
 return queued_job;
end $$;
revoke all on function public.accept_portal_browser_session(uuid,text) from public,anon,service_role;
grant execute on function public.accept_portal_browser_session(uuid,text) to authenticated;

create function public.assert_portal_browser_session(p_job uuid,p_browser text,p_hash text) returns public.portal_browser_sessions
language plpgsql stable security definer set search_path=public as $$
declare j public.portal_agent_jobs; s public.portal_browser_sessions;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 select * into j from public.portal_agent_jobs where id=p_job;
 select * into s from public.portal_browser_sessions where id=(j.result->>'session_record_id')::uuid;
 if not found or s.status<>'accepted' or s.accepted_by is null or not coalesce(public.has_role(s.accepted_by,'admin'::public.app_role),false)
  or s.expires_at<=now() or s.browser_session_id is distinct from p_browser or s.terms_sha256 is distinct from p_hash
  or not s.scope @> jsonb_build_array(jsonb_build_object('job_id',j.id,'submission_id',j.submission_id,'ticket_number',j.ticket_number,'action',j.action)) then raise exception 'ACCEPTED_SESSION_REQUIRED';end if;
 return s;
end $$;
revoke all on function public.assert_portal_browser_session(uuid,text,text) from public,anon,authenticated;
grant execute on function public.assert_portal_browser_session(uuid,text,text) to service_role;

create function public.begin_initial_disclosure(p_job uuid,p_lease uuid,p_form jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare j public.portal_agent_jobs; m public.initial_disclosure_material; s public.portal_browser_sessions;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 select * into j from public.portal_agent_jobs where id=p_job for update;
 if not found or j.action<>'submit_initial_disclosure' or j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_expires_at<=now()+interval '60 seconds' or j.result->>'phase'='committing' then raise exception 'LEASE_OR_COMMIT_LOST';end if;
 if not exists(select 1 from public.portal_agent_state where id and enabled and initial_disclosures_enabled) or not public.disclosure_approval_case_eligible(j.submission_id) then raise exception 'INITIAL_FILING_GATES_CHANGED';end if;
 select * into m from public.initial_disclosure_material where submission_id=j.submission_id;
 if not found or m.case_fingerprint is distinct from public.initial_disclosure_fingerprint(j.submission_id)
  or p_form->>'case_fingerprint' is distinct from m.case_fingerprint or p_form->>'source_sha256' is distinct from m.source_sha256
  or p_form->>'consent_sha256' is distinct from m.consent_sha256 or p_form->>'ticket_number' is distinct from j.ticket_number
  or p_form->>'representative_email' is distinct from 'hello@fabsy.ca' or p_form->>'defendant_no_email' is distinct from 'true' or p_form->>'agent' is distinct from 'true'
  then raise exception 'INITIAL_FILING_MATERIAL_CHANGED';end if;
 s:=public.assert_portal_browser_session(j.id,p_form->>'browser_session_id',p_form->>'terms_sha256');
 if s.id::text is distinct from p_form->>'session_record_id' then raise exception 'SESSION_SCOPE_CHANGED';end if;
 update public.portal_agent_jobs set result=result||jsonb_build_object('phase','committing','commit_started_at',now(),'form_snapshot',p_form),updated_at=now() where id=j.id;
end $$;
revoke all on function public.begin_initial_disclosure(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.begin_initial_disclosure(uuid,uuid,jsonb) to service_role;

create function public.complete_initial_disclosure(p_job uuid,p_lease uuid,p_receipt jsonb,p_confirmation_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare j public.portal_agent_jobs; saved jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 select * into j from public.portal_agent_jobs where id=p_job for update;
 if j.status='completed' and exists(select 1 from public.initial_disclosure_receipts where job_id=p_job and receipt=p_receipt) then return jsonb_build_object('completed',true);end if;
 if not found or j.action<>'submit_initial_disclosure' or j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_expires_at<=now()
  or j.result->>'phase' is distinct from 'committing' or p_receipt->>'ticket_number' is distinct from j.ticket_number
  or p_receipt->>'source' is distinct from 'cloud_verified_disclosure'
  or p_receipt->>'url' !~ '^https://traffictickets[.]alberta[.]ca/request-disclosure-confirmation([?#].*)?$'
  or coalesce(p_receipt->>'confirmation','') !~* 'received your disclosure request for'
  or public.canonical_ticket_number(p_receipt->>'confirmation') not like '%'||j.ticket_number||'%'
  or p_confirmation_hash is distinct from encode(sha256(convert_to(p_receipt->>'confirmation','UTF8')),'hex') then raise exception 'CONFIRMED_DISCLOSURE_RECEIPT_REQUIRED';end if;
 insert into public.initial_disclosure_receipts(job_id,submission_id,ticket_number,session_id,receipt,confirmation_sha256)
 values(j.id,j.submission_id,j.ticket_number,(j.result->>'session_record_id')::uuid,p_receipt,p_confirmation_hash);
 saved:=public.record_disclosure_request_receipt(j.submission_id,j.ticket_number,'portal','cloud-initial/'||j.id,
 (p_receipt->>'recorded_at')::timestamptz,'initial_disclosure_receipts/'||j.id,p_confirmation_hash,(j.result->>'session_record_id')::uuid,null,true);
 update public.portal_agent_jobs set status='completed',lease_expires_at=null,result=result||jsonb_build_object('phase','submitted','receipt',p_receipt,'portal_verified',true),review_reason='Disclosure request submitted; exact-ticket government receipt saved.',updated_at=now() where id=j.id;
 update public.portal_agent_state set last_seen_at=now(),last_error=null where id;
 return saved;
end $$;
revoke all on function public.complete_initial_disclosure(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_initial_disclosure(uuid,uuid,jsonb,text) to service_role;

create function public.protect_initial_disclosure_job() returns trigger language plpgsql set search_path=public as $$
begin
 if old.action='submit_initial_disclosure' and (new.action,new.ticket_number,new.submission_id) is distinct from (old.action,old.ticket_number,old.submission_id) then raise exception 'INITIAL_JOB_IDENTITY_IMMUTABLE';end if;
 if new.action='submit_initial_disclosure' then
  if new.status='running' and old.status<>'running' and coalesce(new.result->>'phase','')<>'committing' then new.lease_expires_at:=now()+interval '8 minutes';end if;
  if new.status='completed' and not exists(select 1 from public.initial_disclosure_receipts where job_id=new.id and ticket_number=new.ticket_number) then raise exception 'CONFIRMED_DISCLOSURE_RECEIPT_REQUIRED';end if;
  if old.result->>'phase'='committing' and new.status<>'completed' then
   if new.status in ('needs_review','uncertain') then
    new.result:=old.result||coalesce(new.result,'{}'::jsonb)||jsonb_build_object('phase','committing','form_snapshot',old.result->'form_snapshot','commit_started_at',old.result->'commit_started_at');
    new.status:='uncertain';
   end if;
   if new.result->>'phase' is distinct from 'committing' or new.result->'form_snapshot' is distinct from old.result->'form_snapshot' then raise exception 'UNCERTAIN_SUBMISSION_REQUIRES_RECONCILIATION';end if;
   if new.status='queued' and (new.result->>'session_id' is null or (new.result->>'session_expires_at')::timestamptz<=now()) then raise exception 'UNCERTAIN_SUBMISSION_REQUIRES_RECONCILIATION';end if;
  end if;
 end if;return new;
end $$;
create trigger protect_initial_disclosure_job before update on public.portal_agent_jobs for each row execute function public.protect_initial_disclosure_job();

create function public.defer_initial_browser(p_job uuid,p_lease uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare j public.portal_agent_jobs; retries integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 select * into j from public.portal_agent_jobs where id=p_job for update;
 if not found or j.action<>'submit_initial_disclosure' or j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_expires_at<=now() or j.result->>'phase'='committing' then raise exception 'PRE_SUBMISSION_RETRY_ONLY';end if;
 if p_reason not in ('BROWSER_RATE_LIMIT','CLOUD_BROWSER_IN_USE') then raise exception 'INVALID_BROWSER_RETRY';end if;
 retries:=coalesce((j.result->>'browser_retries')::integer,0)+1;
 update public.portal_agent_jobs set status=case when retries<4 then 'queued' else 'needs_review' end,lease_expires_at=null,
 result=result||jsonb_build_object('browser_retries',retries,'retry_after',now()+interval '5 minutes'),
 review_reason=case when retries<4 then 'Cloud browser temporarily unavailable; waiting for the saved retry.' else 'Cloud browser unavailable after bounded retries. Review capacity; no submission was attempted.' end,updated_at=now() where id=j.id;
end $$;
revoke all on function public.defer_initial_browser(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.defer_initial_browser(uuid,uuid,text) to service_role;

-- Preserve the deployed claim and handoff functions; extend their exact action gates.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.claim_portal_agent_job()'::regprocedure);
 if position('order by created_at for update skip locked limit 1' in lower(definition))=0 then raise exception 'CLAIM_DEFINITION_CHANGED';end if;
 definition:=replace(definition,'order by created_at for update skip locked limit 1',
 'and (action<>''submit_initial_disclosure'' or exists(select 1 from public.portal_agent_state where id and initial_disclosures_enabled)) order by created_at for update skip locked limit 1');
 execute definition;
 definition:=pg_get_functiondef('public.request_portal_handoff(uuid,boolean)'::regprocedure);
 if position('''submit_review_request''' in definition)=0 then raise exception 'HANDOFF_DEFINITION_CHANGED';end if;
 definition:=replace(definition,'action=''submit_review_request''','action in (''submit_review_request'',''submit_initial_disclosure'')');
 definition:=replace(definition,'action<>''submit_review_request''','action not in (''submit_review_request'',''submit_initial_disclosure'')');
 definition:=replace(definition,'''prepare_offer_acceptance'',''submit_review_request''','''prepare_offer_acceptance'',''submit_review_request'',''submit_initial_disclosure''');
 execute definition;
end $$;

-- Repeated session pings are keyed by the actual session, never by a notification open.
create or replace function public.enqueue_portal_attention_push() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='needs_review' and (tg_op='INSERT' or old.status is distinct from 'needs_review') then
  insert into public.portal_push_outbox(subscription_id,job_id,dedupe_key)
  select id,new.id,case when new.result->>'phase'='awaiting_terms' then 'terms/'||(new.result->>'session_record_id') else 'attention/'||new.id end from public.portal_push_subscriptions where active
  on conflict do nothing;
 end if;return new;
end $$;

commit;
