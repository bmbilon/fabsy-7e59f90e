begin;

-- Collect the identifier before a public service order or Stripe reservation is
-- created. The random order capability owns this private, encrypted evidence.
create table public.service_order_portal_lookups (
 order_id uuid primary key,
 access_token_hash text not null check(access_token_hash ~ '^[a-f0-9]{64}$'),
 product text not null check(product in ('photo_radar','rapid_resolution','bundle')),
 ticket_number text check(ticket_number ~ '^[A-Z][0-9]{8}[A-Z]$'),
 kind text not null check(kind in ('plate','drivers_license','date_of_birth')),
 ciphertext jsonb not null check(jsonb_typeof(ciphertext)='object' and coalesce(ciphertext->>'version'='2',false) and ciphertext ? 'iv' and ciphertext ? 'value'),
 value_sha256 text not null check(value_sha256 ~ '^[a-f0-9]{64}$'),
 confirmed_at timestamptz not null default now()
);
alter table public.service_order_portal_lookups enable row level security;
revoke all on public.service_order_portal_lookups from public,anon,authenticated;
grant all on public.service_order_portal_lookups to service_role;
alter table public.case_portal_verifications add column source_service_order_id uuid references public.service_orders(id);

create function public.record_service_order_portal_lookup(p_id uuid,p_access_hash text,p_product text,p_ticket text,p_kind text,p_cipher jsonb,p_hash text)
returns void language plpgsql security definer set search_path=public as $$
declare o public.service_orders; c public.service_order_portal_lookups;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,731904221::bigint));
 select * into o from public.service_orders where id=p_id for update;
 if found and (o.access_token_hash is distinct from p_access_hash or o.product is distinct from p_product
  or nullif(public.canonical_ticket_number(o.ticket_number),'') is distinct from p_ticket) then raise exception 'PRIVATE_ORDER_ACCESS_REQUIRED';end if;
 select * into c from public.service_order_portal_lookups where order_id=p_id for update;
 if found and c.access_token_hash is distinct from p_access_hash then raise exception 'PRIVATE_ORDER_ACCESS_REQUIRED';end if;
 if found and (c.product,c.ticket_number,c.kind,c.value_sha256) is not distinct from (p_product,p_ticket,p_kind,p_hash) then return;end if;
 if o.ticket_submission_id is not null and (
  exists(select 1 from public.portal_agent_jobs where submission_id=o.ticket_submission_id and action='submit_initial_disclosure'
   and (status in ('running','completed','uncertain') or result->>'phase'='committing' or nullif(result->>'session_id','') is not null))
  or exists(select 1 from public.disclosure_request_receipts where submission_id=o.ticket_submission_id)
  or exists(select 1 from public.case_portal_verifications where submission_id=o.ticket_submission_id and revoked_at is null))
  then raise exception 'LOOKUP_FORM_LOCKED';end if;
 insert into public.service_order_portal_lookups(order_id,access_token_hash,product,ticket_number,kind,ciphertext,value_sha256)
 values(p_id,p_access_hash,p_product,p_ticket,p_kind,p_cipher,p_hash)
 on conflict(order_id) do update set product=excluded.product,ticket_number=excluded.ticket_number,kind=excluded.kind,
  ciphertext=excluded.ciphertext,value_sha256=excluded.value_sha256,confirmed_at=now();
end $$;
revoke all on function public.record_service_order_portal_lookup(uuid,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_service_order_portal_lookup(uuid,text,text,text,text,jsonb,text) to service_role;

create function public.require_service_order_portal_lookup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.product<>'insurance_report' and not exists(select 1 from public.service_order_portal_lookups c where c.order_id=new.id
  and c.access_token_hash=new.access_token_hash and c.product=new.product
  and coalesce(c.ticket_number,'')=public.canonical_ticket_number(new.ticket_number)) then raise exception 'PORTAL_LOOKUP_REQUIRED';end if;
 return new;
end $$;
create trigger require_service_order_portal_lookup before insert on public.service_orders
 for each row execute function public.require_service_order_portal_lookup();

-- Previously signed full intakes already contain DOB or a DL number. Exclude
-- placeholders without requiring those clients to supply the same data again.
create function public.portal_lookup_value_valid(p_kind text,p_value text) returns boolean language plpgsql stable set search_path=public as $$
declare v text; d date;
begin
 if p_value is null or length(p_value)>60 then return false;end if;
 if p_kind='date_of_birth' then
  if trim(p_value) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
  begin d:=trim(p_value)::date;exception when others then return false;end;
  return to_char(d,'YYYY-MM-DD')=trim(p_value) and d>=date '1900-01-01' and d<=current_date;
 end if;
 if trim(p_value) !~ '^[A-Za-z0-9 .-]+$' then return false;end if;
 v:=public.canonical_ticket_number(p_value);
 if v in ('UNKNOWN','NOTSUPPLIED','NOTPROVIDED','PENDING','PLACEHOLDER','NA','NONE','NULL') or v like 'PHOTOINTAKE%' then return false;end if;
 return case p_kind when 'plate' then v ~ '^[A-Z0-9]{2,12}$' when 'drivers_license' then v ~ '^[A-Z0-9]{5,30}$' else false end;
end $$;

create function public.case_has_portal_lookup(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select public.portal_lookup_value_valid('drivers_license',to_jsonb(t)->>'drivers_license')
  or public.portal_lookup_value_valid('date_of_birth',to_jsonb(t)->>'date_of_birth')
  or exists(select 1 from public.case_portal_verifications v where v.submission_id=t.id and v.revoked_at is null
   and v.ticket_number=public.canonical_ticket_number(t.ticket_number) and v.source_path=t.ticket_document_path)
  from public.ticket_submissions t where t.id=p_id and t.deleted_at is null and t.service_type='representation'),false);
$$;
revoke all on function public.case_has_portal_lookup(uuid) from public,anon,authenticated;
grant execute on function public.case_has_portal_lookup(uuid) to service_role;

create function public.require_ticket_checkout_portal_lookup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 -- Confirmations of payments that already happened must still reconcile. A
 -- prospective reservation is inserted before create-payment calls Stripe.
 if new.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar') and new.status is distinct from 'paid'
  and (tg_op='INSERT' or new.status='creating') and not public.case_has_portal_lookup(new.ticket_submission_id)
  then raise exception 'PORTAL_LOOKUP_REQUIRED';end if;
 return new;
end $$;
create trigger require_ticket_checkout_portal_lookup before insert or update on public.idr_checkout_intents
 for each row execute function public.require_ticket_checkout_portal_lookup();

create function public.service_order_lookup_for_case(p_id uuid) returns setof public.service_order_portal_lookups
language sql volatile security definer set search_path=public as $$
 select c.* from public.service_order_portal_lookups c join public.service_orders o on o.id=c.order_id
 join public.ticket_submissions t on t.id=o.ticket_submission_id
 where coalesce(auth.role(),'')='service_role' and t.id=p_id and t.deleted_at is null and t.service_type='representation'
  and public.canonical_ticket_number(t.ticket_number) ~ '^[A-Z][0-9]{8}[A-Z]$'
  and o.access_token_hash=c.access_token_hash and o.product=c.product
  and (c.ticket_number is null or c.ticket_number=public.canonical_ticket_number(t.ticket_number))
  and (c.ticket_number=public.canonical_ticket_number(t.ticket_number)
   or (o.id=t.id and nullif(o.ticket_document_path,'') is not null and o.ticket_document_path=t.ticket_document_path));
$$;
revoke all on function public.service_order_lookup_for_case(uuid) from public,anon,authenticated;
grant execute on function public.service_order_lookup_for_case(uuid) to service_role;

create function public.attach_service_order_portal_lookup(p_order uuid,p_id uuid,p_claim_hash text,p_cipher jsonb,p_hash text,p_source text,p_source_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare t public.ticket_submissions; c public.service_order_portal_lookups; v public.case_portal_verifications; saved uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_REQUIRED';end if;
 select * into t from public.ticket_submissions where id=p_id and deleted_at is null for update;
 if not found or t.ticket_document_path is distinct from p_source or t.consent_form_path is null then raise exception 'EXACT_CONSENTED_CASE_REQUIRED';end if;
 select * into c from public.service_order_lookup_for_case(p_id) where order_id=p_order;
 if not found or c.value_sha256 is distinct from p_claim_hash then raise exception 'EXACT_ORDER_CASE_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.order_id::text,731904221::bigint));
 -- Re-read under the same lock used by client writes.
 select * into c from public.service_order_lookup_for_case(p_id) where order_id=p_order;
 if not found or c.value_sha256 is distinct from p_claim_hash then raise exception 'ORDER_LOOKUP_CHANGED';end if;
 perform pg_advisory_xact_lock(hashtextextended(public.canonical_ticket_number(t.ticket_number),731904220::bigint));
 select * into v from public.case_portal_verifications where submission_id=p_id and revoked_at is null for update;
 if found then
  if (v.kind,v.value_sha256,v.source_path,v.source_sha256) is distinct from (c.kind,p_hash,p_source,p_source_hash) then raise exception 'VERIFICATION_DETAILS_CONFLICT';end if;
  return v.id;
 end if;
 if exists(select 1 from public.portal_agent_jobs where submission_id=p_id and action='submit_initial_disclosure'
  and (status in ('completed','uncertain') or result->>'phase'='committing' or nullif(result->>'session_id','') is not null))
  or exists(select 1 from public.disclosure_request_receipts where ticket_number=public.canonical_ticket_number(t.ticket_number)) then raise exception 'LOOKUP_FORM_LOCKED';end if;
 insert into public.case_portal_verifications(submission_id,ticket_number,kind,ciphertext,value_sha256,source_path,source_sha256,source_kind,evidence,source_service_order_id)
 values(p_id,public.canonical_ticket_number(t.ticket_number),c.kind,p_cipher,p_hash,p_source,p_source_hash,'client_confirmation',
  'The client confirmed this identifier using this exact private service order. The order is bound to the identified ticket or its original verified upload.',p_order) returning id into saved;
 return saved;
end $$;
revoke all on function public.attach_service_order_portal_lookup(uuid,uuid,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.attach_service_order_portal_lookup(uuid,uuid,text,jsonb,text,text,text) to service_role;

commit;
