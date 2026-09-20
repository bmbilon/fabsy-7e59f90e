begin;

-- Bearer tokens are stored only as SHA-256 hashes. Browser GETs never approve.
create table public.disclosure_portal_approvals (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.ticket_submissions(id) on delete restrict,
  ticket_number text not null check (ticket_number ~ '^[A-Z0-9]{5,30}$'),
  case_label text not null check (length(case_label) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  portal_session_id uuid not null,
  case_fingerprint text not null check (case_fingerprint ~ '^[a-f0-9]{64}$'),
  source_snapshot jsonb not null,
  consent_sha256 text not null check (consent_sha256 ~ '^[a-f0-9]{64}$'),
  terms_url text not null check (terms_url like 'https://traffictickets.alberta.ca/%'),
  terms_version text not null check (length(terms_version) between 1 and 200),
  terms_text text not null check (length(terms_text) between 40 and 60000),
  terms_sha256 text not null check (terms_sha256 ~ '^[a-f0-9]{64}$'),
  scope text not null,
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'creating' check (status in ('creating','pending','approved','rejected','revoked','consumed','delivery_failed')),
  sms_provider_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  decided_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes'),
  check (status not in ('approved','rejected','consumed') or decided_at is not null),
  check (status <> 'consumed' or consumed_at is not null)
);
create unique index disclosure_portal_one_open_approval on public.disclosure_portal_approvals(submission_id)
  where status in ('creating','pending','approved','consumed','rejected','delivery_failed');
alter table public.disclosure_portal_approvals enable row level security;
revoke all on public.disclosure_portal_approvals from public, anon, authenticated;
grant all on public.disclosure_portal_approvals to service_role;

-- Includes the fields whose change invalidates a prepared case. No personal
-- identifiers are returned by the public phone endpoint.
create function public.disclosure_approval_case_snapshot(p_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',t.id,'client_id',t.client_id,'ticket_number',regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g'),
    'first_name',t.first_name,'last_name',t.last_name,'ticket_document_path',t.ticket_document_path,
    'consent_form_path',t.consent_form_path,'intake_consent',to_jsonb(t)->'intake_consent',
    'defense_strategy',t.defense_strategy,'intake_review_status',to_jsonb(t)->>'intake_review_status',
    'intake_mode',to_jsonb(t)->>'intake_mode','ticket_type',to_jsonb(t)->>'ticket_type',
    'drivers_license',to_jsonb(t)->>'drivers_license','date_of_birth',to_jsonb(t)->>'date_of_birth',
    'client_first_name',to_jsonb(c)->>'first_name','client_last_name',to_jsonb(c)->>'last_name',
    'client_drivers_license',to_jsonb(c)->>'drivers_license','client_date_of_birth',to_jsonb(c)->>'date_of_birth',
    'representation_paid_at',t.representation_paid_at,'payment_intent_id',to_jsonb(t)->>'referral_payment_intent_id')
  from public.ticket_submissions t left join public.clients c on c.id=t.client_id where t.id=p_id;
$$;

create function public.disclosure_approval_case_eligible(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select t.service_type='representation' and t.status in ('pending','in_progress')
    and t.case_outcome is null and nullif(t.ticket_document_path,'') is not null
    and nullif(t.consent_form_path,'') is not null
    and (coalesce(to_jsonb(t)->>'intake_mode','') <> 'photo_only' or to_jsonb(t)->>'intake_review_status'='ready')
    and ((to_jsonb(t)->'intake_consent'->>'version'='photo-upload-consent-v3'
      and to_jsonb(t)->'intake_consent'->'accepted'='true'::jsonb
      and to_jsonb(t)->'intake_consent'->'pleadNotGuilty'='true'::jsonb)
      or (coalesce(to_jsonb(t)->>'intake_mode','') <> 'photo_only'
        and not coalesce((to_jsonb(t)->'intake_consent') ? 'pleadNotGuilty',false)
        and split_part(replace(coalesce(t.defense_strategy,''),E'\r',''),E'\n',1)='not_guilty'))
    and (t.representation_paid_at is not null or exists(select 1 from public.idr_checkout_intents i
      where i.ticket_submission_id=t.id and i.client_id=t.client_id and i.status='paid'
      and i.checkout_kind in ('ticket_only','ticket_with_addon','photo_radar')))
    and to_jsonb(t)->>'referral_refunded_at' is null and to_jsonb(t)->>'referral_disputed_at' is null
    and not exists(select 1 from public.referral_payment_holds h
      where h.payment_intent_id=to_jsonb(t)->>'referral_payment_intent_id'
        or exists(select 1 from public.idr_orders o where o.ticket_submission_id=t.id and o.stripe_payment_intent_id=h.payment_intent_id))
    and (select count(*) from public.ticket_submissions other where other.service_type='representation'
      and regexp_replace(upper(other.ticket_number),'[^A-Z0-9]','','g')=regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g'))=1
    and not exists(select 1 from public.disclosure_confirmations d where d.submission_id=t.id
      or regexp_replace(upper(d.ticket_number),'[^A-Z0-9]','','g')=regexp_replace(upper(t.ticket_number),'[^A-Z0-9]','','g'))
    from public.ticket_submissions t where t.id=p_id),false);
$$;

create function public.decide_disclosure_portal_approval(p_token_hash text,p_decision text,p_terms_sha256 text) returns text
language plpgsql security definer set search_path=public as $$
declare result text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
  update public.disclosure_portal_approvals set status=p_decision,decided_at=now()
    where token_hash=p_token_hash and status='pending' and expires_at>now() and terms_sha256=p_terms_sha256
    returning status into result;
  if result is null then raise exception 'APPROVAL_UNAVAILABLE'; end if;
  return result;
end $$;

create function public.consume_disclosure_portal_approval(p_id uuid,p_submission_id uuid,p_portal_session_id uuid,
  p_case_fingerprint text,p_consent_sha256 text,p_terms_sha256 text) returns boolean
language plpgsql security definer set search_path=public as $$
declare item public.disclosure_portal_approvals; changed integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into item from public.disclosure_portal_approvals where id=p_id for update;
  if not found then return false; end if;
  perform 1 from public.ticket_submissions where id=item.submission_id for share;
  if not public.disclosure_approval_case_eligible(item.submission_id)
    or item.source_snapshot is distinct from public.disclosure_approval_case_snapshot(item.submission_id) then return false; end if;
  update public.disclosure_portal_approvals set status='consumed',consumed_at=now()
    where id=p_id and submission_id=p_submission_id and portal_session_id=p_portal_session_id
      and case_fingerprint=p_case_fingerprint and consent_sha256=p_consent_sha256 and terms_sha256=p_terms_sha256
      and status='approved' and expires_at>now();
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke all on function public.disclosure_approval_case_snapshot(uuid),public.disclosure_approval_case_eligible(uuid),
  public.decide_disclosure_portal_approval(text,text,text),public.consume_disclosure_portal_approval(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.disclosure_approval_case_snapshot(uuid),public.disclosure_approval_case_eligible(uuid),
  public.decide_disclosure_portal_approval(text,text,text),public.consume_disclosure_portal_approval(uuid,uuid,uuid,text,text,text)
  to service_role;
comment on table public.disclosure_portal_approvals is 'Case-specific phone approval of captured Alberta portal terms for one live prepared browser session. Consumption is not evidence that the portal submission succeeded. Never retry a consumed approval.';
commit;
