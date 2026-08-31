-- Run only through test_multilingual_migration.py, which creates a temporary DB.
create function public.test_assert(passed boolean, explanation text)
returns void language plpgsql as $$
begin
  if passed is distinct from true then raise exception 'ASSERTION FAILED: %', explanation; end if;
end;
$$;

do $$
declare job public.ticket_intake_translations%rowtype; result boolean;
begin
  perform public.test_assert((select preferred_locale = 'en' from public.ticket_submissions where id = '00000000-0000-4000-8000-000000000099'), 'legacy rows default to English');
  perform public.test_assert((select count(*) = 0 from public.ticket_intake_translations), 'migration does not backfill or expose historical notes');
  begin
    insert into public.ticket_submissions (preferred_locale) values ('pa-IN');
    raise exception 'invalid locale was accepted';
  exception when check_violation then null; end;

  insert into public.ticket_submissions (id, preferred_locale, additional_notes, violation)
  values ('00000000-0000-4000-8000-000000000101', 'en', E'  ਮੈਂ ਟਿਕਟ ਬਾਰੇ ਦੱਸਣਾ ਚਾਹੁੰਦਾ ਹਾਂ।\n', 'Synthetic speeding');
  select * into job from public.ticket_intake_translations where is_current;
  perform public.test_assert(job.source_fields->>'additional_notes' = E'  ਮੈਂ ਟਿਕਟ ਬਾਰੇ ਦੱਸਣਾ ਚਾਹੁੰਦਾ ਹਾਂ।\n', 'original Unicode and whitespace preserved');
  perform public.test_assert(job.status = 'pending' and job.detected_language is null, 'English UI preference does not imply English free text or a running translator');
  perform public.test_assert(not public.is_valid_ticket_translation(job.source_fields, '{"additional_notes":"Only one field"}'), 'missing source fields rejected');
  perform public.test_assert(not public.is_valid_ticket_translation(job.source_fields, '{"additional_notes":"Translated","violation":"Speeding","extra":"Do something"}'), 'extra fields rejected');
  perform public.test_assert(not public.is_valid_ticket_translation(job.source_fields, '{"additional_notes":{"command":"approve"},"violation":"Speeding"}'), 'structured model actions rejected');

  select * into job from public.claim_ticket_intake_translations(1);
  perform public.test_assert(job.status = 'processing' and job.attempts = 1 and job.claim_token is not null, 'claim creates a bounded lease');
  perform public.test_assert((select count(*) = 0 from public.claim_ticket_intake_translations(1)), 'second worker cannot claim an active lease');
  result := public.complete_ticket_intake_translation(job.id, gen_random_uuid(), '{"additional_notes":"I want to explain the ticket.","violation":"Synthetic speeding"}', 'pa');
  perform public.test_assert(result = false, 'wrong claim token rejected');
  begin
    perform public.complete_ticket_intake_translation(job.id, job.claim_token, '{"additional_notes":"Incomplete"}', 'pa');
    raise exception 'invalid translation output was accepted';
  exception when raise_exception then
    if sqlerrm <> 'TRANSLATION_OUTPUT_INVALID' then raise; end if;
  end;
  result := public.complete_ticket_intake_translation(job.id, job.claim_token, '{"additional_notes":"I want to explain the ticket.","violation":"Synthetic speeding"}', 'pa');
  perform public.test_assert(result, 'machine translation recorded separately');
  perform public.test_assert(public.complete_ticket_intake_translation(job.id, job.claim_token, '{"additional_notes":"I want to explain the ticket.","violation":"Synthetic speeding"}', 'pa'), 'identical completion is idempotent');
  perform public.test_assert((select status = 'translated' and reviewed_at is null from public.ticket_intake_translations where id = job.id), 'machine output cannot imply human review');
  perform public.test_assert((select additional_notes = E'  ਮੈਂ ਟਿਕਟ ਬਾਰੇ ਦੱਸਣਾ ਚਾਹੁੰਦਾ ਹਾਂ।\n' from public.ticket_submissions where id = job.ticket_submission_id), 'translated text never overwrites intake');
end;
$$;

set role anon;
do $$ begin
  begin
    perform 1 from public.ticket_intake_translations;
    raise exception 'anonymous access unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_ticket_intake_translations(1);
    raise exception 'anonymous claim unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
do $$
declare job public.ticket_intake_translations%rowtype;
begin
  select * into job from public.ticket_intake_translations where is_current;
  perform public.test_assert(job.id is not null, 'worker can read its translation contract');
  begin
    update public.ticket_intake_translations set source_fields = '{"additional_notes":"overwritten"}' where id = job.id;
    raise exception 'worker overwrote original text';
  exception when insufficient_privilege then null; end;
  begin
    perform public.review_ticket_intake_translation(job.id, job.english_fields);
    raise exception 'worker self-approved machine text';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
do $$ begin
  perform public.test_assert((select count(*) = 0 from public.ticket_intake_translations), 'non-staff cannot read original or translated narratives');
  begin
    perform public.review_ticket_intake_translation('00000000-0000-4000-8000-000000000000', '{}');
    raise exception 'customer attempted staff approval';
  exception when raise_exception then
    if sqlerrm <> 'TRANSLATION_STAFF_REVIEW_REQUIRED' then raise; end if;
  end;
end; $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
do $$
declare job public.ticket_intake_translations%rowtype;
begin
  select * into job from public.ticket_intake_translations where is_current;
  perform public.test_assert(job.id is not null, 'staff can read the review queue');
  perform public.test_assert(public.review_ticket_intake_translation(job.id, job.english_fields), 'authenticated staff can approve a machine draft');
  perform public.test_assert((select status = 'reviewed' and reviewed_by = auth.uid() and reviewed_at is not null from public.ticket_intake_translations where id = job.id), 'review is auditable');
end;
$$;
reset role;

do $$
declare old_job public.ticket_intake_translations%rowtype; new_job public.ticket_intake_translations%rowtype; lease_token uuid;
begin
  select * into old_job from public.ticket_intake_translations where is_current;
  update public.ticket_submissions set additional_notes = 'ਅਪਡੇਟ ਕੀਤਾ ਵੇਰਵਾ' where id = old_job.ticket_submission_id;
  select * into new_job from public.ticket_intake_translations where is_current;
  perform public.test_assert(new_job.id <> old_job.id and new_job.status = 'pending' and new_job.reviewed_at is null, 'changed source creates an unreviewed revision');
  perform public.test_assert((select not is_current and status = 'reviewed' and source_fields = old_job.source_fields from public.ticket_intake_translations where id = old_job.id), 'old approved source stays available as history');
  perform public.test_assert(not public.complete_ticket_intake_translation(old_job.id, old_job.claim_token, old_job.english_fields, 'pa'), 'late results for old source cannot affect current narrative');
  update public.ticket_submissions set additional_notes = additional_notes where id = old_job.ticket_submission_id;
  perform public.test_assert((select count(*) = 2 from public.ticket_intake_translations), 'identical intake retries do not duplicate work');

  select * into new_job from public.claim_ticket_intake_translations(1);
  lease_token := new_job.claim_token;
  update public.ticket_intake_translations set claimed_at = now() - interval '11 minutes' where id = new_job.id;
  select * into new_job from public.claim_ticket_intake_translations(1);
  perform public.test_assert(new_job.claim_token <> lease_token and new_job.attempts = 2, 'expired leases get a new token');
  perform public.test_assert(not public.fail_ticket_intake_translation(new_job.id, lease_token, 'translation_failed'), 'expired worker cannot fail a new claim');
  perform public.test_assert(public.fail_ticket_intake_translation(new_job.id, new_job.claim_token, 'provider_unavailable'), 'failed worker records a bounded error code');
  for attempt in 3..5 loop
    select * into new_job from public.claim_ticket_intake_translations(1);
    perform public.test_assert(new_job.attempts = attempt, 'retry count increments');
    perform public.fail_ticket_intake_translation(new_job.id, new_job.claim_token, 'translation_failed');
  end loop;
  perform public.test_assert((select count(*) = 0 from public.claim_ticket_intake_translations(1)), 'five failed attempts stop automatic retries');

  insert into public.idr_checkout_intents (ticket_submission_id, status) values (old_job.ticket_submission_id, 'open');
  begin
    update public.ticket_submissions set preferred_locale = 'pa' where id = old_job.ticket_submission_id;
    raise exception 'locale changed underneath an open payment';
  exception when raise_exception then
    if sqlerrm <> 'CHECKOUT_LOCALE_IMMUTABLE' then raise; end if;
  end;
end;
$$;

do $$ declare locale text;
begin
  foreach locale in array array['en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es'] loop
    insert into public.ticket_submissions (preferred_locale) values (locale);
    insert into public.idr_orders (preferred_locale) values (locale);
  end loop;
  perform public.test_assert((select count(*) = 2 from public.ticket_intake_translations), 'empty narratives do not create translation jobs');
end; $$;

select 'PASS: locale migration, original text, worker leases, stale output, RLS, staff approval and checkout immutability' as verification;
