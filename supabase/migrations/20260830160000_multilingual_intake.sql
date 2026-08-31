-- Wave 1 locale preferences and a private translation handoff. This migration
-- does not connect a translator, send a message, or release a localized service.
begin;

alter table public.ticket_submissions
  add column if not exists preferred_locale text not null default 'en';
alter table public.ticket_submissions
  add constraint ticket_submissions_preferred_locale_check
  check (preferred_locale in ('en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es'));

alter table public.idr_orders
  add column if not exists preferred_locale text not null default 'en';
alter table public.idr_orders
  add constraint idr_orders_preferred_locale_check
  check (preferred_locale in ('en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es'));

comment on column public.ticket_submissions.preferred_locale is
  'Validated communication preference captured by intake, not an assertion about the language of user-authored text.';
comment on column public.idr_orders.preferred_locale is
  'Communication preference carried from the signed Stripe checkout metadata; legacy orders default to English.';

create or replace function public.protect_ticket_locale_during_checkout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.preferred_locale is distinct from old.preferred_locale and exists (
    select 1 from public.idr_checkout_intents i
    where i.ticket_submission_id = old.id and i.status in ('creating', 'open', 'paid')
  ) then
    raise exception 'CHECKOUT_LOCALE_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger protect_ticket_locale_during_checkout
  before update of preferred_locale on public.ticket_submissions
  for each row execute function public.protect_ticket_locale_during_checkout();
revoke all on function public.protect_ticket_locale_during_checkout() from public, anon, authenticated;

create or replace function public.is_valid_ticket_translation(source_fields jsonb, english_fields jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare field record;
begin
  if source_fields is null or english_fields is null or
     jsonb_typeof(source_fields) <> 'object' or jsonb_typeof(english_fields) <> 'object' or
     octet_length(english_fields::text) > 60000 or
     (select array_agg(k order by k) from jsonb_object_keys(source_fields) k) is distinct from
     (select array_agg(k order by k) from jsonb_object_keys(english_fields) k) then
    return false;
  end if;
  for field in select key, value from jsonb_each(english_fields) loop
    if jsonb_typeof(field.value) <> 'string' or
       length(btrim(field.value #>> '{}')) = 0 or
       length(field.value #>> '{}') > 10000 then
      return false;
    end if;
  end loop;
  return source_fields <> '{}'::jsonb;
end;
$$;

create table public.ticket_intake_translations (
  id uuid primary key default gen_random_uuid(),
  ticket_submission_id uuid not null references public.ticket_submissions(id) on delete cascade,
  preferred_locale text not null check (preferred_locale in ('en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es')),
  target_locale text not null default 'en' check (target_locale = 'en'),
  source_fields jsonb not null check (
    jsonb_typeof(source_fields) = 'object' and source_fields <> '{}'::jsonb and octet_length(source_fields::text) <= 40000
  ),
  english_fields jsonb,
  detected_language text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'translated', 'reviewed', 'failed')),
  is_current boolean not null default true,
  attempts integer not null default 0 check (attempts between 0 and 5),
  claim_token uuid,
  claimed_at timestamptz,
  last_error_code text,
  translated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint ticket_translation_output_check check (
    (english_fields is null and status in ('pending', 'processing', 'failed')) or
    (status in ('translated', 'reviewed') and public.is_valid_ticket_translation(source_fields, english_fields))
  ),
  constraint ticket_translation_review_check check (
    (status = 'reviewed' and reviewed_by is not null and reviewed_at is not null) or
    (status <> 'reviewed' and reviewed_by is null and reviewed_at is null)
  )
);
create unique index ticket_intake_translations_current_idx
  on public.ticket_intake_translations (ticket_submission_id) where is_current;
create index ticket_intake_translations_pending_idx
  on public.ticket_intake_translations (created_at) where is_current and status in ('pending', 'processing', 'failed');

alter table public.ticket_intake_translations enable row level security;
revoke all on public.ticket_intake_translations from public, anon, authenticated, service_role;
grant select on public.ticket_intake_translations to authenticated, service_role;
create policy "Only staff can read intake translations" on public.ticket_intake_translations
  for select to authenticated using (public.is_idr_staff());
-- Workers only have these RPC mutation lanes. Native client accounts cannot
-- queue, replace or approve a translated narrative by changing a JSON payload.

create or replace function public.queue_ticket_intake_translation()
returns trigger language plpgsql security definer set search_path = public as $$
declare original_fields jsonb;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into original_fields
  from jsonb_each(jsonb_build_object(
    'additional_notes', new.additional_notes,
    'defense_strategy', new.defense_strategy,
    'violation', new.violation
  )) where jsonb_typeof(value) = 'string' and length(btrim(value #>> '{}')) > 0;

  if exists (
    select 1 from public.ticket_intake_translations t
    where t.ticket_submission_id = new.id and t.is_current
      and t.source_fields = original_fields and t.preferred_locale = new.preferred_locale
  ) then return new; end if;

  -- Retain each original revision. A late translator result for an old revision
  -- cannot replace the current narrative or inherit a previous human approval.
  update public.ticket_intake_translations set is_current = false
  where ticket_submission_id = new.id and is_current;
  if original_fields <> '{}'::jsonb then
    insert into public.ticket_intake_translations (ticket_submission_id, preferred_locale, source_fields)
    values (new.id, new.preferred_locale, original_fields);
  end if;
  return new;
end;
$$;
create trigger queue_ticket_intake_translation
  after insert or update of additional_notes, defense_strategy, violation, preferred_locale
  on public.ticket_submissions for each row execute function public.queue_ticket_intake_translation();
revoke all on function public.queue_ticket_intake_translation() from public, anon, authenticated;

create or replace function public.claim_ticket_intake_translations(p_limit integer default 10)
returns setof public.ticket_intake_translations
language plpgsql security definer set search_path = public as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'TRANSLATION_BATCH_INVALID'; end if;
  return query
  with candidates as (
    select t.id from public.ticket_intake_translations t
    where t.is_current and t.attempts < 5 and (
      t.status in ('pending', 'failed') or
      (t.status = 'processing' and t.claimed_at < now() - interval '10 minutes')
    ) order by t.created_at, t.id for update skip locked limit p_limit
  )
  update public.ticket_intake_translations t
  set status = 'processing', claim_token = gen_random_uuid(), claimed_at = now(),
      attempts = t.attempts + 1, last_error_code = null
  from candidates c where t.id = c.id returning t.*;
end;
$$;

create or replace function public.complete_ticket_intake_translation(
  p_id uuid, p_claim_token uuid, p_english_fields jsonb, p_detected_language text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare job public.ticket_intake_translations%rowtype;
begin
  select * into job from public.ticket_intake_translations where id = p_id for update;
  if not found or not job.is_current or job.claim_token is distinct from p_claim_token or p_claim_token is null then
    return false;
  end if;
  if p_detected_language is null or p_detected_language !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$' or
     not public.is_valid_ticket_translation(job.source_fields, p_english_fields) then
    raise exception 'TRANSLATION_OUTPUT_INVALID';
  end if;
  if job.status = 'translated' then
    return job.english_fields = p_english_fields and job.detected_language = p_detected_language;
  end if;
  if job.status <> 'processing' then return false; end if;
  update public.ticket_intake_translations
  set english_fields = p_english_fields, detected_language = p_detected_language,
      status = 'translated', translated_at = now(), claimed_at = null, last_error_code = null
  where id = p_id;
  return true;
end;
$$;

create or replace function public.fail_ticket_intake_translation(p_id uuid, p_claim_token uuid, p_error_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if p_error_code is null or p_error_code not in ('provider_unavailable', 'translation_failed', 'invalid_output') then
    raise exception 'TRANSLATION_ERROR_CODE_INVALID';
  end if;
  update public.ticket_intake_translations set status = 'failed', claimed_at = null, last_error_code = p_error_code
  where id = p_id and claim_token = p_claim_token and is_current and status = 'processing';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.review_ticket_intake_translation(p_id uuid, p_english_fields jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare job public.ticket_intake_translations%rowtype;
begin
  -- The translator service role cannot self-certify human review.
  if auth.uid() is null or auth.role() <> 'authenticated' or not coalesce(public.is_idr_staff(), false) then
    raise exception 'TRANSLATION_STAFF_REVIEW_REQUIRED';
  end if;
  select * into job from public.ticket_intake_translations where id = p_id for update;
  if not found or not job.is_current or job.status <> 'translated' then return false; end if;
  if not public.is_valid_ticket_translation(job.source_fields, p_english_fields) then
    raise exception 'TRANSLATION_OUTPUT_INVALID';
  end if;
  update public.ticket_intake_translations set english_fields = p_english_fields,
    status = 'reviewed', reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  return true;
end;
$$;

revoke all on function public.claim_ticket_intake_translations(integer) from public, anon, authenticated;
revoke all on function public.complete_ticket_intake_translation(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.fail_ticket_intake_translation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.review_ticket_intake_translation(uuid, jsonb) from public, anon, service_role;
grant execute on function public.claim_ticket_intake_translations(integer) to service_role;
grant execute on function public.complete_ticket_intake_translation(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.fail_ticket_intake_translation(uuid, uuid, text) to service_role;
grant execute on function public.review_ticket_intake_translation(uuid, jsonb) to authenticated;

comment on table public.ticket_intake_translations is
  'Private English-review handoff. Original free text is immutable per revision; machine outputs are drafts until staff approval. Pending rows do not imply a configured translator.';
comment on function public.claim_ticket_intake_translations(integer) is
  'Optional trusted automation contract; 10 minute claims, five attempts, no outbound connection or scheduler is installed.';
commit;
