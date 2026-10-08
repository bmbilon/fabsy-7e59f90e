create role anon;create role authenticated;create role service_role;
create schema auth;
create table auth.users(id uuid primary key,administrator boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
create type public.app_role as enum('admin','case_manager');
create function public.has_role(p_id uuid,p_role public.app_role) returns boolean language sql stable as $$select coalesce((select administrator from auth.users where id=p_id),false) and p_role='admin'$$;
create function public.is_idr_staff() returns boolean language sql stable as $$select auth.uid() is not null$$;
create function public.canonical_ticket_number(value text) returns text language sql immutable as $$select regexp_replace(upper(coalesce(value,'')),'[^A-Z0-9]','','g')$$;
create table public.ticket_submissions(
 id uuid primary key default gen_random_uuid(),ticket_number text,first_name text,last_name text,fine_amount numeric,
 ticket_document_path text,consent_form_path text,intake_consent jsonb,defense_strategy text,intake_mode text,ticket_type text,intake_review_status text,
 representation_paid_at timestamptz,representation_access_token_hash text,date_of_birth date,drivers_license text,created_at timestamptz not null default now(),deleted_at timestamptz,
 status text default 'pending',service_type text default 'representation',allow_disclosure boolean default true
);
create table public.case_payment_confirmations(id uuid primary key default gen_random_uuid(),submission_id uuid references public.ticket_submissions,revoked_at timestamptz);
create table public.idr_checkout_intents(id uuid primary key default gen_random_uuid(),ticket_submission_id uuid references public.ticket_submissions,status text,checkout_kind text);
create table public.service_orders(id uuid primary key,access_token_hash text,product text,ticket_number text,ticket_submission_id uuid references public.ticket_submissions,ticket_document_path text);
create table public.portal_agent_state(id boolean primary key default true,enabled boolean default true,review_submissions_enabled boolean default true,last_seen_at timestamptz,last_error text);
insert into public.portal_agent_state(id) values(true);
create table public.portal_agent_jobs(
 id uuid primary key default gen_random_uuid(),dedupe_key text unique,ticket_number text,submission_id uuid references public.ticket_submissions,
 action text constraint portal_agent_jobs_action_check check(action in ('inspect_offer','inspect_disclosure','prepare_disclosure','prepare_offer_acceptance','submit_review_request')),
 source_url text,status text not null default 'queued',result jsonb default '{}',review_reason text,
 lease_token uuid,lease_expires_at timestamptz,attempts integer default 0,handoff_requested boolean default false,
 created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.disclosure_portal_approvals(id uuid primary key default gen_random_uuid(),ticket_number text,status text);
create table public.disclosure_request_receipts(id uuid primary key default gen_random_uuid(),submission_id uuid,ticket_number text,source_key text unique,session_id uuid);
create table public.portal_push_subscriptions(id uuid primary key default gen_random_uuid(),active boolean default true);
create table public.portal_push_outbox(id uuid primary key default gen_random_uuid(),subscription_id uuid,job_id uuid,dedupe_key text,unique(subscription_id,dedupe_key));
create function public.disclosure_approval_case_eligible(p_id uuid) returns boolean language sql stable as $$
 select coalesce((select allow_disclosure and t.status in ('pending','in_progress') and t.deleted_at is null
  and (representation_paid_at is not null or exists(select 1 from public.case_payment_confirmations c where c.submission_id=t.id and c.revoked_at is null))
  and consent_form_path is not null and intake_review_status='ready'
  and (select count(*) from public.ticket_submissions other where public.canonical_ticket_number(other.ticket_number)=public.canonical_ticket_number(t.ticket_number))=1
  and not exists(select 1 from public.disclosure_request_receipts r where r.ticket_number=public.canonical_ticket_number(t.ticket_number))
 from public.ticket_submissions t where id=p_id),false);
$$;
-- The existing production receipt procedure is not replaced by the new migration.
create function public.record_disclosure_request_receipt(p_id uuid,p_ticket text,p_source text,p_key text,p_at timestamptz,p_ref text,p_hash text,p_session uuid,p_confirmation uuid,p_confirmed boolean) returns jsonb language plpgsql as $$
begin
 if p_source<>'portal' or p_session is null or not p_confirmed or p_hash is null then raise exception 'RECEIPT_INVALID';end if;
 insert into public.disclosure_request_receipts(submission_id,ticket_number,source_key,session_id) values(p_id,p_ticket,p_key,p_session);
 return jsonb_build_object('recorded',true);
end $$;
create function public.claim_portal_agent_job() returns setof public.portal_agent_jobs language plpgsql security definer set search_path=public as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 if not exists(select 1 from public.portal_agent_state where id and enabled) or exists(select 1 from public.portal_agent_jobs where status='running') then return;end if;
 return query update public.portal_agent_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '4 minutes',updated_at=now()
 where id=(select id from public.portal_agent_jobs where status='queued'
 and (nullif(result->>'retry_after','') is null or (result->>'retry_after')::timestamptz<=now())
 and (action<>'submit_review_request' or exists(select 1 from public.portal_agent_state where id and review_submissions_enabled))
 order by created_at for update skip locked limit 1) returning *;
end $$;
create function public.request_portal_handoff(p_id uuid,p_resume boolean default false) returns void language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.is_idr_staff(),false) then raise exception 'STAFF_REQUIRED';end if;
 update public.portal_agent_jobs set status='queued',handoff_requested=case when action='submit_review_request' then not p_resume and coalesce(review_reason,'') like '%HUMAN_VERIFICATION_REQUIRED%' else not p_resume end,review_reason=null,
 result=case when action='submit_review_request' then case when p_resume then result else result-'session_id'-'session_expires_at'-'live_url' end else case when p_resume then result else null end end,updated_at=now()
 where id=p_id and action in ('inspect_offer','inspect_disclosure','prepare_offer_acceptance','submit_review_request') and status in ('needs_review','uncertain')
 and (action<>'submit_review_request' or result->>'phase' is distinct from 'committing' or p_resume)
 and (not p_resume or ((result->>'session_expires_at')::timestamptz>now() and result->>'session_id' is not null));
 if not found then raise exception 'HANDOFF_NOT_AVAILABLE';end if;
end $$;
create function public.enqueue_portal_attention_push() returns trigger language plpgsql as $$begin return new;end$$;
create trigger portal_attention after insert or update on public.portal_agent_jobs for each row execute function public.enqueue_portal_attention_push();
