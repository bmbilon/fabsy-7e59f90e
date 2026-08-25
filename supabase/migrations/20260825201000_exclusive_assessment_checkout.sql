-- Serialize the $149 standalone review checkout and the $488 representation
-- checkout that includes the same review. Stripe idempotency prevents duplicate
-- sessions inside one lane; this claim closes the race between the two lanes.

begin;

create table if not exists public.assessment_checkout_claims (
  source_assessment_id uuid primary key
    references public.ticket_submissions(id) on delete restrict,
  checkout_intent_id uuid not null unique
    references public.idr_checkout_intents(id) on delete restrict,
  checkout_attempt integer not null check (checkout_attempt > 0),
  claim_kind text not null
    check (claim_kind in ('standalone', 'included_representation')),
  stripe_checkout_session_id text,
  status text not null default 'active'
    check (status in ('active', 'released', 'paid')),
  claimed_at timestamptz not null default now(),
  released_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint assessment_checkout_claim_state_check check (
    (status = 'active' and released_at is null and paid_at is null) or
    (status = 'released' and released_at is not null and paid_at is null) or
    (status = 'paid' and released_at is null and paid_at is not null)
  )
);

create unique index if not exists assessment_checkout_claims_stripe_session_idx
  on public.assessment_checkout_claims (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.assessment_checkout_claims enable row level security;

drop trigger if exists update_assessment_checkout_claims_updated_at
  on public.assessment_checkout_claims;
create trigger update_assessment_checkout_claims_updated_at
  before update on public.assessment_checkout_claims
  for each row execute function public.update_updated_at_column();

-- Refuse to silently choose a winner if deployment finds checkout sessions that
-- already conflict. Operations can expire the stale Stripe session and repair
-- its intent before applying this migration.
do $$
begin
  if exists (
    with active_claim_candidates as (
      select intent.ticket_submission_id as source_assessment_id
      from public.idr_checkout_intents intent
      where intent.type = 'assessment'
        and intent.checkout_kind = 'ticket_assessment'
        and intent.status in ('creating', 'open', 'paid')

      union all

      select representation.source_assessment_id
      from public.idr_checkout_intents intent
      join public.ticket_submissions representation
        on representation.id = intent.ticket_submission_id
      where intent.checkout_kind in ('ticket_only', 'ticket_with_addon')
        and intent.status in ('creating', 'open', 'paid')
        and representation.representation_includes_assessment
        and representation.source_assessment_id is not null
    )
    select 1
    from active_claim_candidates
    where source_assessment_id is not null
    group by source_assessment_id
    having count(*) > 1
  ) then
    raise exception 'ASSESSMENT_CHECKOUT_EXISTING_CONFLICT';
  end if;
end;
$$;

-- Preserve any session that was already open when this migration was applied.
insert into public.assessment_checkout_claims (
  source_assessment_id,
  checkout_intent_id,
  checkout_attempt,
  claim_kind,
  stripe_checkout_session_id,
  status,
  claimed_at,
  paid_at
)
select
  candidates.source_assessment_id,
  candidates.checkout_intent_id,
  candidates.checkout_attempt,
  candidates.claim_kind,
  candidates.stripe_checkout_session_id,
  candidates.claim_status,
  candidates.claimed_at,
  case when candidates.claim_status = 'paid' then candidates.updated_at end
from (
  select
    intent.ticket_submission_id as source_assessment_id,
    intent.id as checkout_intent_id,
    intent.attempts as checkout_attempt,
    'standalone'::text as claim_kind,
    intent.stripe_checkout_session_id,
    case when intent.status = 'paid' then 'paid' else 'active' end as claim_status,
    intent.created_at as claimed_at,
    intent.updated_at
  from public.idr_checkout_intents intent
  where intent.type = 'assessment'
    and intent.checkout_kind = 'ticket_assessment'
    and intent.status in ('creating', 'open', 'paid')

  union all

  select
    representation.source_assessment_id,
    intent.id,
    intent.attempts,
    'included_representation'::text,
    intent.stripe_checkout_session_id,
    case when intent.status = 'paid' then 'paid' else 'active' end,
    intent.created_at,
    intent.updated_at
  from public.idr_checkout_intents intent
  join public.ticket_submissions representation
    on representation.id = intent.ticket_submission_id
  where intent.checkout_kind in ('ticket_only', 'ticket_with_addon')
    and intent.status in ('creating', 'open', 'paid')
    and representation.representation_includes_assessment
    and representation.source_assessment_id is not null
) candidates
where candidates.source_assessment_id is not null
on conflict (source_assessment_id) do nothing;

create or replace function public.claim_source_assessment_checkout(
  p_source_assessment_id uuid,
  p_checkout_intent_id uuid,
  p_checkout_attempt integer,
  p_claim_kind text,
  p_stripe_checkout_session_id text default null
)
returns setof public.assessment_checkout_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  source_assessment public.ticket_submissions%rowtype;
  checkout_intent public.idr_checkout_intents%rowtype;
  representation public.ticket_submissions%rowtype;
  existing_claim public.assessment_checkout_claims%rowtype;
  reserved_claim public.assessment_checkout_claims%rowtype;
begin
  if p_source_assessment_id is null or
     p_checkout_intent_id is null or
     p_checkout_attempt is null or
     p_checkout_attempt < 1 or
     p_claim_kind not in ('standalone', 'included_representation') or
     (p_stripe_checkout_session_id is not null and trim(p_stripe_checkout_session_id) = '') then
    raise exception 'ASSESSMENT_CHECKOUT_INVALID_CLAIM';
  end if;

  -- Every checkout lane for this assessment takes the same transaction lock.
  perform pg_advisory_xact_lock(hashtextextended(p_source_assessment_id::text, 42));

  select * into source_assessment
  from public.ticket_submissions
  where id = p_source_assessment_id
  for update;

  if not found or
     source_assessment.service_type <> 'ticket_insurance_assessment' or
     source_assessment.assessment_paid_at is not null then
    raise exception 'ASSESSMENT_CHECKOUT_SOURCE_UNAVAILABLE';
  end if;

  select * into checkout_intent
  from public.idr_checkout_intents
  where id = p_checkout_intent_id
  for update;

  if not found or
     checkout_intent.attempts <> p_checkout_attempt or
     checkout_intent.status not in ('creating', 'open') or
     (
       p_stripe_checkout_session_id is not null and
       checkout_intent.stripe_checkout_session_id is not null and
       checkout_intent.stripe_checkout_session_id <> p_stripe_checkout_session_id
     ) then
    raise exception 'ASSESSMENT_CHECKOUT_INVALID_INTENT';
  end if;

  if p_claim_kind = 'standalone' then
    if checkout_intent.type <> 'assessment' or
       checkout_intent.checkout_kind <> 'ticket_assessment' or
       checkout_intent.expected_amount_cents <> 14900 or
       checkout_intent.ticket_submission_id <> p_source_assessment_id then
      raise exception 'ASSESSMENT_CHECKOUT_INVALID_INTENT';
    end if;
  else
    if checkout_intent.checkout_kind not in ('ticket_only', 'ticket_with_addon') or
       checkout_intent.type not in ('ticket', 'addon') or
       checkout_intent.ticket_submission_id is null then
      raise exception 'ASSESSMENT_CHECKOUT_INVALID_INTENT';
    end if;

    select * into representation
    from public.ticket_submissions
    where id = checkout_intent.ticket_submission_id;

    if not found or
       representation.service_type <> 'representation' or
       not representation.representation_includes_assessment or
       representation.source_assessment_id <> p_source_assessment_id then
      raise exception 'ASSESSMENT_CHECKOUT_INVALID_INTENT';
    end if;
  end if;

  select * into existing_claim
  from public.assessment_checkout_claims
  where source_assessment_id = p_source_assessment_id
  for update;

  if found and existing_claim.status in ('active', 'paid') then
    if existing_claim.checkout_intent_id <> p_checkout_intent_id or
       existing_claim.checkout_attempt <> p_checkout_attempt or
       existing_claim.claim_kind <> p_claim_kind or
       (
         p_stripe_checkout_session_id is not null and
         existing_claim.stripe_checkout_session_id is not null and
         existing_claim.stripe_checkout_session_id <> p_stripe_checkout_session_id
       ) then
      raise exception 'ASSESSMENT_CHECKOUT_ALREADY_RESERVED';
    end if;

    if existing_claim.status = 'paid' then
      raise exception 'ASSESSMENT_CHECKOUT_SOURCE_UNAVAILABLE';
    end if;

    if p_stripe_checkout_session_id is not null and
       existing_claim.stripe_checkout_session_id is null then
      update public.assessment_checkout_claims
      set stripe_checkout_session_id = p_stripe_checkout_session_id
      where source_assessment_id = p_source_assessment_id
      returning * into reserved_claim;
    else
      reserved_claim := existing_claim;
    end if;

    return next reserved_claim;
    return;
  end if;

  insert into public.assessment_checkout_claims (
    source_assessment_id,
    checkout_intent_id,
    checkout_attempt,
    claim_kind,
    stripe_checkout_session_id,
    status,
    claimed_at,
    released_at,
    paid_at
  ) values (
    p_source_assessment_id,
    p_checkout_intent_id,
    p_checkout_attempt,
    p_claim_kind,
    p_stripe_checkout_session_id,
    'active',
    now(),
    null,
    null
  )
  on conflict (source_assessment_id) do update set
    checkout_intent_id = excluded.checkout_intent_id,
    checkout_attempt = excluded.checkout_attempt,
    claim_kind = excluded.claim_kind,
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    status = 'active',
    claimed_at = now(),
    released_at = null,
    paid_at = null
  where public.assessment_checkout_claims.status = 'released'
  returning * into reserved_claim;

  if reserved_claim.source_assessment_id is null then
    raise exception 'ASSESSMENT_CHECKOUT_ALREADY_RESERVED';
  end if;

  return next reserved_claim;
end;
$$;

create or replace function public.release_source_assessment_checkout(
  p_checkout_intent_id uuid,
  p_checkout_attempt integer,
  p_stripe_checkout_session_id text,
  p_intent_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_claim public.assessment_checkout_claims%rowtype;
begin
  if p_checkout_intent_id is null or
     p_checkout_attempt is null or
     p_checkout_attempt < 1 or
     p_intent_status not in ('failed', 'expired') or
     (p_stripe_checkout_session_id is not null and trim(p_stripe_checkout_session_id) = '') then
    raise exception 'ASSESSMENT_CHECKOUT_INVALID_RELEASE';
  end if;

  select * into current_claim
  from public.assessment_checkout_claims
  where checkout_intent_id = p_checkout_intent_id
  for update;

  if not found then
    return false;
  end if;

  if current_claim.checkout_attempt <> p_checkout_attempt or
     (
       (p_stripe_checkout_session_id is null and current_claim.stripe_checkout_session_id is not null) or
       (p_stripe_checkout_session_id is not null and
        current_claim.stripe_checkout_session_id is not null and
        current_claim.stripe_checkout_session_id <> p_stripe_checkout_session_id)
     ) then
    return false;
  end if;

  if current_claim.status = 'released' then
    return true;
  end if;
  if current_claim.status <> 'active' then
    return false;
  end if;

  update public.idr_checkout_intents
  set status = p_intent_status,
      stripe_checkout_session_id = null
  where id = p_checkout_intent_id
    and attempts = p_checkout_attempt
    and status <> 'paid'
    and (
      (p_stripe_checkout_session_id is null and stripe_checkout_session_id is null) or
      (p_stripe_checkout_session_id is not null and
       (stripe_checkout_session_id is null or stripe_checkout_session_id = p_stripe_checkout_session_id))
    );

  if not found then
    raise exception 'ASSESSMENT_CHECKOUT_RELEASE_INTENT_MISMATCH';
  end if;

  update public.assessment_checkout_claims
  set status = 'released',
      stripe_checkout_session_id = coalesce(
        stripe_checkout_session_id,
        p_stripe_checkout_session_id
      ),
      released_at = now(),
      paid_at = null
  where source_assessment_id = current_claim.source_assessment_id;

  if current_claim.claim_kind = 'standalone' then
    update public.ticket_submissions
    set status = 'assessment_awaiting_payment',
        assessment_checkout_session_id = null,
        updated_at = now()
    where id = current_claim.source_assessment_id
      and assessment_paid_at is null
      and (
        assessment_checkout_session_id is null or
        assessment_checkout_session_id = p_stripe_checkout_session_id
      );
  end if;

  return true;
end;
$$;

create or replace function public.mark_source_assessment_checkout_paid(
  p_checkout_intent_id uuid,
  p_checkout_attempt integer,
  p_stripe_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_claim public.assessment_checkout_claims%rowtype;
begin
  if p_checkout_intent_id is null or
     p_checkout_attempt is null or
     p_checkout_attempt < 1 or
     p_stripe_checkout_session_id is null or
     trim(p_stripe_checkout_session_id) = '' then
    raise exception 'ASSESSMENT_CHECKOUT_INVALID_PAYMENT';
  end if;

  select * into current_claim
  from public.assessment_checkout_claims
  where checkout_intent_id = p_checkout_intent_id
  for update;

  if not found or
     current_claim.checkout_attempt <> p_checkout_attempt or
     current_claim.stripe_checkout_session_id <> p_stripe_checkout_session_id then
    raise exception 'ASSESSMENT_CHECKOUT_PAYMENT_MISMATCH';
  end if;

  if current_claim.status = 'paid' then
    return true;
  end if;
  if current_claim.status <> 'active' then
    raise exception 'ASSESSMENT_CHECKOUT_PAYMENT_MISMATCH';
  end if;

  update public.assessment_checkout_claims
  set status = 'paid',
      released_at = null,
      paid_at = now()
  where source_assessment_id = current_claim.source_assessment_id;

  return true;
end;
$$;

revoke all on table public.assessment_checkout_claims
  from public, anon, authenticated;
revoke all on function public.claim_source_assessment_checkout(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.release_source_assessment_checkout(uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_source_assessment_checkout_paid(uuid, integer, text)
  from public, anon, authenticated;

grant execute on function public.claim_source_assessment_checkout(uuid, uuid, integer, text, text)
  to service_role;
grant execute on function public.release_source_assessment_checkout(uuid, integer, text, text)
  to service_role;
grant execute on function public.mark_source_assessment_checkout_paid(uuid, integer, text)
  to service_role;

comment on table public.assessment_checkout_claims is
  'The single active or paid Stripe checkout allowed to consume a source assessment.';
comment on function public.claim_source_assessment_checkout(uuid, uuid, integer, text, text) is
  'Atomically reserves a source assessment for either its $149 checkout or one included $488 representation checkout.';
comment on function public.release_source_assessment_checkout(uuid, integer, text, text) is
  'Atomically releases only the exact failed or expired checkout attempt and its source-assessment claim.';
comment on function public.mark_source_assessment_checkout_paid(uuid, integer, text) is
  'Idempotently seals the exact source-assessment checkout claim after verified Stripe payment.';

commit;
