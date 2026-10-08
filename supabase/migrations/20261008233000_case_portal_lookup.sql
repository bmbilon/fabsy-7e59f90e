begin;

-- Keep lookup evidence separate from immutable checkout and signed documents.
-- Values are encrypted by the existing runner key and never enter job results.
create table public.case_portal_verifications (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.ticket_submissions(id),
 ticket_number text not null check(ticket_number ~ '^[A-Z][0-9]{8}[A-Z]$'),
 kind text not null check(kind in ('plate','drivers_license','date_of_birth')),
 ciphertext jsonb not null check(jsonb_typeof(ciphertext)='object' and coalesce(ciphertext->>'version'='2',false) and ciphertext ? 'iv' and ciphertext ? 'value'),
 value_sha256 text not null check(value_sha256 ~ '^[a-f0-9]{64}$'),
 source_path text not null, source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_kind text not null check(source_kind in ('staff_confirmation','client_confirmation')),
 confirmed_by uuid references auth.users(id), confirmed_at timestamptz not null default now(),
 evidence text not null, revoked_at timestamptz,
 check((source_kind='staff_confirmation')=(confirmed_by is not null))
);
create unique index one_current_portal_lookup on public.case_portal_verifications(submission_id) where revoked_at is null;
alter table public.case_portal_verifications enable row level security;
revoke all on public.case_portal_verifications from public,anon,authenticated;
grant all on public.case_portal_verifications to service_role;

create function public.record_case_portal_verification(p_id uuid,p_ticket text,p_kind text,p_cipher jsonb,p_hash text,p_source text,p_source_hash text,p_staff uuid default null,p_access_hash text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare t public.ticket_submissions; existing public.case_portal_verifications; saved uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 select * into t from public.ticket_submissions where id=p_id and deleted_at is null for update;
 if not found or t.service_type<>'representation' or t.consent_form_path is null
  or public.canonical_ticket_number(t.ticket_number) is distinct from p_ticket
  or p_ticket !~ '^[A-Z][0-9]{8}[A-Z]$' or t.ticket_document_path is distinct from p_source then raise exception 'EXACT_CONSENTED_CASE_REQUIRED';end if;
 if p_staff is not null then
  if not (coalesce(public.has_role(p_staff,'admin'::public.app_role),false) or coalesce(public.has_role(p_staff,'case_manager'::public.app_role),false)) then raise exception 'STAFF_REQUIRED';end if;
 elsif p_access_hash is null or nullif(to_jsonb(t)->>'representation_access_token_hash','') is distinct from p_access_hash then raise exception 'PRIVATE_CASE_ACCESS_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ticket,731904220::bigint));
 if exists(select 1 from public.portal_agent_jobs where submission_id=p_id and action='submit_initial_disclosure'
  and (status in ('running','completed','uncertain') or result->>'phase'='committing'
   or (nullif(result->>'session_id','') is not null and (result->>'session_expires_at')::timestamptz>now()))) then raise exception 'LOOKUP_FORM_LOCKED';end if;
 if exists(select 1 from public.disclosure_request_receipts where ticket_number=p_ticket) then raise exception 'DISCLOSURE_ALREADY_RECORDED';end if;
 select * into existing from public.case_portal_verifications where submission_id=p_id and revoked_at is null for update;
 if found and (existing.kind,existing.value_sha256,existing.source_path,existing.source_sha256)
  is not distinct from (p_kind,p_hash,p_source,p_source_hash) then return existing.id;end if;
 update public.case_portal_verifications set revoked_at=now() where submission_id=p_id and revoked_at is null;
 insert into public.case_portal_verifications(submission_id,ticket_number,kind,ciphertext,value_sha256,source_path,source_sha256,source_kind,confirmed_by,evidence)
 values(p_id,p_ticket,p_kind,p_cipher,p_hash,p_source,p_source_hash,case when p_staff is null then 'client_confirmation' else 'staff_confirmation' end,p_staff,
  case when p_staff is null then 'The client supplied this lookup identifier using the private saved-upload capability for this ticket.'
  else 'Authenticated staff confirmed this lookup identifier belongs to the defendant or vehicle for this ticket.' end) returning id into saved;
 -- Only a missing-detail hold, before a browser or committing phase, resumes automatically.
 update public.portal_agent_jobs set status='queued',review_reason=null,result=coalesce(result,'{}')-'hold_code'-'error_detail',updated_at=now()
 where submission_id=p_id and action='submit_initial_disclosure' and status='needs_review' and result->>'phase'='verification'
  and nullif(result->>'session_id','') is null and (review_reason like '%VERIFICATION_DETAIL_REQUIRED%' or review_reason like '%VERIFICATION_PLATE_REQUIRED%')
  and public.disclosure_approval_case_eligible(p_id);
 return saved;
end $$;
revoke all on function public.record_case_portal_verification(uuid,text,text,jsonb,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_case_portal_verification(uuid,text,text,jsonb,text,text,text,uuid,text) to service_role;

create function public.check_initial_lookup_commit() returns trigger language plpgsql set search_path=public as $$
declare m public.initial_disclosure_material; v public.case_portal_verifications; f jsonb;
begin
 if new.action<>'submit_initial_disclosure' or new.result->>'phase' is distinct from 'committing' or old.result->>'phase'='committing' then return new;end if;
 f:=new.result->'form_snapshot';
 select * into m from public.initial_disclosure_material where submission_id=new.submission_id;
 if not found or coalesce(f->>'lookup_fingerprint','') !~ '^[a-f0-9]{64}$' or coalesce(f->>'lookup_kind','') not in ('plate','drivers_license','date_of_birth') then raise exception 'VERIFIED_LOOKUP_REQUIRED';end if;
 if nullif(f->>'lookup_record_id','') is not null then
  select * into v from public.case_portal_verifications where id=(f->>'lookup_record_id')::uuid and submission_id=new.submission_id and revoked_at is null;
  if not found or v.ticket_number is distinct from new.ticket_number or v.kind is distinct from f->>'lookup_kind'
   or v.value_sha256 is distinct from f->>'lookup_fingerprint' or v.source_path is distinct from m.source_path
   or v.source_sha256 is distinct from m.source_sha256 then raise exception 'VERIFIED_LOOKUP_CHANGED';end if;
 else
  if exists(select 1 from public.case_portal_verifications where submission_id=new.submission_id and revoked_at is null)
   or not exists(select 1 from jsonb_array_elements(coalesce(m.evidence->'lookup_fingerprints','[]')) x
    where x->>'kind'=f->>'lookup_kind' and x->>'sha256'=f->>'lookup_fingerprint') then raise exception 'VERIFIED_LOOKUP_CHANGED';end if;
 end if;
 return new;
end $$;
create trigger check_initial_lookup_commit before update on public.portal_agent_jobs for each row execute function public.check_initial_lookup_commit();

-- Require the actual success sentence to name this ticket; a navigation header
-- containing it cannot prove a different ticket's confirmation was submitted.
do $patch$
declare definition text; old_clause text:=$old$or public.canonical_ticket_number(p_receipt->>'confirmation') not like '%'||j.ticket_number||'%'$old$;
begin
 definition:=pg_get_functiondef('public.complete_initial_disclosure(uuid,uuid,jsonb,text)'::regprocedure);
 if position(old_clause in definition)=0 then raise exception 'INITIAL_RECEIPT_DEFINITION_CHANGED';end if;
 definition:=replace(definition,old_clause,$new$or replace(p_receipt->>'confirmation',chr(160),' ') !~* ('received your disclosure request for[[:space:]]+(ticket[[:space:]]+)?'||j.ticket_number||'([^[:alnum:]]|$)')$new$);
 execute definition;
end $patch$;

create function public.verified_ticket_display_names() returns table(submission_id uuid,ticket_number text,defendant text)
language sql stable security definer set search_path=public as $$
 select m.submission_id,public.canonical_ticket_number(t.ticket_number),m.evidence->>'defendant'
 from public.initial_disclosure_material m join public.ticket_submissions t on t.id=m.submission_id
 where t.deleted_at is null and m.case_fingerprint=public.initial_disclosure_fingerprint(t.id)
 order by m.verified_at desc limit 100;
$$;
revoke all on function public.verified_ticket_display_names() from public,anon,authenticated;
grant execute on function public.verified_ticket_display_names() to service_role;

commit;
