-- AnderHue practice files: catalog parity, intake, file numbers, stage
-- notices, the notice outbox, the client portal, staff documents and practice
-- isolation.
--
-- Run with psql from the repository root against a database that has the LTB
-- and practice files migrations applied (scripts/test-practice-sql.sh builds
-- one from scratch). Everything happens inside one transaction that is rolled
-- back. With -v harness=1 (throwaway databases only) it also pushes the file
-- number sequences past 9999; sequences are not transactional, so their
-- previous values are restored afterwards.
\set ON_ERROR_STOP 1
\set catalog_markers `grep '^-- catalog:' supabase/migrations/20261001150000_anderhue_practice_files.sql`
begin;

create function pg_temp.ok(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'Practice test failed: %', label; end if;
end $$;

-- Requires p_sql to fail with p_expected: an exception message such as
-- PRACTICE_STAGE_INVALID, or a SQLSTATE such as 42501. Its effects roll back.
create function pg_temp.fails(p_sql text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then
      return;
    end if;
    raise exception 'Practice test failed: % (expected %, got %: %)', p_label, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'Practice test failed: % (expected %, but it succeeded)', p_label, p_expected;
end $$;

-- Object key sets, for JSON shape checks.
create function pg_temp.keys(p_value jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(k order by k collate "C"), '{}') from jsonb_object_keys(p_value) k;
$$;
create function pg_temp.sorted(p_values text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(v order by v collate "C"), '{}') from unnest(p_values) v;
$$;

insert into auth.users (id, email) values
  ('72100000-0000-4000-8000-000000000001', 'licensee@anderhue.test'),
  ('72100000-0000-4000-8000-000000000002', 'fabsy-admin@test'),
  ('72100000-0000-4000-8000-000000000003', 'fabsy-case-manager@test'),
  ('72100000-0000-4000-8000-000000000004', 'clerk@other-practice.test');
insert into public.user_roles (user_id, role) values
  ('72100000-0000-4000-8000-000000000002', 'admin'),
  ('72100000-0000-4000-8000-000000000003', 'case_manager');
insert into public.ltb_practice_members (practice_id, user_id, role) values
  ('anderhue-paralegal', '72100000-0000-4000-8000-000000000001', 'licensee');
-- A second tenant with client emails off and messy alert recipients.
insert into public.ltb_practices (id, name, licensee_name, alert_emails, display_name, public_email, phone,
  client_email_from, client_reply_to)
values ('other-practice', 'Other Practice Professional Corporation', 'Olive Other',
  array['Desk@Other-Practice.test', 'desk@other-practice.test', 'not an address'], 'Other Practice',
  'hello@other-practice.test', '(416) 555-0000', 'Other Practice <files@other-practice.test>',
  'hello@other-practice.test');
insert into public.ltb_practice_members (practice_id, user_id, role) values
  ('other-practice', '72100000-0000-4000-8000-000000000004', 'clerk');

-- ---------------------------------------------------------------------------
-- 1. Catalog markers against the SQL lists, CHECK constraints and triggers
-- ---------------------------------------------------------------------------
create temp table catalog_lists on commit drop as
select r.m[1] as list, r.m[2] as area, string_to_array(r.m[3], ',') as items
from regexp_matches(:'catalog_markers', '-- catalog:(stages|notify|outcomes):([a-z]+)=([a-z_,]+)', 'g') as r(m);

select pg_temp.ok((select count(*) = 8 from catalog_lists),
  'eight catalog markers read from the migration (run psql from the repository root)');
select pg_temp.ok((select count(*) = 3 and bool_and(items = public.practice_stages(area))
  from catalog_lists where list = 'stages'), 'practice_stages matches the stage markers');
select pg_temp.ok((select count(*) = 3 and bool_and(items = public.practice_notify_stages(area))
  from catalog_lists where list = 'notify'), 'practice_notify_stages matches the notify markers');
select pg_temp.ok((select count(*) = 2 and bool_and(items = public.practice_outcomes(area))
  from catalog_lists where list = 'outcomes'), 'practice_outcomes matches the outcome markers');
select pg_temp.ok(public.practice_outcomes('ltb') = array['order_obtained', 'settled', 'tenant_paid', 'withdrawn',
  'dismissed', 'other'], 'LTB outcomes match the catalog');

-- Scratch files for the constraint and trigger probes (removed afterwards).
insert into public.ltb_clients (id, practice_id, email) values
  ('72300000-0000-4000-8000-000000000001', 'anderhue-paralegal', 'scratch@example.com');
insert into public.ltb_cases (id, practice_id, client_id, source) values
  ('72300000-0000-4000-8000-000000000002', 'anderhue-paralegal', '72300000-0000-4000-8000-000000000001', 'staff');
insert into public.practice_matters (id, practice_id, client_id, area, source) values
  ('72300000-0000-4000-8000-000000000003', 'anderhue-paralegal', '72300000-0000-4000-8000-000000000001', 'traffic', 'staff'),
  ('72300000-0000-4000-8000-000000000004', 'anderhue-paralegal', '72300000-0000-4000-8000-000000000001', 'general', 'staff');

do $$
declare
  v_files constant jsonb := '{"ltb": "72300000-0000-4000-8000-000000000002",
    "traffic": "72300000-0000-4000-8000-000000000003", "general": "72300000-0000-4000-8000-000000000004"}';
  v_known_stages text[];
  v_known_outcomes text[];
  r record;
  v_value text;
  v_id uuid;
  v_accepted boolean;
  v_notified boolean;
begin
  select array_agg(distinct s) into v_known_stages
    from catalog_lists l cross join unnest(l.items) s where l.list = 'stages';
  select array_agg(distinct o) into v_known_outcomes
    from unnest(public.practice_outcomes('ltb') || public.practice_outcomes('traffic')
      || public.practice_outcomes('general')) o;

  -- Each stage CHECK accepts exactly its area's stages among all known stages.
  for r in select * from catalog_lists where list = 'stages' loop
    v_id := (v_files->>r.area)::uuid;
    foreach v_value in array v_known_stages loop
      begin
        if r.area = 'ltb' then
          update public.ltb_cases set stage = v_value,
            outcome = case v_value when 'closed' then 'other' when 'declined' then 'declined' end,
            closed_at = case when v_value in ('closed', 'declined') then now() end
          where id = v_id;
        else
          update public.practice_matters set stage = v_value,
            outcome = case v_value when 'closed' then 'other' when 'declined' then 'declined' end,
            closed_at = case when v_value in ('closed', 'declined') then now() end
          where id = v_id;
        end if;
        raise exception 'probe accepted';
      exception
        when check_violation then v_accepted := false;
        when raise_exception then
          if sqlerrm <> 'probe accepted' then raise; end if;
          v_accepted := true;
      end;
      if v_accepted is distinct from (v_value = any (r.items)) then
        raise exception 'Practice test failed: % stage % accepted=% by its CHECK constraint', r.area, v_value, v_accepted;
      end if;
    end loop;
  end loop;

  -- Each outcome CHECK accepts exactly its area's closing outcomes.
  for r in select 'ltb' as area, public.practice_outcomes('ltb') as items
           union all select l.area, l.items from catalog_lists l where l.list = 'outcomes' loop
    v_id := (v_files->>r.area)::uuid;
    foreach v_value in array v_known_outcomes loop
      begin
        if r.area = 'ltb' then
          update public.ltb_cases set stage = 'closed', outcome = v_value, closed_at = now() where id = v_id;
        else
          update public.practice_matters set stage = 'closed', outcome = v_value, closed_at = now() where id = v_id;
        end if;
        raise exception 'probe accepted';
      exception
        when check_violation then v_accepted := false;
        when raise_exception then
          if sqlerrm <> 'probe accepted' then raise; end if;
          v_accepted := true;
      end;
      if v_accepted is distinct from (v_value = any (r.items)) then
        raise exception 'Practice test failed: % outcome % accepted=% by its CHECK constraint', r.area, v_value, v_accepted;
      end if;
    end loop;
  end loop;

  -- Moving into a stage through practice_set_stage (practice.notify = 'on')
  -- queues a client email exactly for the notify markers.
  for r in select * from catalog_lists where list = 'notify' loop
    v_id := (v_files->>r.area)::uuid;
    foreach v_value in array public.practice_stages(r.area) loop
      begin
        update public.ltb_practices set client_updates_enabled = true where id = 'anderhue-paralegal';
        perform set_config('practice.notify', 'on', true);
        if r.area = 'ltb' then
          update public.ltb_cases set stage = v_value,
            outcome = case v_value when 'closed' then 'other' when 'declined' then 'declined' end,
            closed_at = case when v_value in ('closed', 'declined') then now() end
          where id = v_id;
        else
          update public.practice_matters set stage = v_value,
            outcome = case v_value when 'closed' then 'other' when 'declined' then 'declined' end,
            closed_at = case when v_value in ('closed', 'declined') then now() end
          where id = v_id;
        end if;
        v_notified := exists (select 1 from public.practice_notices n
          where n.case_id = v_id and n.kind = 'stage_changed' and n.detail->>'stage' = v_value);
        raise exception 'probe accepted';
      exception when raise_exception then
        if sqlerrm <> 'probe accepted' then raise; end if;
      end;
      if v_notified is distinct from (v_value = any (r.items)) then
        raise exception 'Practice test failed: % stage % notified=% by the stage trigger', r.area, v_value, v_notified;
      end if;
    end loop;
  end loop;

  -- Any other path that moves a stage (no practice.notify) never emails clients.
  for r in select * from catalog_lists where list = 'notify' loop
    v_id := (v_files->>r.area)::uuid;
    foreach v_value in array r.items loop
      begin
        update public.ltb_practices set client_updates_enabled = true where id = 'anderhue-paralegal';
        if r.area = 'ltb' then
          update public.ltb_cases set stage = v_value,
            outcome = case v_value when 'closed' then 'other' when 'declined' then 'declined' end,
            closed_at = case when v_value in ('closed', 'declined') then now() end
          where id = v_id;
        else
          update public.practice_matters set stage = v_value,
            outcome = case v_value when 'closed' then 'other' when 'declined' then 'declined' end,
            closed_at = case when v_value in ('closed', 'declined') then now() end
          where id = v_id;
        end if;
        v_notified := exists (select 1 from public.practice_notices n where n.case_id = v_id);
        raise exception 'probe accepted';
      exception when raise_exception then
        if sqlerrm <> 'probe accepted' then raise; end if;
      end;
      if v_notified then
        raise exception 'Practice test failed: % stage % emailed the client without practice_set_stage', r.area, v_value;
      end if;
    end loop;
  end loop;
end $$;

select pg_temp.fails($$update public.practice_matters set stage = 'closed', outcome = 'declined', closed_at = now()
  where id = '72300000-0000-4000-8000-000000000003'$$, '23514', 'declined is only stored for declined files');
select pg_temp.fails($$update public.practice_matters set stage = 'closed', outcome = 'withdrawn'
  where id = '72300000-0000-4000-8000-000000000003'$$, '23514', 'closed files carry closed_at');
select pg_temp.fails($$update public.practice_matters set category = 'tribunal'
  where id = '72300000-0000-4000-8000-000000000003'$$, '23514', 'traffic files have no category');
select pg_temp.fails($$update public.practice_matters set ticket_type = 'speeding'
  where id = '72300000-0000-4000-8000-000000000004'$$, '23514', 'other matters have no ticket type');
select pg_temp.fails($$update public.practice_matters set client_request_message = 'x'
  where id = '72300000-0000-4000-8000-000000000004'$$, '23514', 'a request needs its timestamp');

delete from public.practice_matters where id in ('72300000-0000-4000-8000-000000000003', '72300000-0000-4000-8000-000000000004');
delete from public.ltb_cases where id = '72300000-0000-4000-8000-000000000002';
delete from public.ltb_clients where id = '72300000-0000-4000-8000-000000000001';
select pg_temp.ok((select count(*) = 0 from public.practice_notices), 'catalog probes left nothing queued');

-- ---------------------------------------------------------------------------
-- 2. File numbers and practice settings
-- ---------------------------------------------------------------------------
select pg_temp.ok(public.practice_format_number('TKT', '2026', 1) = 'TKT-2026-0001', 'numbers pad to four digits');
select pg_temp.ok(public.practice_format_number('TKT', '2026', 9999) = 'TKT-2026-9999', '9999 stays four digits');
select pg_temp.ok(public.practice_format_number('LTB', '2026', 10000) = 'LTB-2026-10000', '10000 is not truncated');
select pg_temp.ok(public.practice_format_number('MAT', '2027', 123456) = 'MAT-2027-123456', 'larger numbers keep every digit');
select pg_temp.ok((select pg_get_expr(d.adbin, d.adrelid) like 'practice_format_number(''LTB''::text, %ltb_case_number_seq%'
  from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.ltb_cases'::regclass and a.attname = 'case_number'),
  'landlord case numbers use practice_format_number and the existing sequence');

select pg_temp.ok((select display_name = 'AnderHue Paralegal' and site_url = 'https://anderhue.ca'
    and public_email = 'hello@anderhue.ca' and phone = '(289) 985-0166'
    and client_email_from = 'AnderHue Paralegal <files@anderhue.ca>' and client_reply_to = 'hello@anderhue.ca'
    and notice_from is null and not client_updates_enabled and admin_base_url = 'https://anderhue.ca'
    and alert_emails = array['info@onlineparalegals.ca', 'brett@execom.ca']
  from public.ltb_practices where id = 'anderhue-paralegal'), 'AnderHue practice settings, alert recipients unchanged');
select pg_temp.fails($$update public.ltb_practices set client_updates_enabled = true, client_reply_to = null
  where id = 'anderhue-paralegal'$$, '23514', 'client emails need a reply-to address');
select pg_temp.fails($$update public.ltb_practices set client_email_from = E'Evil\nBcc: x@y.co <a@b.co>'
  where id = 'anderhue-paralegal'$$, '23514', 'sender cannot inject headers');
select pg_temp.fails($$update public.ltb_practices set client_email_from = 'Smith, John <files@anderhue.ca>'
  where id = 'anderhue-paralegal'$$, '23514', 'display names that would need quoting are refused');
select pg_temp.fails($$update public.ltb_practices set site_url = 'https://anderhue.ca/' where id = 'anderhue-paralegal'$$,
  '23514', 'site url is an origin without a trailing slash');

\if :{?harness}
-- Throwaway databases only: push every number sequence to 9999 and back.
select last_value as seq_ltb_last, is_called as seq_ltb_called from public.ltb_case_number_seq \gset
select last_value as seq_tkt_last, is_called as seq_tkt_called from public.practice_traffic_number_seq \gset
select last_value as seq_mat_last, is_called as seq_mat_called from public.practice_general_number_seq \gset
select setval('public.ltb_case_number_seq', 9999) as a, setval('public.practice_traffic_number_seq', 9999) as b,
  setval('public.practice_general_number_seq', 9999) as c \gset seq_bump_
set local role service_role;
select pg_temp.ok((select case_number = 'LTB-' || to_char(now() at time zone 'America/Toronto', 'YYYY') || '-10000'
  from public.ltb_register_intake('anderhue-paralegal', '{"email":"ten-thousand@example.com","issue":"other"}',
    repeat('9', 64), '[]')), 'landlord numbers grow past 9999');
select pg_temp.ok((select matter_number = 'TKT-' || to_char(now() at time zone 'America/Toronto', 'YYYY') || '-10000'
  from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"ten-thousand@example.com"}',
    repeat('9', 64), '[]')), 'traffic numbers grow past 9999');
select pg_temp.ok((select matter_number = 'MAT-' || to_char(now() at time zone 'America/Toronto', 'YYYY') || '-10000'
  from public.practice_register_intake('anderhue-paralegal', 'general',
    '{"email":"ten-thousand@example.com","category":"other"}', repeat('9', 64), '[]')), 'matter numbers grow past 9999');
reset role;
select setval('public.ltb_case_number_seq', :seq_ltb_last, :'seq_ltb_called'::boolean) as a,
  setval('public.practice_traffic_number_seq', :seq_tkt_last, :'seq_tkt_called'::boolean) as b,
  setval('public.practice_general_number_seq', :seq_mat_last, :'seq_mat_called'::boolean) as c \gset seq_restore_
\endif

-- ---------------------------------------------------------------------------
-- 3. Public intake (service role), client emails still switched off
-- ---------------------------------------------------------------------------
set local role service_role;

select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":" Driver@Example.com ","firstName":"Da\u202ena\u200b","lastName":"Driver","phone":"4165550100",
    "notes":"Stopped on the 401","userAgent":"test-agent","ticketType":"speeding","ticketCity":"Toronto",
    "ticketReceivedOn":"2026-09-20","optionChosen":"none"}',
  repeat('a', 64),
  '[{"id":"72200000-0000-4000-8000-000000000001","extension":"jpg","contentType":"image/jpeg","size":1000,"name":"front\u2066.jpg\ufeff"},
    {"id":"72200000-0000-4000-8000-000000000002","contentType":"application/pdf","size":2000,"name":"back.pdf"}]') \gset t1_

select pg_temp.ok(:'t1_matter_number' ~ ('^TKT-' || to_char(now() at time zone 'America/Toronto', 'YYYY') || '-[0-9]{4,}$')
  and :'t1_returning_client' = 'f', 'traffic file opened with a Toronto-year TKT number for a new client');
select pg_temp.ok((select email = 'driver@example.com' and first_name = 'Dana' and last_name = 'Driver'
    and registration_status = 'provisional' and field_sources->'phone'->>'source' = 'form'
  from public.ltb_clients where id = :'t1_client_id'), 'client stored provisional with a normalized email');
select pg_temp.ok((select area = 'traffic' and stage = 'new_intake' and intake_review_status = 'pending_scan'
    and intake_finalized_at is null and ticket_type = 'speeding' and ticket_city = 'Toronto'
    and ticket_received_on = '2026-09-20' and option_chosen = 'none' and option_deadline = '2026-10-05'
    and field_sources->'option_deadline' = '{"source":"form","confidence":"low"}'
    and field_sources->'ticket_type' = '{"source":"form"}'
    and review_notes like '%2026-10-05 is an estimate%' and client_notes = 'Stopped on the 401'
    and source = 'anderhue-site' and user_agent = 'test-agent' and category is null
    and intake_token_hash = repeat('a', 64)
  from public.practice_matters where id = :'t1_matter_id'), 'traffic details stored; deadline estimate = received + 15');
select pg_temp.ok((select count(*) = 2 and bool_and(uploaded_by = 'client' and extraction_status = 'awaiting_upload'
    and uploaded_at is null and not shared_with_client and practice_id = 'anderhue-paralegal'
    and storage_path = matter_id || '/' || id || case content_type when 'image/jpeg' then '.jpg' else '.pdf' end)
  from public.practice_matter_documents where matter_id = :'t1_matter_id'), 'declared uploads registered at their paths');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'intake_received' and detail = '{"returningClient": false, "documents": 2, "source": "anderhue-site"}'),
  'intake logged');
select pg_temp.ok((select first_name = 'Dana' from public.ltb_clients where id = :'t1_client_id')
  and (select original_name = 'front.jpg' from public.practice_matter_documents
       where id = '72200000-0000-4000-8000-000000000001'),
  'zero-width and bidirectional formatting characters are stripped from names');
select pg_temp.ok((select portal_visible from public.practice_matters where id = :'t1_matter_id'),
  'a client''s first file is in the portal');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where case_id = :'t1_matter_id'),
  'nothing queued before documents are read');

select last_value as seq_before_rejects from public.practice_traffic_number_seq \gset
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'ltb', '{"email":"a@b.co"}',
  repeat('a', 64))$$, 'PRACTICE_AREA_INVALID', 'landlord intake stays on ltb_register_intake');
select pg_temp.fails($$select * from public.practice_register_intake('no-such-practice', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64))$$, 'PRACTICE_PRACTICE_UNKNOWN', 'unknown practice');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  'abc')$$, 'PRACTICE_TOKEN_INVALID', 'token hash format');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  null)$$, 'PRACTICE_TOKEN_INVALID', 'token hash required');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '["a@b.co"]',
  repeat('a', 64))$$, 'PRACTICE_INTAKE_INVALID', 'intake must be an object');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"no-at-sign"}', repeat('a', 64))$$, 'PRACTICE_EMAIL_INVALID', 'email format');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"a@b.co","ticketType":"parking"}', repeat('a', 64))$$, 'PRACTICE_INTAKE_INVALID', 'ticket type vocabulary');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"a@b.co","optionChosen":"later"}', repeat('a', 64))$$, 'PRACTICE_INTAKE_INVALID', 'option vocabulary');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"a@b.co","ticketReceivedOn":"2026-02-30"}', repeat('a', 64))$$, 'PRACTICE_INTAKE_INVALID', 'impossible date');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"a@b.co","ticketReceivedOn":"next week"}', repeat('a', 64))$$, 'PRACTICE_INTAKE_INVALID', 'date format');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'general',
  '{"email":"a@b.co","category":"criminal"}', repeat('a', 64))$$, 'PRACTICE_INTAKE_INVALID', 'category vocabulary');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'contentType', 'image/png', 'size', 5))
    from generate_series(1, 7)))$$, 'PRACTICE_UPLOAD_LIMIT', 'at most six uploads per intake');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '{"id":"x"}')$$, 'PRACTICE_DOCUMENT_INVALID', 'documents must be an array');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","contentType":"text/html","size":5}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'content type list');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","extension":"jpg","contentType":"image/png","size":5}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'extension follows the content type');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","extension":"exe","contentType":"application/pdf","size":5}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'extension list');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","contentType":"image/png","size":0}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'empty files rejected');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","contentType":"image/png","size":10485761}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'files over 10 MB rejected');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","contentType":"image/png","size":"5"}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'size must be a number');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","contentType":"image/png","size":1.5}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'size must be whole bytes');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"contentType":"image/png","size":5}]')$$, 'PRACTICE_DOCUMENT_INVALID', 'intake uploads need ids');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"../../etc","contentType":"image/png","size":5}]')$$, 'PRACTICE_DOCUMENT_INVALID', 'ids are uuids');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","contentType":"image/png","size":5},
    {"id":"72200000-0000-4000-8000-0000000000aa","contentType":"image/png","size":6}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'duplicate ids rejected');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-000000000001","contentType":"image/png","size":5}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'ids already in use rejected');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"a@b.co"}',
  repeat('a', 64), '[{"id":"72200000-0000-4000-8000-0000000000aa","contentType":"image/png","size":5,"name":42}]')$$,
  'PRACTICE_DOCUMENT_INVALID', 'names are strings');
select pg_temp.fails($$select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"a@b.co","ticketType":"speeding                                          x"}', repeat('a', 64))$$,
  'PRACTICE_INTAKE_INVALID', 'vocabulary values are compared whole, never truncated into a match');
select pg_temp.ok((select count(*) = 0 from public.ltb_clients where email = 'a@b.co'), 'rejected intakes stored nothing');
select pg_temp.ok((select last_value = :seq_before_rejects from public.practice_traffic_number_seq),
  'rejected intakes spend no file number');

-- Finalize and the ticket reader.
select pg_temp.fails(format('select public.practice_finalize_intake(%L, %L, %L)', :'t1_matter_id', repeat('b', 64), '{}'),
  'PRACTICE_INTAKE_UNAUTHORIZED', 'wrong intake token rejected');
select pg_temp.fails(format('select public.practice_finalize_intake(%L, null, %L)', :'t1_matter_id', '{}'),
  'PRACTICE_INTAKE_UNAUTHORIZED', 'missing intake token rejected');
select pg_temp.fails(format('select public.practice_finalize_intake(%L, %L, %L)', gen_random_uuid(), repeat('a', 64), '{}'),
  'PRACTICE_INTAKE_UNAUTHORIZED', 'unknown file rejected');
select pg_temp.ok(public.practice_finalize_intake(:'t1_matter_id', repeat('a', 64),
  array['72200000-0000-4000-8000-000000000001'::uuid, gen_random_uuid()]) = 'pending_scan',
  'traffic uploads wait for the ticket reader');
select pg_temp.ok((select count(*) filter (where uploaded_at is not null and extraction_status = 'pending') = 1
    and count(*) filter (where uploaded_at is null and extraction_status = 'awaiting_upload') = 1
  from public.practice_matter_documents where matter_id = :'t1_matter_id'), 'only confirmed uploads are marked');
select pg_temp.ok(public.practice_finalize_intake(:'t1_matter_id', repeat('a', 64), '{}') = 'pending_scan',
  'finalize is idempotent');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'documents_uploaded' and detail = '{"count": 1}'), 'upload count logged once');
select pg_temp.ok(public.practice_claim_intake_scan(:'t1_matter_id'), 'scan claimed once');
select pg_temp.ok(not public.practice_claim_intake_scan(:'t1_matter_id'), 'scan not claimed twice');
update public.practice_matters set intake_review_status = 'ready', offence_number = 'A1234567'
  where id = :'t1_matter_id';
select pg_temp.ok((select count(*) = 1 from public.practice_notices where event_key = 'staff-intake/' || :'t1_matter_id'
    and kind = 'staff_new_intake' and audience = 'staff' and area = 'traffic' and case_id = :'t1_matter_id'
    and client_id = :'t1_client_id' and status = 'pending' and next_attempt_at = now()
    and recipients = array['info@onlineparalegals.ca', 'brett@execom.ca']
    and snapshot->'file'->>'number' = :'t1_matter_number' and snapshot->'file'->>'reviewStatus' = 'ready'
    and snapshot->'file'->>'clientNotes' = 'Stopped on the 401' and snapshot->'file'->>'documentCount' = '1'
    and snapshot->'file'->>'city' = 'Toronto' and snapshot->'file'->'keyDates'->>'optionDeadline' = '2026-10-05'),
  'staff alert queued once reading finishes, with client emails still off');
select pg_temp.ok((select pg_temp.keys(snapshot) = array['client', 'file', 'practice']
    and pg_temp.keys(snapshot->'practice') = pg_temp.sorted(array['id', 'name', 'displayName', 'licenseeName', 'phone',
      'publicEmail', 'siteUrl', 'clientEmailFrom', 'clientReplyTo', 'noticeFrom'])
    -- Staff alerts add phone, reviewNotes and returningClient to the 3.5 shape.
    and pg_temp.keys(snapshot->'client') = pg_temp.sorted(array['id', 'firstName', 'lastName', 'organizationName', 'email',
      'phone'])
    and pg_temp.keys(snapshot->'file') = pg_temp.sorted(array['area', 'id', 'number', 'stage', 'outcome', 'issue',
      'ticketType', 'category', 'city', 'createdAt', 'reviewStatus', 'documentCount', 'clientNotes', 'keyDates', 'request',
      'reviewNotes', 'returningClient'])
    and pg_temp.keys(snapshot->'file'->'keyDates') = pg_temp.sorted(array['noticeTerminationDate', 'hearingDate',
      'optionDeadline', 'offenceDate', 'meetingDate', 'trialDate', 'deadlineDate'])
    and snapshot->'file'->'request' = 'null'::jsonb
    and snapshot->'practice'->>'clientEmailFrom' = 'AnderHue Paralegal <files@anderhue.ca>'
  from public.practice_notices where event_key = 'staff-intake/' || :'t1_matter_id'), 'snapshot shape (ARCHITECTURE 3.5)');
update public.practice_matters set offence_date = '2026-09-19' where id = :'t1_matter_id';
select pg_temp.ok((select count(*) = 1 from public.practice_notices where case_id = :'t1_matter_id'),
  'later edits do not alert again');

-- Same email again without documents: provisional record only gains empty fields.
select * from public.practice_register_intake('anderhue-paralegal', 'general',
  '{"email":"driver@example.com","firstName":"Other","lastName":"Name","phone":"999","notes":"Deposit not returned",
    "category":"small_claims","deadline":"2026-11-30","otherParty":"Acme Rentals","clientCity":"Hamilton",
    "ticketType":"speeding"}', repeat('c', 64), '[]') \gset g1_
select pg_temp.ok(:'g1_matter_number' ~ '^MAT-[0-9]{4}-[0-9]{4,}$' and :'g1_client_id' = :'t1_client_id'
  and :'g1_returning_client' = 'f', 'provisional client reused and not treated as returning');
select pg_temp.ok((select first_name = 'Dana' and last_name = 'Driver' and phone = '4165550100' and city = 'Hamilton'
    and field_sources->'city' = '{"source":"form"}'
  from public.ltb_clients where id = :'t1_client_id'), 'provisional client only gained empty fields');
select pg_temp.ok((select area = 'general' and ticket_type is null and category = 'small_claims'
    and deadline_date = '2026-11-30' and other_party = 'Acme Rentals' and client_city = 'Hamilton'
    and option_chosen = 'unsure' and option_deadline is null and intake_review_status = 'needs_review'
    and intake_finalized_at = now() and review_notes = 'No documents uploaded. Ask for any notice, claim or letter about the matter.'
    and field_sources = '{"category":{"source":"form"},"deadline_date":{"source":"form"},"other_party":{"source":"form"},"client_city":{"source":"form"}}'
  from public.practice_matters where id = :'g1_matter_id'), 'no-document intake finalized into review; traffic keys ignored');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where kind = 'staff_new_intake'
  and case_id = :'g1_matter_id' and snapshot->'file'->>'documentCount' = '0'), 'no-document intake alerts staff at once');
select pg_temp.ok((select not portal_visible from public.practice_matters where id = :'g1_matter_id'),
  'a public intake for a client who already has a file is held out of the portal');

-- Other matters with uploads go straight to staff review at finalize.
select * from public.practice_register_intake('anderhue-paralegal', 'general',
  '{"email":"tenant@example.com","category":"tribunal","notes":"Board hearing next month"}', repeat('d', 64),
  '[{"id":"72200000-0000-4000-8000-000000000003","extension":"pdf","contentType":"application/pdf","size":3000,"name":"notice.pdf"}]') \gset g2_
select pg_temp.ok((select intake_review_status = 'pending_scan' and intake_finalized_at is null
  from public.practice_matters where id = :'g2_matter_id'), 'other matter with uploads waits for finalize');
select pg_temp.ok(public.practice_finalize_intake(:'g2_matter_id', repeat('d', 64),
  array['72200000-0000-4000-8000-000000000003'::uuid]) = 'needs_review', 'other matters go straight to staff review');
select pg_temp.ok((select extraction_status = 'skipped' and uploaded_at = now() from public.practice_matter_documents
  where id = '72200000-0000-4000-8000-000000000003'), 'other-matter uploads are never read automatically');
select pg_temp.ok(not public.practice_claim_intake_scan(:'g2_matter_id'), 'other matters are never claimed for reading');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where kind = 'staff_new_intake'
  and case_id = :'g2_matter_id' and snapshot->'file'->>'documentCount' = '1'), 'finalized other matter alerts staff');

-- A finalize where nothing arrived goes to review with a note.
select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"nothing@example.com"}',
  repeat('7', 64), '[{"id":"72200000-0000-4000-8000-000000000004","contentType":"image/heic","size":4000}]') \gset n1_
-- (A statement's own subqueries cannot see what a function call in it wrote,
-- so effects are always checked in the next statement.)
select pg_temp.ok(public.practice_finalize_intake(:'n1_matter_id', repeat('7', 64), '{}') = 'needs_review',
  'no confirmed upload means staff review');
select pg_temp.ok((select review_notes like '%none finished uploading%' from public.practice_matters
  where id = :'n1_matter_id'), 'with a note to follow up');

-- Stalled intakes become staff tasks.
select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"stalled-reader@example.com"}',
  repeat('1', 64), '[{"id":"72200000-0000-4000-8000-000000000011","contentType":"image/png","size":10}]') \gset s1_
select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"abandoned@example.com"}',
  repeat('2', 64), '[{"id":"72200000-0000-4000-8000-000000000012","contentType":"image/png","size":10}]') \gset s2_
select * from public.practice_register_intake('anderhue-paralegal', 'traffic', '{"email":"never-read@example.com"}',
  repeat('3', 64), '[{"id":"72200000-0000-4000-8000-000000000013","contentType":"image/png","size":10}]') \gset s3_
select pg_temp.ok(public.practice_finalize_intake(:'s1_matter_id', repeat('1', 64),
  array['72200000-0000-4000-8000-000000000011'::uuid]) = 'pending_scan'
  and public.practice_claim_intake_scan(:'s1_matter_id')
  and public.practice_finalize_intake(:'s3_matter_id', repeat('3', 64),
    array['72200000-0000-4000-8000-000000000013'::uuid]) = 'pending_scan', 'stall fixtures prepared');
select pg_temp.ok(public.practice_sweep_stalled_intakes() = 0, 'fresh intakes are not swept');
reset role;
update public.practice_matters set intake_scan_started_at = now() - interval '4 minutes' where id = :'s1_matter_id';
update public.practice_matters set created_at = now() - interval '16 minutes' where id = :'s2_matter_id';
update public.practice_matters set intake_finalized_at = now() - interval '6 minutes' where id = :'s3_matter_id';
set local role service_role;
select pg_temp.ok(public.practice_sweep_stalled_intakes() = 3, 'interrupted, abandoned and unclaimed intakes swept');
select pg_temp.ok((select bool_and(intake_review_status = 'needs_review' and intake_finalized_at is not null)
  from public.practice_matters where id in (:'s1_matter_id', :'s2_matter_id', :'s3_matter_id')), 'swept intakes need review');
select pg_temp.ok((select review_notes like 'Automatic ticket reading did not finish.%' from public.practice_matters
  where id = :'s1_matter_id') and (select review_notes like 'The client started uploading the ticket%'
  from public.practice_matters where id = :'s2_matter_id') and (select review_notes like 'Automatic ticket reading did not start.%'
  from public.practice_matters where id = :'s3_matter_id'), 'each sweep leaves its own note');
select pg_temp.ok((select count(*) = 3 from public.practice_notices where kind = 'staff_new_intake'
  and case_id in (:'s1_matter_id', :'s2_matter_id', :'s3_matter_id')), 'swept intakes release their staff alert');
select pg_temp.ok(public.practice_sweep_stalled_intakes() = 0, 'sweep is idempotent');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where audience = 'client'),
  'no client email while client updates are off');

-- The other practice: recipients are normalized, deduplicated and filtered.
select * from public.practice_register_intake('other-practice', 'traffic', '{"email":"driver@example.com","firstName":"Dee"}',
  repeat('4', 64), '[]') \gset o1_
select pg_temp.ok(:'o1_client_id' <> :'t1_client_id', 'clients are per practice');
select pg_temp.ok((select recipients = array['desk@other-practice.test'] from public.practice_notices
  where case_id = :'o1_matter_id' and kind = 'staff_new_intake'), 'staff recipients normalized and invalid ones dropped');

-- Helper contracts.
select pg_temp.ok((select count(*) = 1 from public.practice_case_ref('traffic', :'t1_matter_id'))
  and (select count(*) = 0 from public.practice_case_ref('general', :'t1_matter_id'))
  and (select count(*) = 0 from public.practice_case_ref('ltb', :'t1_matter_id')), 'practice_case_ref reads the area table');
select pg_temp.fails(format('select public.practice_enqueue_notice(%L, %L, %L, null, %L, %L)', 'anderhue-paralegal',
  'traffic', :'t1_matter_id', 'newsletter', 'news/' || :'t1_matter_id'), 'PRACTICE_NOTICE_INVALID', 'unknown notice kind');
select pg_temp.fails(format('select public.practice_enqueue_notice(%L, %L, %L, null, %L, %L)', 'anderhue-paralegal',
  'traffic', :'t1_matter_id', 'upload_invite', 'Bad Key'), 'PRACTICE_NOTICE_INVALID', 'event key format');
select pg_temp.fails(format('select public.practice_enqueue_notice(%L, %L, %L, null, %L, %L)', 'other-practice',
  'traffic', :'t1_matter_id', 'upload_invite', 'invite/x'), 'PRACTICE_NOTICE_INVALID', 'file must belong to the practice');
select pg_temp.fails(format('select public.practice_enqueue_notice(%L, %L, %L, %L, %L, %L)', 'anderhue-paralegal',
  'traffic', :'t1_matter_id', :'g2_client_id', 'upload_invite', 'invite/x'), 'PRACTICE_NOTICE_INVALID',
  'client must own the file');
select pg_temp.fails(format('select public.practice_enqueue_notice(%L, %L, %L, %L, %L, %L)', 'anderhue-paralegal',
  'traffic', :'t1_matter_id', :'t1_client_id', 'portal_link', 'portal-link/x'), 'PRACTICE_NOTICE_INVALID',
  'portal links stand apart from files');
select pg_temp.fails(format('select public.practice_enqueue_notice(%L, %L, %L, null, %L, %L)', 'anderhue-paralegal',
  'traffic', gen_random_uuid(), 'upload_invite', 'invite/x'), 'PRACTICE_CASE_NOT_FOUND', 'notices need a real file');

-- ---------------------------------------------------------------------------
-- 4. Client emails switched on: intake receipts
-- ---------------------------------------------------------------------------
reset role;
update public.ltb_practices set client_updates_enabled = true where id = 'anderhue-paralegal';
set local role service_role;

select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"receipt@example.com","firstName":"Rita","ticketType":"camera","notes":"Camera ticket"}', repeat('f', 64), '[]') \gset r1_
select pg_temp.ok((select count(*) = 1 from public.practice_notices where event_key = 'intake/traffic/' || :'r1_matter_id'
    and kind = 'intake_received' and audience = 'client' and area = 'traffic' and client_id = :'r1_client_id'
    and recipients = array['receipt@example.com'] and next_attempt_at = now() and detail = '{}'
    and snapshot->'file'->'clientNotes' = 'null'::jsonb and snapshot->'file'->>'number' = :'r1_matter_number'
    and snapshot->'client'->>'firstName' = 'Rita'), 'receipt queued for a public intake; client notes stay internal');
select pg_temp.ok((select snapshot->'file'->>'clientNotes' = 'Camera ticket' from public.practice_notices
  where case_id = :'r1_matter_id' and kind = 'staff_new_intake'), 'staff alerts keep the client notes');

-- Further public intakes for the same client are held: no receipt, staff told.
select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"receipt@example.com","firstName":"Rita","ticketType":"speeding"}', repeat('f', 64), '[]') \gset r3_
select * from public.practice_register_intake('anderhue-paralegal', 'general',
  '{"email":"receipt@example.com","category":"tribunal","notes":"Board letter"}', repeat('f', 64), '[]') \gset r4_
select * from public.practice_register_intake('anderhue-paralegal', 'general',
  '{"email":"receipt@example.com","category":"other","notes":"Another matter"}', repeat('f', 64), '[]') \gset r5_
select pg_temp.ok((select count(*) = 3 and bool_and(not portal_visible) from public.practice_matters
  where id in (:'r3_matter_id', :'r4_matter_id', :'r5_matter_id')), 'repeat public intakes are held');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where kind = 'intake_received'
  and case_id in (:'r3_matter_id', :'r4_matter_id', :'r5_matter_id'))
  and (select count(*) = 3 from public.practice_notices where kind = 'staff_new_intake'
  and case_id in (:'r3_matter_id', :'r4_matter_id', :'r5_matter_id')), 'held files send no receipt; staff are told');

-- Defence in depth: at most two receipts per client per day.
select pg_temp.ok(public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'r1_matter_id', null,
  'intake_received', 'intake/throttle/' || :'r1_matter_id') is not null, 'a second receipt within a day is allowed');
select pg_temp.ok(public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'r1_matter_id', null,
  'intake_received', 'intake/throttle-again/' || :'r1_matter_id') is null, 'a third receipt within a day is not');
select pg_temp.ok(public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'r3_matter_id', null,
  'upload_invite', 'invite/held/' || :'r3_matter_id') is null, 'no client email for a file the portal cannot show');
select pg_temp.ok((select snapshot->'file' ? 'reviewNotes' and snapshot->'file'->>'reviewNotes' like 'No ticket uploaded%'
    and snapshot->'file'->'returningClient' = 'false'::jsonb and snapshot->'client' ? 'phone'
  from public.practice_notices where case_id = :'r1_matter_id' and kind = 'staff_new_intake'),
  'staff alerts carry review notes, phone and the returning-client flag');
select pg_temp.ok((select count(*) = 2 and bool_and(not (snapshot->'file' ? 'reviewNotes')
    and not (snapshot->'client' ? 'phone') and not (snapshot->'file' ? 'returningClient'))
  from public.practice_notices where case_id = :'r1_matter_id' and kind = 'intake_received'),
  'client notices never carry review notes or staff-only fields');

select * from public.ltb_register_intake('anderhue-paralegal', '{"email":"landlord@example.com","firstName":"Lana",
  "issue":"arrears","city":"Oshawa"}', repeat('5', 64), '[]') \gset l1_
select pg_temp.ok((select count(*) = 1 from public.practice_notices where event_key = 'intake/ltb/' || :'l1_case_id'
    and kind = 'intake_received' and area = 'ltb' and snapshot->'file'->>'number' = :'l1_case_number'
    and snapshot->'file'->>'issue' = 'arrears' and snapshot->'file'->>'city' = 'Oshawa'), 'landlord intakes get a receipt');
select * from public.ltb_register_intake('anderhue-paralegal', '{"email":"landlord@example.com","issue":"n12_own_use"}',
  repeat('5', 64), '[]') \gset l2_
select pg_temp.ok((select not portal_visible from public.ltb_cases where id = :'l2_case_id')
  and (select count(*) = 0 from public.practice_notices where case_id = :'l2_case_id'),
  'a repeat landlord intake is held too, with no receipt');
reset role;
insert into public.ltb_case_documents (id, case_id, practice_id, storage_path, original_name, content_type, size_bytes,
  uploaded_at, extraction_status)
values ('72200000-0000-4000-8000-000000000051', :'l2_case_id', 'anderhue-paralegal',
  :'l2_case_id' || '/72200000-0000-4000-8000-000000000051.pdf', 'lease.pdf', 'application/pdf', 10, now(), 'skipped');
set local role service_role;
select pg_temp.ok((select jsonb_array_length(j->'files') = 1 and j->'files'->0->>'id' = :'l1_case_id'
    from (select public.practice_portal_session(:'l1_client_id') as j) s)
  and public.practice_portal_file(:'l1_client_id', 'ltb', :'l2_case_id') is null
  and (select count(*) = 0 from public.practice_portal_document(:'l1_client_id', 'ltb', :'l2_case_id',
    '72200000-0000-4000-8000-000000000051')), 'a held landlord file is not listed, opened or downloadable');
select * from public.ltb_register_intake('anderhue-paralegal', '{"email":"smoke@example.com","issue":"other",
  "source":"smoke-test"}', repeat('6', 64), '[]') \gset smoke_
select pg_temp.ok((select count(*) = 0 from public.practice_notices where case_id = :'smoke_case_id'),
  'smoke tests never queue notices');
select pg_temp.ok(public.practice_enqueue_notice('anderhue-paralegal', 'ltb', :'smoke_case_id', null, 'upload_invite',
  'invite/ltb/' || :'smoke_case_id') is null, 'the enqueue helper itself refuses smoke-test files');

select * from public.practice_register_intake('anderhue-paralegal', 'general', '{"email":"later@example.com","category":"notary"}',
  repeat('8', 64), '[{"id":"72200000-0000-4000-8000-000000000020","contentType":"image/png","size":10,"name":"id.png"}]') \gset r2_
select pg_temp.ok((select count(*) = 0 from public.practice_notices where case_id = :'r2_matter_id'),
  'no receipt before uploads are finalized');
select pg_temp.ok(public.practice_finalize_intake(:'r2_matter_id', repeat('8', 64),
  array['72200000-0000-4000-8000-000000000020'::uuid]) = 'needs_review', 'uploads finalized');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where case_id = :'r2_matter_id'
  and kind = 'intake_received'), 'receipt once finalized');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where case_id = :'o1_matter_id' and audience = 'client'),
  'a practice with client emails off queues none');

-- A stored address with a control character is not a valid recipient.
reset role;
insert into public.ltb_clients (id, practice_id, email) values
  ('72300000-0000-4000-8000-000000000010', 'anderhue-paralegal', E'bad\u0001mail@example.com');
insert into public.practice_matters (id, practice_id, client_id, area, intake_review_status, intake_finalized_at) values
  ('72300000-0000-4000-8000-000000000011', 'anderhue-paralegal', '72300000-0000-4000-8000-000000000010', 'traffic',
   'needs_review', now());
select pg_temp.ok((select count(*) = 0 from public.practice_notices
  where case_id = '72300000-0000-4000-8000-000000000011' and audience = 'client')
  and (select count(*) = 1 from public.practice_notices
    where case_id = '72300000-0000-4000-8000-000000000011' and kind = 'staff_new_intake'),
  'client emails need a valid address; staff alerts still go out');
select pg_temp.fails($$insert into public.practice_notices (practice_id, area, case_id, client_id, audience, kind, event_key,
  snapshot, recipients) values ('anderhue-paralegal', 'traffic', '72300000-0000-4000-8000-000000000011',
  '72300000-0000-4000-8000-000000000010', 'client', 'upload_invite', 'invite/direct', '{}', '{}')$$, '23514',
  'recipients are required');
select pg_temp.fails($$insert into public.practice_notices (practice_id, area, case_id, client_id, audience, kind, event_key,
  snapshot, recipients) values ('anderhue-paralegal', 'traffic', '72300000-0000-4000-8000-000000000011',
  '72300000-0000-4000-8000-000000000010', 'staff', 'upload_invite', 'invite/direct', '{}', '{a@b.co}')$$, '23514',
  'audience follows the kind');
select pg_temp.fails($$insert into public.practice_notices (practice_id, client_id, audience, kind, event_key,
  snapshot, recipients) values ('anderhue-paralegal', '72300000-0000-4000-8000-000000000010', 'client', 'upload_invite',
  'invite/direct', '{}', '{a@b.co}')$$, '23514', 'file notices need a file');

-- ---------------------------------------------------------------------------
-- 5. Stage changes (practice licensee)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset

select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'traffic', :'r1_matter_id', 'filed'),
  'PRACTICE_STAGE_INVALID', 'landlord stage rejected for a traffic file');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, null)', 'traffic', :'r1_matter_id'),
  'PRACTICE_STAGE_INVALID', 'stage required');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'traffic', :'r1_matter_id', 'closed'),
  'PRACTICE_OUTCOME_REQUIRED', 'closing needs an outcome');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L, %L)', 'traffic', :'r1_matter_id', 'closed', 'declined'),
  'PRACTICE_OUTCOME_INVALID', 'declined is not a closing outcome');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L, %L)', 'traffic', :'r1_matter_id', 'closed', 'order_obtained'),
  'PRACTICE_OUTCOME_INVALID', 'outcomes are per area');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L, null, %L)', 'traffic', :'r1_matter_id', 'quoted',
  repeat('n', 1001)), 'PRACTICE_NOTE_TOO_LONG', 'note length');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L, null, null, %L)', 'traffic', :'r1_matter_id',
  'quoted', repeat('m', 1001)), 'PRACTICE_MESSAGE_TOO_LONG', 'message length');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'general', :'r1_matter_id', 'quoted'),
  'PRACTICE_CASE_NOT_FOUND', 'area must match the file');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'parking', :'r1_matter_id', 'quoted'),
  'PRACTICE_CASE_NOT_FOUND', 'unknown area');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'traffic', :'o1_matter_id', 'quoted'),
  'PRACTICE_CASE_NOT_FOUND', 'another practice''s file is invisible');

select public.practice_set_stage('traffic', :'r1_matter_id', 'under_review', null, 'Checked the notice',
  '  We have your ticket and are checking the deadline.  ') as result \gset ur_
select pg_temp.ok((:'ur_result')::jsonb->>'stage' = 'under_review' and (:'ur_result')::jsonb->'outcome' = 'null'::jsonb
  and (:'ur_result')::jsonb->>'noticeId' is not null, 'stage changed with the notice id returned');
select pg_temp.ok(current_setting('practice.client_message', true) = '' and current_setting('practice.notify', true) = '',
  'message and notify settings cleared after the update');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'r1_matter_id'
  and event = 'stage_changed' and actor_id = '72100000-0000-4000-8000-000000000001'
  and detail = '{"stage":"under_review","note":"Checked the notice"}'), 'stage change logged with the internal note');
select pg_temp.ok((select (public.practice_set_stage('traffic', :'r1_matter_id', 'under_review', null, null,
  'again'))->'noticeId' = 'null'::jsonb), 'same stage changes nothing');
select pg_temp.ok((select (public.practice_set_stage('traffic', :'r1_matter_id', 'quoted', null, null, 'Quote attached',
  false))->'noticeId' = 'null'::jsonb), 'notify false suppresses the email');
select pg_temp.ok((select (public.practice_set_stage('traffic', :'r1_matter_id', 'new_intake'))->'noticeId' = 'null'::jsonb),
  'non-notifying stage sends nothing');
select pg_temp.ok((select (public.practice_set_stage('traffic', :'r1_matter_id', 'under_review'))->>'noticeId')
  = (:'ur_result')::jsonb->>'noticeId', 'the same stage and instant dedupes onto the first notice');
select public.practice_set_stage('traffic', :'r1_matter_id', 'closed', 'withdrawn', 'Withdrawn at first appearance') as result \gset cw_
select pg_temp.ok((:'cw_result')::jsonb->>'outcome' = 'withdrawn' and (:'cw_result')::jsonb->>'noticeId' is not null,
  'closing queues an update with the outcome');
select public.practice_set_stage('traffic', :'r1_matter_id', 'closed', 'amended', null, 'Corrected result.') as result \gset ca_
select pg_temp.ok((:'ca_result')::jsonb->>'outcome' = 'amended' and (:'ca_result')::jsonb->>'noticeId' is not null
  and (:'ca_result')::jsonb->>'noticeId' <> (:'cw_result')::jsonb->>'noticeId',
  'an outcome correction emails the corrected outcome');
select pg_temp.ok((select (public.practice_set_stage('traffic', :'r1_matter_id', 'closed', 'other', null, null, false))
  = '{"stage":"closed","outcome":"other","noticeId":null}'::jsonb), 'a silent outcome correction queues nothing');
select public.practice_set_stage('traffic', :'r1_matter_id', 'declined', 'withdrawn') as result \gset dc_
select pg_temp.ok((:'dc_result')::jsonb->>'outcome' = 'declined', 'declining forces the declined outcome');
select pg_temp.ok((select count(*) = 2 from public.practice_matter_events where matter_id = :'r1_matter_id'
  and event = 'outcome_changed' and detail->>'stage' = 'closed' and detail->>'outcome' in ('amended', 'other')),
  'outcome corrections logged');

-- Landlord files through the same function, and through the legacy RPC.
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'ltb', :'l1_case_id', 'option_filed'),
  'PRACTICE_STAGE_INVALID', 'traffic stage rejected for a landlord file');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L, %L)', 'ltb', :'l1_case_id', 'closed', 'amended'),
  'PRACTICE_OUTCOME_INVALID', 'traffic outcome rejected for a landlord file');
select public.practice_set_stage('ltb', :'l1_case_id', 'under_review', null, 'Reading the N4', 'Reviewing your notice.') as result \gset lu_
select pg_temp.ok((:'lu_result')::jsonb->>'noticeId' is not null and (select count(*) = 1 from public.ltb_case_events
  where case_id = :'l1_case_id' and event = 'stage_changed' and detail = '{"stage":"under_review","note":"Reading the N4"}'),
  'landlord stage change logged in ltb_case_events');
select pg_temp.ok((select stage = 'quoted' from public.ltb_set_case_stage(:'l1_case_id', 'quoted')), 'legacy RPC still works');
-- Moving a held file out of new_intake puts it into the portal, by either path.
select pg_temp.ok((select (public.practice_set_stage('traffic', :'r3_matter_id', 'under_review'))->>'noticeId' is not null),
  'a held file taken forward is announced to its client');
select pg_temp.ok((select stage = 'under_review' from public.ltb_set_case_stage(:'l2_case_id', 'under_review')),
  'legacy RPC moves a held landlord file');
select pg_temp.ok((select (public.practice_set_stage('ltb', :'smoke_case_id', 'under_review'))->'noticeId' = 'null'::jsonb),
  'staff can work a smoke-test file but it never emails anyone');
reset role;
select pg_temp.ok((select count(*) = 0 from public.practice_notices where case_id = :'smoke_case_id'),
  'no notice for the smoke-test stage change');

-- Checked as the database owner: event keys, delays and actors are not staff columns.
select pg_temp.ok((select count(*) = 1 from public.practice_notices where id = ((:'ur_result')::jsonb->>'noticeId')::uuid
    and kind = 'stage_changed' and audience = 'client' and status = 'pending'
    and detail = '{"stage":"under_review","message":"We have your ticket and are checking the deadline."}'
    and next_attempt_at = now() + interval '90 seconds'
    and event_key = format('stage/traffic/%s/under_review/%s', :'r1_matter_id', floor(extract(epoch from now()) * 1000)::bigint)
    and created_by = '72100000-0000-4000-8000-000000000001' and recipients = array['receipt@example.com']),
  'stage update carries the personal message and waits 90 seconds');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where case_id = :'r1_matter_id'
  and kind = 'stage_changed' and detail->>'stage' = 'under_review'), 'one under-review update despite two moves');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where case_id = :'r1_matter_id'
  and kind = 'stage_changed' and detail->>'stage' in ('quoted', 'new_intake')), 'suppressed and quiet stages queued nothing');
select pg_temp.ok((select detail = '{"stage":"closed","outcome":"withdrawn"}' from public.practice_notices
  where id = ((:'cw_result')::jsonb->>'noticeId')::uuid), 'closing update carries the outcome');
select pg_temp.ok((select detail = '{"stage":"declined","outcome":"declined"}' and snapshot->'file'->>'stage' = 'declined'
  from public.practice_notices where id = ((:'dc_result')::jsonb->>'noticeId')::uuid), 'declined update queued');
select pg_temp.ok((select stage = 'declined' and outcome = 'declined' and closed_at = now()
  from public.practice_matters where id = :'r1_matter_id'), 'declined file closed');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where case_id = :'l1_case_id' and kind = 'stage_changed'
    and detail->>'stage' = 'quoted'), 'the legacy ltb_set_case_stage emails no client (it has no preview or undo)');
select pg_temp.ok((select detail = '{"stage":"closed","outcome":"amended","message":"Corrected result."}'
    and next_attempt_at = now() + interval '90 seconds'
    and event_key like format('stage/traffic/%s/closed/%%', :'r1_matter_id')
    and event_key <> (select event_key from public.practice_notices where id = ((:'cw_result')::jsonb->>'noticeId')::uuid)
  from public.practice_notices where id = ((:'ca_result')::jsonb->>'noticeId')::uuid),
  'the correction is a fresh update with its own key and the same undo window');
select pg_temp.ok((select portal_visible from public.practice_matters where id = :'r3_matter_id')
  and (select portal_visible from public.ltb_cases where id = :'l2_case_id')
  and (select count(*) = 0 from public.practice_notices where case_id = :'l2_case_id' and audience = 'client'),
  'held files enter the portal when they leave new_intake');
select pg_temp.ok((select not portal_visible from public.practice_matters where id = :'r4_matter_id'),
  'other held files stay held');

-- Fabsy staff outside the practice see and change nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000003', true) as claim \gset
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'general', :'g1_matter_id', 'quoted'),
  'PRACTICE_CASE_NOT_FOUND', 'Fabsy case manager cannot move practice files');
select pg_temp.ok((select count(*) = 0 from public.practice_matters) and (select count(*) = 0 from public.practice_notices)
  and (select count(*) = 0 from public.practice_matter_documents) and (select count(*) = 0 from public.practice_matter_events),
  'Fabsy case manager reads no practice data');

-- ---------------------------------------------------------------------------
-- 6. Notice outbox (service role)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true) as claim \gset
-- Hold everything queued so far; each check below makes its own notices due.
update public.practice_notices set next_attempt_at = now() + interval '1 day' where status = 'pending';
select id as n_ur from public.practice_notices where case_id = :'r1_matter_id' and detail->>'stage' = 'under_review' \gset
select (:'cw_result')::jsonb->>'noticeId' as n_cl, (:'ca_result')::jsonb->>'noticeId' as n_ca \gset
select id as n_dc from public.practice_notices where case_id = :'r1_matter_id' and detail->>'stage' = 'declined' \gset
select id as n_lu from public.practice_notices where case_id = :'l1_case_id' and detail->>'stage' = 'under_review' \gset
select id as n_r3 from public.practice_notices where case_id = :'r3_matter_id' and kind = 'stage_changed' \gset
-- Two updates for the same stage of r2 (still new_intake), and an
-- already-told stage on g2 (also new_intake).
select public.practice_enqueue_notice('anderhue-paralegal', 'general', :'r2_matter_id', null, 'stage_changed',
  'stage/general/' || :'r2_matter_id' || '/new_intake/1', '{"stage":"new_intake"}') as b_old \gset
select public.practice_enqueue_notice('anderhue-paralegal', 'general', :'r2_matter_id', null, 'stage_changed',
  'stage/general/' || :'r2_matter_id' || '/new_intake/2', '{"stage":"new_intake"}') as b_new \gset
select public.practice_enqueue_notice('anderhue-paralegal', 'general', :'g2_matter_id', null, 'stage_changed',
  'stage/general/' || :'g2_matter_id' || '/new_intake/1', '{"stage":"new_intake"}') as c_sent \gset
update public.practice_notices set status = 'sent', provider_email_id = 'em_told', sent_at = now(),
  next_attempt_at = now() + interval '1 day' where id = :'c_sent';
select public.practice_enqueue_notice('anderhue-paralegal', 'general', :'g2_matter_id', null, 'stage_changed',
  'stage/general/' || :'g2_matter_id' || '/new_intake/2', '{"stage":"new_intake"}') as c_repeat \gset
update public.practice_notices set next_attempt_at = now() + interval '1 day' where id = :'c_repeat';

set local role service_role;
select pg_temp.fails('select * from public.claim_practice_notices(0)', 'PRACTICE_NOTICE_LIMIT_INVALID', 'limit at least 1');
select pg_temp.fails('select * from public.claim_practice_notices(11)', 'PRACTICE_NOTICE_LIMIT_INVALID', 'limit at most 10');
select pg_temp.fails('select * from public.claim_practice_notices(null)', 'PRACTICE_NOTICE_LIMIT_INVALID', 'limit required');
create temp table claim_one on commit drop as select * from public.claim_practice_notices(10);
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'b_new' and status = 'sending' and claim_id is not null
    and attempt_count = 1 and first_attempt_at is not null and claim_expires_at > clock_timestamp() + interval '170 seconds'
    and claim_expires_at <= clock_timestamp() + interval '180 seconds')
  from claim_one), 'only the due, current update is claimed, with a three-minute lease');
select pg_temp.ok((select count(*) = 4 from public.practice_notices
  where id in (:'n_ur', :'n_cl', :'n_ca', :'n_lu') and status = 'superseded' and failure_code = 'stage_moved'),
  'updates for stages the file has left are superseded before sending');
select pg_temp.ok((select status = 'pending' from public.practice_notices where id = :'n_dc')
  and (select status = 'pending' from public.practice_notices where id = :'n_r3'), 'current updates stay queued until due');
select pg_temp.ok((select status = 'superseded' and failure_code = 'replaced_by_newer_update' from public.practice_notices
  where id = :'b_old'), 'an older update for the same file is superseded by the newer one');
select pg_temp.ok((select status = 'superseded' and failure_code = 'client_already_told' from public.practice_notices
  where id = :'c_repeat'), 'undoing a slip does not repeat the update the client already has');
select pg_temp.ok((select count(*) = 0 from public.claim_practice_notices(10)), 'nothing else is due');

select claim_id as c1_claim from claim_one \gset
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"to":["later@example.com"],"subject":"s","html":"h"}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID', 'from required');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":"later@example.com","subject":"s","html":"h"}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID', 'to is an array');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":[],"subject":"s","html":"h"}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID', 'at least one recipient');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":["a@b.co","a@b.co","a@b.co","a@b.co","a@b.co","a@b.co"],"subject":"s","html":"h"}'),
  'PRACTICE_NOTICE_PAYLOAD_INVALID', 'at most five recipients');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":["later@example.com"],"subject":" ","html":"h"}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID', 'subject required');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":["later@example.com"],"subject":"s"}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID', 'html required');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":["later@example.com"],"subject":"s","html":"h","text":7}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID',
  'text is a string');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":["later@example.com"],"subject":"s","html":"h","reply_to":7}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID',
  'reply_to is an address');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim',
  '{"from":"f","to":["someone-else@example.com"],"subject":"s","html":"h"}'), 'PRACTICE_NOTICE_PAYLOAD_INVALID',
  'emails go only to the notice recipients');
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'b_new', gen_random_uuid(),
  '{"from":"f","to":["later@example.com"],"subject":"s","html":"h"}'), 'PRACTICE_NOTICE_CLAIM_LOST', 'claim checked');
select pg_temp.ok(public.freeze_practice_notice(:'b_new', :'c1_claim',
  '{"from":"AnderHue Paralegal <files@anderhue.ca>","to":["Lee Later <Later@Example.com>"],
    "reply_to":"hello@anderhue.ca","subject":"MAT · Request received","html":"<p>Hello</p>","text":"Hello"}')->>'subject'
  = 'MAT · Request received', 'payload frozen (recipient matched through its display name)');
select pg_temp.ok(public.freeze_practice_notice(:'b_new', :'c1_claim',
  '{"from":"f","to":["later@example.com"],"subject":"Changed","html":"h"}')->>'subject' = 'MAT · Request received',
  'a frozen payload never changes');
select pg_temp.fails(format('select public.finish_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim', 'sent'),
  'PRACTICE_NOTICE_OUTCOME_INVALID', 'sent needs a provider id');
select pg_temp.fails(format('select public.finish_practice_notice(%L, %L, %L, %L, %L)', :'b_new', :'c1_claim', 'sent',
  'em_1', 'oops'), 'PRACTICE_NOTICE_OUTCOME_INVALID', 'sent carries no failure code');
select pg_temp.fails(format('select public.finish_practice_notice(%L, %L, %L)', :'b_new', :'c1_claim', 'retry'),
  'PRACTICE_NOTICE_OUTCOME_INVALID', 'retry needs a failure code');
select pg_temp.fails(format('select public.finish_practice_notice(%L, %L, %L, null, %L)', :'b_new', :'c1_claim', 'bounced',
  'x'), 'PRACTICE_NOTICE_OUTCOME_INVALID', 'known outcomes only');
select pg_temp.ok(not public.finish_practice_notice(:'b_new', gen_random_uuid(), 'retry', null, 'timeout'),
  'a lost claim cannot finish');
select pg_temp.ok(public.finish_practice_notice(:'b_new', :'c1_claim', 'retry', null, 'provider_timeout'), 'retry recorded');
select pg_temp.ok((select status = 'retry' and claim_id is null and failure_code = 'provider_timeout'
  and next_attempt_at > clock_timestamp() + interval '50 seconds' from public.practice_notices where id = :'b_new'),
  'retry backs off');
reset role;
update public.practice_notices set next_attempt_at = now() - interval '1 second' where id = :'b_new';
set local role service_role;
create temp table claim_two on commit drop as select * from public.claim_practice_notices(10);
select claim_id as c2_claim from claim_two \gset
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'b_new' and attempt_count = 2 and claim_id <> :'c1_claim'
  and email_payload->>'subject' = 'MAT · Request received') from claim_two), 'a due retry is claimed again with its frozen email');
select pg_temp.ok(public.freeze_practice_notice(:'b_new', :'c2_claim',
  '{"from":"f","to":["later@example.com"],"subject":"Other","html":"h"}')->>'subject' = 'MAT · Request received',
  'retries resend the same email');
select pg_temp.ok(public.finish_practice_notice(:'b_new', :'c2_claim', 'sent', 'em_123'), 'sent recorded');
select pg_temp.ok((select status = 'sent' and provider_email_id = 'em_123' and sent_at is not null and failure_code is null
  from public.practice_notices where id = :'b_new'), 'sent notice closed');
select pg_temp.ok(not public.finish_practice_notice(:'b_new', :'c2_claim', 'sent', 'em_123'), 'finish is single use');

-- An update with a personal message is never treated as already told.
select public.practice_enqueue_notice('anderhue-paralegal', 'general', :'g2_matter_id', null, 'stage_changed',
  'stage/general/' || :'g2_matter_id' || '/new_intake/3', '{"stage":"new_intake","message":"One more thing"}') as c_msg \gset
create temp table claim_three on commit drop as select * from public.claim_practice_notices(10);
select claim_id as c3_claim from claim_three \gset
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'c_msg') from claim_three), 'a personal message still goes out');
-- Expired lease: the claim is lost and the notice can be claimed again.
reset role;
update public.practice_notices set claim_expires_at = clock_timestamp() - interval '1 second' where id = :'c_msg';
set local role service_role;
select pg_temp.fails(format('select public.freeze_practice_notice(%L, %L, %L)', :'c_msg', :'c3_claim',
  '{"from":"f","to":["tenant@example.com"],"subject":"s","html":"h"}'), 'PRACTICE_NOTICE_CLAIM_LOST', 'expired lease');
select pg_temp.ok(not public.finish_practice_notice(:'c_msg', gen_random_uuid(), 'sent', 'em_9'), 'stale worker cannot finish');
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'c_msg' and attempt_count = 2 and claim_id <> :'c3_claim')
  from public.claim_practice_notices(10)), 'expired lease reclaimed');
-- The 23-hour idempotency window.
reset role;
update public.practice_notices set status = 'retry', claim_id = null, claim_expires_at = null,
  first_attempt_at = clock_timestamp() - interval '24 hours', next_attempt_at = now() - interval '1 second'
  where id = :'c_msg';
set local role service_role;
select pg_temp.ok((select count(*) = 0 from public.claim_practice_notices(10)), 'nothing claimed past the window');
select pg_temp.ok((select status = 'indeterminate' and failure_code = 'idempotency_window_elapsed'
  from public.practice_notices where id = :'c_msg'), 'old attempts become indeterminate');

-- A file's state is its stage and outcome together: an outcome correction
-- overtakes the update it corrects, and still goes out after the client was
-- told the old outcome.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset
select (public.practice_set_stage('traffic', :'n1_matter_id', 'closed', 'withdrawn'))->>'noticeId' as h_withdrawn \gset
select (public.practice_set_stage('traffic', :'n1_matter_id', 'closed', 'convicted', null,
  'Sorry, our last email had the wrong result.'))->>'noticeId' as h_convicted \gset
reset role;
update public.practice_notices set next_attempt_at = now() - interval '1 second'
  where id in (:'h_withdrawn', :'h_convicted');
set local role service_role;
create temp table claim_h on commit drop as select * from public.claim_practice_notices(10);
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'h_convicted') from claim_h)
  and (select status = 'superseded' and failure_code = 'stage_moved' from public.practice_notices
    where id = :'h_withdrawn'), 'the corrected outcome goes out and the old one is superseded');
select claim_id as h_claim from claim_h \gset
select pg_temp.ok(public.finish_practice_notice(:'h_convicted', :'h_claim', 'sent', 'em_h1'), 'correction sent');
reset role;
set local role authenticated;
select pg_sleep(0.002); -- corrections are keyed by the clock millisecond
select (public.practice_set_stage('traffic', :'n1_matter_id', 'closed', 'withdrawn'))->>'noticeId' as h_back \gset
reset role;
update public.practice_notices set next_attempt_at = now() - interval '1 second' where id = :'h_back';
set local role service_role;
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'h_back') from public.claim_practice_notices(10)),
  'a new outcome without a message is not mistaken for one the client already has');

-- Only a live update about the file's current state replaces an older one.
-- s1 is quoted (with a message), retained, then quietly moved back to quoted:
-- the quote still goes out and the retained update is superseded.
reset role;
set local role authenticated;
select (public.practice_set_stage('traffic', :'s1_matter_id', 'quoted', null, null, 'Your quote is attached.'))->>'noticeId'
  as m_quoted \gset
select (public.practice_set_stage('traffic', :'s1_matter_id', 'retained'))->>'noticeId' as m_retained \gset
select pg_temp.ok((select (public.practice_set_stage('traffic', :'s1_matter_id', 'quoted', null, null, null, false))->'noticeId'
  = 'null'::jsonb), 'a quiet move back reports no notice');
reset role;
update public.practice_notices set next_attempt_at = now() - interval '1 second' where id in (:'m_quoted', :'m_retained');
set local role service_role;
create temp table claim_m on commit drop as select * from public.claim_practice_notices(10);
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'m_quoted') from claim_m)
  and (select status = 'superseded' and failure_code = 'stage_moved' from public.practice_notices
    where id = :'m_retained'), 'an update about another stage does not replace the current one');
-- Newer updates that will never be sent (cancelled, superseded, failed) do
-- not replace a live one either.
reset role;
select public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'s2_matter_id', null, 'stage_changed',
  'stage/traffic/' || :'s2_matter_id' || '/new_intake/1', '{"stage":"new_intake"}') as d_live \gset
select public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'s2_matter_id', null, 'stage_changed',
  'stage/traffic/' || :'s2_matter_id' || '/new_intake/2', '{"stage":"new_intake"}', 3600) as d_cancelled \gset
select public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'s2_matter_id', null, 'stage_changed',
  'stage/traffic/' || :'s2_matter_id' || '/new_intake/3', '{"stage":"new_intake"}', 3600) as d_superseded \gset
select public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'s2_matter_id', null, 'stage_changed',
  'stage/traffic/' || :'s2_matter_id' || '/new_intake/4', '{"stage":"new_intake"}', 3600) as d_failed \gset
update public.practice_notices set status = 'cancelled', failure_code = 'cancelled_by_staff' where id = :'d_cancelled';
update public.practice_notices set status = 'superseded', failure_code = 'stage_moved' where id = :'d_superseded';
update public.practice_notices set status = 'failed', failure_code = 'provider_rejected' where id = :'d_failed';
set local role service_role;
select pg_temp.ok((select count(*) = 1 and bool_and(id = :'d_live') from public.claim_practice_notices(10)),
  'cancelled, superseded and failed updates never replace a live one');

-- Kill switch: switching client emails off stops what is already queued,
-- including a send whose lease ran out. A send in flight and staff alerts are
-- left alone.
reset role;
update public.ltb_practices set client_updates_enabled = true where id = 'other-practice';
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000004', true) as claim \gset
select (public.practice_set_stage('traffic', :'o1_matter_id', 'under_review'))->>'noticeId' as k_pending \gset
reset role;
select public.practice_enqueue_notice('other-practice', 'traffic', :'o1_matter_id', null, 'upload_invite',
  'invite/traffic/' || :'o1_matter_id') as k_expired \gset
select public.practice_enqueue_notice('other-practice', 'traffic', :'o1_matter_id', null, 'documents_requested',
  'request/traffic/' || :'o1_matter_id' || '/1', '{"message":"Please send the ticket."}') as k_flight \gset
update public.practice_notices set status = 'sending', claim_id = gen_random_uuid(), attempt_count = 1,
  first_attempt_at = clock_timestamp() - interval '5 minutes', claim_expires_at = clock_timestamp() - interval '1 second'
  where id = :'k_expired';
update public.practice_notices set status = 'sending', claim_id = gen_random_uuid(), attempt_count = 1,
  first_attempt_at = clock_timestamp(), claim_expires_at = clock_timestamp() + interval '3 minutes'
  where id = :'k_flight';
update public.ltb_practices set client_updates_enabled = false where id = 'other-practice';
set local role service_role;
select pg_temp.ok((select count(*) = 0 from public.claim_practice_notices(10)), 'nothing is claimed for a switched-off practice');
reset role;
select pg_temp.ok((select count(*) = 2 from public.practice_notices where id in (:'k_pending', :'k_expired')
    and status = 'cancelled' and failure_code = 'client_updates_disabled' and claim_id is null and claim_expires_at is null)
  and (select status = 'sending' from public.practice_notices where id = :'k_flight')
  and (select status = 'pending' from public.practice_notices where case_id = :'o1_matter_id' and kind = 'staff_new_intake'),
  'switching client emails off cancels unsent client emails');
select set_config('request.jwt.claim.sub', '', true) as claim \gset

-- ---------------------------------------------------------------------------
-- 7. Client portal (service role)
-- ---------------------------------------------------------------------------
reset role;
-- A client upload planted on a held file (r5) for the download check below.
insert into public.practice_matter_documents (id, matter_id, practice_id, storage_path, original_name, content_type,
  size_bytes, extraction_status, uploaded_at)
values ('72200000-0000-4000-8000-000000000050', :'r5_matter_id', 'anderhue-paralegal',
  :'r5_matter_id' || '/72200000-0000-4000-8000-000000000050.png', 'photo.png', 'image/png', 10, 'skipped', now());
set local role service_role;

-- Held files (repeat public intakes) stay out of the portal entirely.
select pg_temp.ok((select jsonb_array_length(j->'files') = 1 and j->'files'->0->>'id' = :'t1_matter_id'
  from (select public.practice_portal_session(:'t1_client_id') as j) s), 'a held file is not listed');
select pg_temp.ok(public.practice_portal_file(:'t1_client_id', 'general', :'g1_matter_id') is null,
  'a held file cannot be opened');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'t1_client_id', 'general',
  :'g1_matter_id', '[{"contentType":"image/png","size":5}]'), 'PRACTICE_CASE_NOT_FOUND', 'a held file takes no uploads');
select pg_temp.fails(format('select public.practice_portal_confirm_uploads(%L, %L, %L, %L)', :'r1_client_id', 'general',
  :'r5_matter_id', array['72200000-0000-4000-8000-000000000050']), 'PRACTICE_CASE_NOT_FOUND',
  'or confirmations');
select pg_temp.ok((select count(*) = 0 from public.practice_portal_document(:'r1_client_id', 'general', :'r5_matter_id',
  '72200000-0000-4000-8000-000000000050')), 'or downloads');
select pg_temp.ok((select jsonb_array_length(public.practice_portal_session(:'r1_client_id')->'files') = 2),
  'only the files staff have taken forward are listed');

-- Staff take g1 forward without an email; it joins the portal.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset
select pg_temp.ok((select (public.practice_set_stage('general', :'g1_matter_id', 'under_review', null, null, null, false))
  ->'noticeId' = 'null'::jsonb), 'held file taken forward quietly');
reset role;
select set_config('request.jwt.claim.sub', '', true) as claim \gset
select pg_temp.ok((select portal_visible from public.practice_matters where id = :'g1_matter_id')
  and (select count(*) = 0 from public.practice_notices where case_id = :'g1_matter_id' and audience = 'client'),
  'in the portal, with no email');
-- t1 has older activity than g1 (the touch trigger is bypassed to backdate).
set local session_replication_role = replica;
update public.practice_matters set updated_at = now() - interval '1 day' where id = :'t1_matter_id';
reset session_replication_role;
set local role service_role;

select pg_temp.ok(public.practice_portal_session(gen_random_uuid()) is null, 'unknown client has no session');
select pg_temp.ok((with s as (select public.practice_portal_session(:'t1_client_id') as j)
  select pg_temp.keys(j) = pg_temp.sorted(array['client', 'practice', 'revokedBefore', 'files'])
    and j->'client' = jsonb_build_object('id', :'t1_client_id', 'email', 'driver@example.com', 'firstName', 'Dana',
      'lastName', 'Driver', 'organizationName', null)
    and j->'practice' = '{"id":"anderhue-paralegal","name":"AnderHue Paralegal Professional Corporation",
      "displayName":"AnderHue Paralegal","phone":"(289) 985-0166","publicEmail":"hello@anderhue.ca",
      "siteUrl":"https://anderhue.ca"}'::jsonb
    and j->'revokedBefore' = 'null'::jsonb
    and jsonb_array_length(j->'files') = 2
    and j->'files'->0->>'id' = :'g1_matter_id' and j->'files'->1->>'id' = :'t1_matter_id'
    and pg_temp.keys(j->'files'->0) = pg_temp.sorted(array['area', 'id', 'number', 'stage', 'outcome', 'issue',
      'ticketType', 'category', 'createdAt', 'updatedAt', 'requestOpen', 'closed'])
    and j->'files'->0->>'number' = :'g1_matter_number' and j->'files'->0->>'category' = 'small_claims'
    and j->'files'->1->>'ticketType' = 'speeding' and j->'files'->1->>'area' = 'traffic'
    and j->'files'->1->'requestOpen' = 'false'::jsonb and j->'files'->1->'closed' = 'false'::jsonb
  from s), 'session lists the client''s files across areas, newest activity first');
select pg_temp.ok((select jsonb_array_length(public.practice_portal_session(:'smoke_client_id')->'files') = 0),
  'smoke tests never appear in the portal');
select pg_temp.ok((select f->'closed' = 'true'::jsonb from jsonb_array_elements(
  public.practice_portal_session(:'r1_client_id')->'files') f where f->>'id' = :'r1_matter_id'), 'declined file shown as closed');
select pg_temp.ok((select array_agg(f->>'number' order by f->>'number')
    = (select array_agg(n order by n) from unnest(array[:'l1_case_number', :'l2_case_number']) n)
  from jsonb_array_elements(public.practice_portal_session(:'l1_client_id')->'files') f),
  'landlord files appear in the portal, the repeat one once staff moved it');
select pg_temp.ok((select count(*) = 1 from public.practice_portal_document(:'l1_client_id', 'ltb', :'l2_case_id',
  '72200000-0000-4000-8000-000000000051')), 'and its documents can be downloaded');

select pg_temp.ok((with f as (select public.practice_portal_file(:'t1_client_id', 'traffic', :'t1_matter_id') as j)
  select pg_temp.keys(j) = pg_temp.sorted(array['area', 'id', 'number', 'stage', 'outcome', 'issue', 'ticketType',
      'category', 'createdAt', 'updatedAt', 'closedAt', 'keyDates', 'request', 'clientUploadedAt', 'documents', 'history'])
    and j->'keyDates' = '{"noticeTerminationDate":null,"hearingDate":null,"optionDeadline":"2026-10-05",
      "offenceDate":"2026-09-19","meetingDate":null,"trialDate":null,"deadlineDate":null}'::jsonb
    and j->'request' = 'null'::jsonb and j->'clientUploadedAt' = 'null'::jsonb
    and jsonb_array_length(j->'documents') = 1 and j->'documents'->0->>'name' = 'front.jpg'
    and pg_temp.keys(j->'documents'->0) = pg_temp.sorted(array['id', 'name', 'contentType', 'sizeBytes', 'uploadedAt',
      'uploadedBy', 'kind'])
    and j->'documents'->0->>'uploadedBy' = 'client'
  from f), 'file detail: key dates and only uploaded documents');
select pg_temp.ok(public.practice_portal_file(:'t1_client_id', 'general', :'t1_matter_id') is null
  and public.practice_portal_file(:'r1_client_id', 'traffic', :'t1_matter_id') is null
  and public.practice_portal_file(:'smoke_client_id', 'ltb', :'smoke_case_id') is null
  and public.practice_portal_file(:'t1_client_id', 'parking', :'t1_matter_id') is null,
  'files open only for their own client, area and real files');
select pg_temp.ok((with f as (select public.practice_portal_file(:'r1_client_id', 'traffic', :'r1_matter_id') as j)
  select jsonb_array_length(j->'history') > 0
    and (select bool_and(pg_temp.keys(h) = pg_temp.sorted(array['at', 'event', 'stage', 'count'])
          and h->>'event' in ('intake_received', 'stage_changed', 'client_uploaded', 'document_shared', 'documents_requested'))
         from jsonb_array_elements(j->'history') h)
    and j::text not like '%Checked the notice%' and j::text not like '%first appearance%'
    and j::text not like '%outcome_changed%'
    and (select array_agg(h->>'stage' order by h->>'stage') from jsonb_array_elements(j->'history') h
         where h->>'event' = 'stage_changed') = array['closed', 'declined', 'new_intake', 'quoted', 'under_review', 'under_review']
    and j->>'stage' = 'declined' and j->>'outcome' = 'declined' and j->>'closedAt' is not null
  from f), 'history is client-safe: listed events, stage and count only, never notes');
select pg_temp.ok((with f as (select public.practice_portal_file(:'l1_client_id', 'ltb', :'l1_case_id') as j)
  select j->>'number' = :'l1_case_number' and j->>'issue' = 'arrears' and j->>'stage' = 'quoted'
    and pg_temp.keys(j->'keyDates') = pg_temp.sorted(array['noticeTerminationDate', 'hearingDate', 'optionDeadline',
      'offenceDate', 'meetingDate', 'trialDate', 'deadlineDate'])
  from f), 'landlord file detail');

-- Client uploads through the portal.
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'r1_client_id', 'traffic',
  :'t1_matter_id', '[{"contentType":"image/png","size":5}]'), 'PRACTICE_CASE_NOT_FOUND', 'uploads only to your own file');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'r1_client_id', 'traffic',
  :'r1_matter_id', '[{"contentType":"image/png","size":5}]'), 'PRACTICE_FILE_CLOSED', 'closed files take no uploads');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'smoke_client_id', 'ltb',
  :'smoke_case_id', '[{"contentType":"image/png","size":5}]'), 'PRACTICE_CASE_NOT_FOUND', 'smoke files take no uploads');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'t1_client_id', 'traffic',
  :'t1_matter_id', (select jsonb_agg(jsonb_build_object('contentType', 'image/png', 'size', 5)) from generate_series(1, 7))),
  'PRACTICE_UPLOAD_LIMIT', 'six uploads per call');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'t1_client_id', 'traffic',
  :'t1_matter_id', '[]'), 'PRACTICE_DOCUMENT_INVALID', 'at least one upload');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'t1_client_id', 'traffic',
  :'t1_matter_id', '{"contentType":"image/png","size":5}'), 'PRACTICE_DOCUMENT_INVALID', 'uploads are a list');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'t1_client_id', 'traffic',
  :'t1_matter_id', '[{"contentType":"text/plain","size":5}]'), 'PRACTICE_DOCUMENT_INVALID', 'upload specs checked');
select public.practice_portal_register_uploads(:'t1_client_id', 'traffic', :'t1_matter_id',
  '[{"name":"court notice.pdf","contentType":"application/pdf","size":500},
    {"id":"72200000-0000-4000-8000-000000000030","extension":"png","contentType":"image/png","size":600,"name":"photo.png"}]')
  as uploads \gset pu_
select pg_temp.ok((with u as (select (:'pu_uploads')::jsonb as j)
  select jsonb_array_length(j) = 2 and j->1->>'documentId' = '72200000-0000-4000-8000-000000000030'
    and j->1->>'bucket' = 'practice-documents'
    and j->1->>'storagePath' = :'t1_matter_id' || '/72200000-0000-4000-8000-000000000030.png'
    and j->0->>'storagePath' = :'t1_matter_id' || '/' || (j->0->>'documentId') || '.pdf'
    and pg_temp.keys(j->0) = pg_temp.sorted(array['documentId', 'bucket', 'storagePath'])
  from u), 'registered uploads return their bucket and path in order');
select (:'pu_uploads')::jsonb->0->>'documentId' as pu_pdf \gset
select pg_temp.ok((select count(*) = 2 and bool_and(uploaded_by = 'client' and extraction_status = 'awaiting_upload'
  and uploaded_at is null) from public.practice_matter_documents
  where id in (:'pu_pdf', '72200000-0000-4000-8000-000000000030')), 'portal uploads await confirmation');
-- 40 client documents per file, counting every registration.
select pg_temp.ok((select count(*) = 6 from generate_series(1, 6) i
  cross join lateral (select public.practice_portal_register_uploads(:'g1_client_id', 'general', :'g1_matter_id',
    (select jsonb_agg(jsonb_build_object('contentType', 'image/jpeg', 'size', 100 * i + n)) from generate_series(1, 6) n)) as r) u),
  'six batches of six registered');
select pg_temp.ok((select count(*) = 36 from public.practice_matter_documents where matter_id = :'g1_matter_id'),
  'thirty-six client documents on the file');
select pg_temp.ok(jsonb_array_length(public.practice_portal_register_uploads(:'g1_client_id', 'general', :'g1_matter_id',
  '[{"contentType":"image/png","size":1},{"contentType":"image/png","size":1},{"contentType":"image/png","size":1},
    {"contentType":"image/png","size":1}]')) = 4, 'forty reached');
select pg_temp.fails(format('select public.practice_portal_register_uploads(%L, %L, %L, %L)', :'g1_client_id', 'general',
  :'g1_matter_id', '[{"contentType":"image/png","size":1}]'), 'PRACTICE_UPLOAD_LIMIT', 'forty client documents per file');
select public.practice_portal_register_uploads(:'l1_client_id', 'ltb', :'l1_case_id',
  '[{"contentType":"application/pdf","size":800,"name":"ledger.pdf"}]')->0 as upload \gset lpu_
select pg_temp.ok((:'lpu_upload')::jsonb->>'bucket' = 'ltb-documents' and (select uploaded_by = 'client'
  and extraction_status = 'awaiting_upload' and storage_path = (:'lpu_upload')::jsonb->>'storagePath'
  from public.ltb_case_documents where id = ((:'lpu_upload')::jsonb->>'documentId')::uuid), 'landlord portal uploads');

select pg_temp.fails(format('select public.practice_portal_confirm_uploads(%L, %L, %L, %L)', :'r1_client_id', 'traffic',
  :'t1_matter_id', array[:'pu_pdf']), 'PRACTICE_CASE_NOT_FOUND', 'confirm only on your own file');
select pg_temp.fails(format('select public.practice_portal_confirm_uploads(%L, %L, %L, %L, %L)', :'t1_client_id', 'traffic',
  :'t1_matter_id', array[:'pu_pdf'], repeat('x', 1001)), 'PRACTICE_NOTE_TOO_LONG', 'upload note length');
select pg_temp.ok(public.practice_portal_confirm_uploads(:'t1_client_id', 'traffic', :'t1_matter_id',
  array['72200000-0000-4000-8000-000000000030'::uuid, :'pu_pdf'::uuid, '72200000-0000-4000-8000-000000000003'::uuid],
  ' Here is the court notice ') = 2, 'two uploads confirmed; another file''s document ignored');
select pg_temp.ok((select count(*) = 2 and bool_and(uploaded_at = now() and extraction_status = 'skipped')
  from public.practice_matter_documents where id in (:'pu_pdf', '72200000-0000-4000-8000-000000000030')),
  'portal uploads are received but never read automatically');
select pg_temp.ok((select client_uploaded_at = now() from public.practice_matters where id = :'t1_matter_id'),
  'file records the client upload');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'client_uploaded' and detail = '{"count":2,"note":"Here is the court notice"}'), 'client upload logged');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where kind = 'staff_client_uploaded'
    and audience = 'staff' and case_id = :'t1_matter_id'
    and event_key = 'staff-upload/traffic/' || :'t1_matter_id' || '/72200000-0000-4000-8000-000000000030'
    and detail = '{"count":2,"note":"Here is the court notice"}'), 'staff told once per batch, keyed by its first document');
select pg_temp.ok(public.practice_portal_confirm_uploads(:'t1_client_id', 'traffic', :'t1_matter_id',
  array[:'pu_pdf'::uuid]) = 0 and public.practice_portal_confirm_uploads(:'t1_client_id', 'traffic', :'t1_matter_id', '{}') = 0,
  'confirming again changes nothing');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where kind = 'staff_client_uploaded'
  and case_id = :'t1_matter_id') and (select count(*) = 1 from public.practice_matter_events
  where matter_id = :'t1_matter_id' and event = 'client_uploaded'), 'and queues or logs nothing more');
select pg_temp.ok(public.practice_portal_confirm_uploads(:'l1_client_id', 'ltb', :'l1_case_id',
  array[((:'lpu_upload')::jsonb->>'documentId')::uuid]) = 1, 'landlord portal upload confirmed');
select pg_temp.ok((select client_uploaded_at = now() from public.ltb_cases where id = :'l1_case_id')
  and (select count(*) = 1 from public.practice_notices where kind = 'staff_client_uploaded' and area = 'ltb'
    and case_id = :'l1_case_id'), 'landlord file records it and staff are told');

select pg_temp.ok((select bucket = 'practice-documents' and storage_path = :'t1_matter_id' || '/72200000-0000-4000-8000-000000000030.png'
    and original_name = 'photo.png' and content_type = 'image/png'
  from public.practice_portal_document(:'t1_client_id', 'traffic', :'t1_matter_id', '72200000-0000-4000-8000-000000000030')),
  'client downloads their own upload');
select pg_temp.ok((select count(*) = 0 from public.practice_portal_document(:'t1_client_id', 'traffic', :'t1_matter_id',
  '72200000-0000-4000-8000-000000000002')), 'an upload that never arrived cannot be downloaded');
select pg_temp.ok((select count(*) = 0 from public.practice_portal_document(:'r1_client_id', 'traffic', :'t1_matter_id',
  '72200000-0000-4000-8000-000000000030')), 'another client cannot download it');
select pg_temp.ok((select count(*) = 0 from public.practice_portal_document(:'t1_client_id', 'general', :'t1_matter_id',
  '72200000-0000-4000-8000-000000000030')), 'downloads check the area');

-- Portal links on request.
select pg_temp.ok(not public.practice_request_portal_link('anderhue-paralegal', 'nobody@example.com'), 'unknown email');
select pg_temp.ok(not public.practice_request_portal_link('anderhue-paralegal', 'not an email'), 'invalid email');
select pg_temp.ok(not public.practice_request_portal_link('anderhue-paralegal', 'smoke@example.com'), 'smoke-only client');
reset role;
insert into public.ltb_clients (id, practice_id, email) values
  ('72300000-0000-4000-8000-000000000020', 'anderhue-paralegal', 'held-only@example.com');
insert into public.practice_matters (practice_id, client_id, area, portal_visible, intake_review_status, intake_finalized_at)
  values ('anderhue-paralegal', '72300000-0000-4000-8000-000000000020', 'general', false, 'needs_review', now());
set local role service_role;
select pg_temp.ok(not public.practice_request_portal_link('anderhue-paralegal', 'held-only@example.com'),
  'a client whose only file is held');
select pg_temp.ok(not public.practice_request_portal_link('other-practice', 'driver@example.com'),
  'practice with client emails off');
select pg_temp.ok(public.practice_request_portal_link('anderhue-paralegal', ' Driver@Example.com '), 'link queued');
select pg_temp.ok(not public.practice_request_portal_link('anderhue-paralegal', 'driver@example.com'),
  'one link per ten minutes');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where kind = 'portal_link' and audience = 'client'
    and area is null and case_id is null and client_id = :'t1_client_id' and recipients = array['driver@example.com']
    and snapshot->'file' = 'null'::jsonb and snapshot->'client'->>'email' = 'driver@example.com'
    and event_key = format('portal-link/%s/%s', :'t1_client_id', floor(extract(epoch from now()) / 600)::bigint)),
  'portal link notice has no file');

-- ---------------------------------------------------------------------------
-- 8. Staff requests and documents (practice licensee)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset

select pg_temp.fails(format('select public.practice_request_documents(%L, %L, %L)', 'traffic', :'t1_matter_id', '   '),
  'PRACTICE_MESSAGE_REQUIRED', 'request needs a message');
select pg_temp.fails(format('select public.practice_request_documents(%L, %L, %L)', 'traffic', :'t1_matter_id',
  repeat('m', 1001)), 'PRACTICE_MESSAGE_TOO_LONG', 'request message length');
select pg_temp.fails(format('select public.practice_request_documents(%L, %L, %L)', 'traffic', :'r1_matter_id',
  'Please send it'), 'PRACTICE_FILE_CLOSED', 'closed files cannot ask for uploads');
select pg_temp.fails(format('select public.practice_request_documents(%L, %L, %L)', 'traffic', :'o1_matter_id',
  'Please send it'), 'PRACTICE_CASE_NOT_FOUND', 'requests only on your practice''s files');
select public.practice_request_documents('traffic', :'t1_matter_id', 'Please upload the back of the ticket.') as notice \gset rq_
select pg_temp.ok(:'rq_notice' <> '' and (select client_request_message = 'Please upload the back of the ticket.'
  and client_request_at = now() from public.practice_matters where id = :'t1_matter_id'), 'request recorded');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'documents_requested' and actor_id = '72100000-0000-4000-8000-000000000001'), 'request logged');
select pg_temp.ok((select count(*) = 0 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'case_updated'), 'portal columns are not logged as staff edits');
select public.practice_request_documents('ltb', :'l1_case_id', 'Please upload the signed lease.') as notice \gset lrq_
select pg_temp.ok((select count(*) = 0 from public.ltb_case_events where case_id = :'l1_case_id' and event = 'case_updated')
  and (select count(*) = 1 from public.ltb_case_events where case_id = :'l1_case_id' and event = 'documents_requested'),
  'landlord request logged once');

reset role;
select pg_temp.ok((select kind = 'documents_requested' and audience = 'client' and area = 'traffic'
    and detail = '{"message":"Please upload the back of the ticket."}' and next_attempt_at = now()
    and event_key = format('request/traffic/%s/%s', :'t1_matter_id', floor(extract(epoch from now()) * 1000)::bigint)
    and snapshot->'file'->'request' = jsonb_build_object('message', 'Please upload the back of the ticket.', 'at', now())
  from public.practice_notices where id = :'rq_notice'), 'request email queued with the message');
-- The upload before the request does not answer it.
update public.practice_matters set client_uploaded_at = now() - interval '1 hour' where id = :'t1_matter_id';
set local role service_role;
select pg_temp.ok((select f->'requestOpen' = 'true'::jsonb from jsonb_array_elements(
  public.practice_portal_session(:'t1_client_id')->'files') f where f->>'id' = :'t1_matter_id'), 'open request shown');
select pg_temp.ok((select public.practice_portal_file(:'t1_client_id', 'traffic', :'t1_matter_id')->'request'
  = jsonb_build_object('message', 'Please upload the back of the ticket.', 'at', now())), 'request shown in the file');

set local role authenticated;
select public.practice_clear_request('traffic', :'t1_matter_id');
select public.practice_clear_request('traffic', :'t1_matter_id');
reset role;
select pg_temp.ok((select client_request_message is null and client_request_at is null from public.practice_matters
  where id = :'t1_matter_id')
  and (select status = 'cancelled' and failure_code = 'request_cleared' from public.practice_notices where id = :'rq_notice')
  and (select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id' and event = 'request_cleared'),
  'clearing cancels the unsent request email and is logged once');

-- Asking a held file's client for documents takes the file forward into the
-- portal. A request email waiting to retry is cancelled by clearing too.
set local role authenticated;
select public.practice_request_documents('general', :'r4_matter_id', 'Please upload the board letter.') as notice \gset r4rq_
reset role;
select pg_temp.ok((select portal_visible from public.practice_matters where id = :'r4_matter_id')
  and (select count(*) = 1 from public.practice_notices where id = :'r4rq_notice' and recipients = array['receipt@example.com']),
  'a document request puts a held file into the portal and emails its client');
update public.practice_notices set status = 'retry', attempt_count = 1, first_attempt_at = clock_timestamp(),
  failure_code = 'provider_timeout' where id = :'r4rq_notice';
set local role authenticated;
select public.practice_clear_request('general', :'r4_matter_id');
reset role;
select pg_temp.ok((select status = 'cancelled' and failure_code = 'request_cleared' from public.practice_notices
  where id = :'r4rq_notice'), 'clearing also stops a request email waiting to retry');
set local role authenticated;

-- Practice documents.
select pg_temp.fails(format('select * from public.practice_staff_add_document(%L, %L, %L, %L, %L)', 'traffic',
  :'t1_matter_id', 'letter.txt', 'text/plain', 100), 'PRACTICE_DOCUMENT_INVALID', 'staff content types');
select pg_temp.fails(format('select * from public.practice_staff_add_document(%L, %L, %L, %L, %L)', 'traffic',
  :'t1_matter_id', 'letter.pdf', 'application/pdf', 0), 'PRACTICE_DOCUMENT_INVALID', 'staff file size');
select pg_temp.fails(format('select * from public.practice_staff_add_document(%L, %L, %L, %L, %L)', 'traffic',
  :'t1_matter_id', '  ', 'application/pdf', 100), 'PRACTICE_DOCUMENT_INVALID', 'staff documents need a name');
select pg_temp.fails(format('select * from public.practice_staff_add_document(%L, %L, %L, %L, %L, %L)', 'traffic',
  :'t1_matter_id', 'lease.pdf', 'application/pdf', 100, 'lease'), 'PRACTICE_DOCUMENT_INVALID', 'document kinds per area');
select pg_temp.fails(format('select * from public.practice_staff_add_document(%L, %L, %L, %L, %L, null, null)', 'traffic',
  :'t1_matter_id', 'memo.pdf', 'application/pdf', 100), 'PRACTICE_DOCUMENT_INVALID', 'share flag required');
select pg_temp.fails(format('select * from public.practice_staff_add_document(%L, %L, %L, %L, %L)', 'traffic',
  :'o1_matter_id', 'memo.pdf', 'application/pdf', 100), 'PRACTICE_CASE_NOT_FOUND', 'documents only on your practice''s files');
select * from public.practice_staff_add_document('traffic', :'t1_matter_id', 'Disclosure letter.pdf', 'application/pdf',
  1234, 'disclosure', true) \gset sd1_
select * from public.practice_staff_add_document('traffic', :'t1_matter_id', 'Internal memo.pdf', 'application/pdf',
  99, 'correspondence') \gset sd2_
select * from public.practice_staff_add_document('ltb', :'l1_case_id', 'Notice to tenant.pdf', 'application/pdf',
  500, 'notice') \gset sd3_
select pg_temp.ok(:'sd1_bucket' = 'practice-documents' and :'sd3_bucket' = 'ltb-documents'
  and :'sd1_storage_path' = :'t1_matter_id' || '/' || :'sd1_document_id' || '.pdf', 'staff upload paths');
select pg_temp.ok((select uploaded_by = 'staff' and uploaded_at is null and extraction_status = 'skipped'
  and shared_with_client and kind = 'disclosure' and original_name = 'Disclosure letter.pdf'
  from public.practice_matter_documents where id = :'sd1_document_id')
  and (select uploaded_by = 'staff' and not shared_with_client from public.ltb_case_documents where id = :'sd3_document_id'),
  'staff documents registered, not yet uploaded');

-- Storage: staff may upload once, only to a registered staff path.
insert into storage.objects (bucket_id, name, owner)
  values ('practice-documents', :'sd1_storage_path', '72100000-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name, owner)
  values ('ltb-documents', :'sd3_storage_path', '72100000-0000-4000-8000-000000000001');
select pg_temp.fails(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'practice-documents',
  :'t1_matter_id' || '/' || gen_random_uuid() || '.pdf'), '42501', 'unregistered path refused');
select pg_temp.fails(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'practice-documents',
  :'t1_matter_id' || '/72200000-0000-4000-8000-000000000002.pdf'), '42501', 'client upload paths are not for staff');
select pg_temp.fails(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'ltb-documents',
  :'sd2_storage_path'), '42501', 'paths are registered per bucket');
select pg_temp.ok((select count(*) = 1 from storage.objects where bucket_id = 'practice-documents'),
  'members read their practice''s stored documents');

set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000003', true) as claim \gset
select pg_temp.fails(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'practice-documents',
  :'sd2_storage_path'), '42501', 'Fabsy case manager cannot upload practice documents');
select pg_temp.ok((select count(*) = 0 from storage.objects), 'Fabsy case manager reads no stored documents');
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000004', true) as claim \gset
select pg_temp.fails(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'practice-documents',
  :'sd2_storage_path'), '42501', 'another practice cannot upload here');
reset role;
set local role anon;
select pg_temp.fails(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'practice-documents',
  :'sd2_storage_path'), '42501', 'anonymous uploads refused');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset

select pg_temp.fails(format('select public.practice_staff_confirm_document(%L, %L)', 'traffic', :'sd2_document_id'),
  'PRACTICE_UPLOAD_MISSING', 'confirm needs the stored object');
select pg_temp.fails(format('select public.practice_staff_confirm_document(%L, %L)', 'ltb', :'sd1_document_id'),
  'PRACTICE_CASE_NOT_FOUND', 'documents are looked up in their area');
select pg_temp.ok(public.practice_staff_confirm_document('traffic', :'sd1_document_id'), 'staff upload confirmed');
select pg_temp.ok(not public.practice_staff_confirm_document('traffic', :'sd1_document_id'), 'confirm is single use');
select pg_temp.ok(not public.practice_staff_confirm_document('traffic', '72200000-0000-4000-8000-000000000030'),
  'client uploads are not confirmed by staff');
select pg_temp.ok(public.practice_staff_confirm_document('ltb', :'sd3_document_id'), 'landlord staff upload confirmed');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
    and event = 'staff_uploaded' and detail->>'documentId' = :'sd1_document_id')
  and (select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
    and event = 'document_shared' and detail->>'documentId' = :'sd1_document_id'),
  'upload and share logged');
select pg_temp.fails(format('select public.practice_set_document_shared(%L, %L, true)', 'traffic',
  '72200000-0000-4000-8000-000000000030'), 'PRACTICE_DOCUMENT_INVALID', 'client uploads are always theirs');
select pg_temp.fails(format('select public.practice_set_document_shared(%L, %L, null)', 'traffic', :'sd2_document_id'),
  'PRACTICE_DOCUMENT_INVALID', 'share flag required');
select pg_temp.ok(not public.practice_set_document_shared('traffic', :'sd1_document_id', true), 'already shared');
reset role;
select pg_temp.ok((select count(*) = 1 from public.practice_notices where event_key = 'shared/' || :'sd1_document_id'
    and status = 'pending' and next_attempt_at = now() + interval '90 seconds'),
  'sharing is announced after the 90-second undo window');
set local role authenticated;
select pg_temp.ok(public.practice_set_document_shared('traffic', :'sd1_document_id', false), 'unshared');
reset role;
select pg_temp.ok((select count(*) = 0 from public.practice_notices where event_key = 'shared/' || :'sd1_document_id'),
  'unsharing withdraws the announcement that has not gone out');
set local role authenticated;
select pg_temp.ok(public.practice_set_document_shared('traffic', :'sd1_document_id', true), 'shared again');
select pg_temp.ok(public.practice_set_document_shared('traffic', :'sd2_document_id', true), 'pending upload marked shared');

reset role;
select pg_temp.ok((select count(*) = 1 from public.practice_notices where event_key = 'shared/' || :'sd1_document_id'
    and kind = 'document_shared' and audience = 'client' and case_id = :'t1_matter_id' and client_id = :'t1_client_id'
    and status = 'pending' and next_attempt_at = now() + interval '90 seconds'
    and created_by = '72100000-0000-4000-8000-000000000001'
    and detail = jsonb_build_object('documentId', :'sd1_document_id', 'documentName', 'Disclosure letter.pdf')),
  'sharing again announces the document once, after the undo window');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where event_key = 'shared/' || :'sd2_document_id'),
  'nothing is announced before the upload arrives');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'document_unshared'), 'unsharing logged');
-- After confirmation the path is closed to staff uploads.
delete from storage.objects where name = :'sd1_storage_path';
set local role authenticated;
select pg_temp.fails(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'practice-documents',
  :'sd1_storage_path'), '42501', 'a confirmed document cannot be overwritten');
reset role;
insert into storage.objects (bucket_id, name) values ('practice-documents', :'sd2_storage_path');
set local role authenticated;
select pg_temp.ok(public.practice_staff_confirm_document('traffic', :'sd2_document_id'), 'shared upload confirmed');
reset role;
select pg_temp.ok((select count(*) = 1 from public.practice_notices where event_key = 'shared/' || :'sd2_document_id'
    and status = 'pending' and next_attempt_at = now() + interval '90 seconds'),
  'a document registered as shared is announced when it arrives, after the undo window');
-- An announcement waiting to retry may already have been delivered: unsharing
-- cancels it and it is never sent again.
update public.practice_notices set status = 'retry', attempt_count = 1, first_attempt_at = clock_timestamp(),
  failure_code = 'provider_timeout' where event_key = 'shared/' || :'sd2_document_id';
set local role authenticated;
select pg_temp.ok(public.practice_set_document_shared('traffic', :'sd2_document_id', false), 'unshared while retrying');
select pg_temp.ok(public.practice_set_document_shared('traffic', :'sd2_document_id', true), 'and shared again');
reset role;
select pg_temp.ok((select count(*) = 1 and bool_and(status = 'cancelled' and failure_code = 'document_unshared')
  from public.practice_notices where event_key = 'shared/' || :'sd2_document_id'),
  'an announcement that may have gone out is cancelled, not repeated');

-- Sharing a document on a held file takes the file forward into the portal.
set local role authenticated;
select * from public.practice_staff_add_document('general', :'r5_matter_id', 'Engagement letter.pdf', 'application/pdf',
  700, 'correspondence', true) \gset sd5_
reset role;
insert into storage.objects (bucket_id, name) values ('practice-documents', :'sd5_storage_path');
select pg_temp.ok((select not portal_visible from public.practice_matters where id = :'r5_matter_id'),
  'registering a document does not reveal the file');
set local role authenticated;
select pg_temp.ok(public.practice_staff_confirm_document('general', :'sd5_document_id'), 'shared document on a held file');
reset role;
select pg_temp.ok((select portal_visible from public.practice_matters where id = :'r5_matter_id')
  and (select count(*) = 1 from public.practice_notices where event_key = 'shared/' || :'sd5_document_id'
    and recipients = array['receipt@example.com']), 'sharing puts the held file into the portal and announces it');
set local role service_role;
select pg_temp.ok((select count(*) = 1 from public.practice_portal_document(:'r1_client_id', 'general', :'r5_matter_id',
  '72200000-0000-4000-8000-000000000050')), 'the file''s documents can now be downloaded');
reset role;

set local role service_role;
select pg_temp.ok((select count(*) = 1 from public.practice_portal_document(:'t1_client_id', 'traffic', :'t1_matter_id',
  :'sd1_document_id')) and (select count(*) = 1 from public.practice_portal_document(:'t1_client_id', 'traffic',
  :'t1_matter_id', :'sd2_document_id')), 'shared practice documents can be downloaded');
select pg_temp.ok((select count(*) = 0 from public.practice_portal_document(:'l1_client_id', 'ltb', :'l1_case_id',
  :'sd3_document_id')), 'unshared practice documents stay internal');
select pg_temp.ok((with f as (select public.practice_portal_file(:'t1_client_id', 'traffic', :'t1_matter_id') as j)
  select (select count(*) = 2 from jsonb_array_elements(j->'documents') d where d->>'uploadedBy' = 'staff')
    and (select count(*) = 1 from jsonb_array_elements(j->'history') h where h->>'event' = 'client_uploaded'
         and h->'count' = '2'::jsonb)
    and (select count(*) = 1 from jsonb_array_elements(j->'history') h where h->>'event' = 'documents_requested'
         and h->'stage' = 'null'::jsonb)
  from f), 'file detail lists shared practice documents and safe history counts');
select pg_temp.ok((select public.practice_portal_file(:'t1_client_id', 'traffic', :'t1_matter_id')::text
  not like '%Here is the court notice%' and public.practice_portal_file(:'t1_client_id', 'traffic', :'t1_matter_id')::text
  not like '%Please upload the back%'), 'history never carries notes or request messages');
select pg_temp.ok((with f as (select public.practice_portal_file(:'l1_client_id', 'ltb', :'l1_case_id') as j)
  select jsonb_array_length(j->'documents') = 1 and j->'documents'->0->>'name' = 'ledger.pdf' from f),
  'landlord file lists the client upload but not the internal notice');

-- An uploaded practice document that was never shared stays internal.
set local role authenticated;
select * from public.practice_staff_add_document('traffic', :'t1_matter_id', 'Prosecutor notes.pdf', 'application/pdf',
  321, 'correspondence') \gset sd4_
reset role;
insert into storage.objects (bucket_id, name) values ('practice-documents', :'sd4_storage_path');
set local role authenticated;
select pg_temp.ok(public.practice_staff_confirm_document('traffic', :'sd4_document_id'), 'internal document uploaded');
set local role service_role;
select pg_temp.ok((with f as (select public.practice_portal_file(:'t1_client_id', 'traffic', :'t1_matter_id') as j)
  select (select count(*) = 0 from jsonb_array_elements(j->'documents') d where d->>'id' = :'sd4_document_id')
    and (select count(*) = 2 from jsonb_array_elements(j->'documents') d where d->>'uploadedBy' = 'staff') from f)
  and (select count(*) = 0 from public.practice_portal_document(:'t1_client_id', 'traffic', :'t1_matter_id',
    :'sd4_document_id')), 'unshared practice documents are neither listed nor downloadable');

-- ---------------------------------------------------------------------------
-- 9. Cancel, staff-opened files, registration and portal revocation
-- ---------------------------------------------------------------------------
select id as portal_notice from public.practice_notices where kind = 'portal_link' and client_id = :'t1_client_id' \gset
select id as staff_notice from public.practice_notices where kind = 'staff_new_intake' and case_id = :'g1_matter_id' \gset
update public.practice_notices set status = 'retry', attempt_count = 1, first_attempt_at = clock_timestamp(),
  failure_code = 'provider_timeout' where id = :'n_r3';
set local role authenticated;
select pg_temp.ok(public.practice_cancel_notice(:'n_dc'), 'pending client update cancelled');
select pg_temp.ok(not public.practice_cancel_notice(:'n_dc'), 'cancel is single use');
select pg_temp.ok(public.practice_cancel_notice(:'n_r3'), 'an update waiting to retry can be cancelled too');
select pg_temp.ok(not public.practice_cancel_notice(:'staff_notice'), 'staff alerts are not cancelled here');
select pg_temp.ok(not public.practice_cancel_notice(:'b_new'), 'sent emails cannot be cancelled');
select pg_temp.ok(not public.practice_cancel_notice(:'h_back'), 'an email being sent cannot be cancelled');
select pg_temp.ok(public.practice_cancel_notice(:'portal_notice'), 'portal link cancelled');
select pg_temp.fails(format('select public.practice_cancel_notice(%L)', gen_random_uuid()), 'PRACTICE_CASE_NOT_FOUND',
  'unknown notice');
select pg_temp.ok((select status = 'cancelled' and failure_code = 'cancelled_by_staff' from public.practice_notices
    where id = :'n_dc')
  and (select status = 'cancelled' and failure_code = 'cancelled_by_staff' from public.practice_notices where id = :'n_r3')
  and (select status = 'sending' from public.practice_notices where id = :'h_back')
  and (select count(*) = 1 from public.practice_matter_events where matter_id = :'r1_matter_id' and event = 'notice_cancelled'),
  'cancelled and logged on the file');
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000004', true) as claim \gset
select pg_temp.fails(format('select public.practice_cancel_notice(%L)', :'n_dc'), 'PRACTICE_CASE_NOT_FOUND',
  'another practice cannot cancel');
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset

select pg_temp.fails($$select * from public.practice_create_matter('anderhue-paralegal', 'parking', '{"email":"w@example.com"}', '{}')$$,
  'PRACTICE_AREA_INVALID', 'create checks the area');
select pg_temp.fails($$select * from public.practice_create_matter('anderhue-paralegal', 'traffic', '{"email":"walk-in"}', '{}')$$,
  'PRACTICE_EMAIL_INVALID', 'create needs a client email');
select pg_temp.fails($$select * from public.practice_create_matter('anderhue-paralegal', 'traffic', null, '{}')$$,
  'PRACTICE_INTAKE_INVALID', 'create needs a client');
select pg_temp.fails($$select * from public.practice_create_matter('anderhue-paralegal', 'ltb', '{"email":"w@example.com"}',
  '{"issue":"eviction"}')$$, 'PRACTICE_INTAKE_INVALID', 'landlord issue vocabulary');
select pg_temp.fails($$select * from public.practice_create_matter('anderhue-paralegal', 'general', '{"email":"w@example.com"}',
  '{"deadline":"tomorrow"}')$$, 'PRACTICE_INTAKE_INVALID', 'deadline format');
select pg_temp.fails($$select * from public.practice_create_matter('other-practice', 'traffic', '{"email":"w@example.com"}', '{}')$$,
  'PRACTICE_CASE_NOT_FOUND', 'files only in your own practice');

-- (\gset unsets a variable for a null column, so notice ids are spelled out.)
select case_id, case_number, client_id, coalesce(notice_id::text, 'none') as notice_id
  from public.practice_create_matter('anderhue-paralegal', 'ltb',
  '{"email":"Walk-In@Example.com","firstName":"Wally","lastName":"Walker","phone":"9055550199","organizationName":"Walker Holdings"}',
  '{"issue":"n12_own_use","city":"Oshawa","notes":"Called about an N12"}', true) \gset cl_
select case_id, case_number, client_id, coalesce(notice_id::text, 'none') as notice_id
  from public.practice_create_matter('anderhue-paralegal', 'traffic', '{"email":"walk-in@example.com"}',
  '{"ticketType":"careless","ticketCity":"Oshawa","ticketReceivedOn":"2026-09-28","notes":"Walk-in"}', true) \gset ct_
select case_id, case_number, client_id, coalesce(notice_id::text, 'none') as notice_id
  from public.practice_create_matter('anderhue-paralegal', 'general', '{"email":"walk-in@example.com"}',
  '{"category":"notary","otherParty":"City of Oshawa","notes":"Affidavit"}') \gset cg_
select pg_temp.ok(:'cl_case_number' ~ '^LTB-[0-9]{4}-[0-9]{4,}$' and :'ct_case_number' ~ '^TKT-[0-9]{4}-[0-9]{4,}$'
  and :'cg_case_number' ~ '^MAT-[0-9]{4}-[0-9]{4,}$' and :'cl_client_id' = :'ct_client_id'
  and :'ct_client_id' = :'cg_client_id', 'staff open files in every area for one client');
select pg_temp.ok(:'cl_notice_id' <> 'none' and :'ct_notice_id' <> 'none' and :'cg_notice_id' = 'none',
  'invites only when asked');
reset role;
select pg_temp.ok((select client_type = 'organization' and organization_name = 'Walker Holdings' and first_name = 'Wally'
    and email = 'walk-in@example.com' and registration_status = 'provisional' and field_sources->'phone' = '{"source":"staff"}'
  from public.ltb_clients where id = :'cl_client_id'), 'staff-entered client recorded with its source');
select pg_temp.ok((select source = 'staff' and intake_review_status = 'needs_review' and intake_finalized_at = now()
    and issue = 'n12_own_use' and unit_city = 'Oshawa' and review_notes = 'Called about an N12' and client_notes is null
    and field_sources = '{"issue":{"source":"staff"},"unit_city":{"source":"staff"}}'
  from public.ltb_cases where id = :'cl_case_id'), 'staff landlord file starts in review; staff notes stay internal');
select pg_temp.ok((select source = 'staff' and ticket_type = 'careless' and option_deadline = '2026-10-13'
    and field_sources->'option_deadline' = '{"source":"staff","confidence":"low"}'
    and review_notes like 'Walk-in%2026-10-13 is an estimate%'
  from public.practice_matters where id = :'ct_case_id'), 'staff traffic file estimates the deadline too');
select pg_temp.ok((select count(*) = 1 from public.practice_notices where id = :'cl_notice_id' and kind = 'upload_invite'
    and event_key = 'invite/ltb/' || :'cl_case_id' and recipients = array['walk-in@example.com']
    and created_by = '72100000-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.practice_notices where id = :'ct_notice_id'
    and event_key = 'invite/traffic/' || :'ct_case_id'), 'upload invites queued');
select pg_temp.ok((select count(*) = 0 from public.practice_notices where kind = 'intake_received'
  and case_id in (:'cl_case_id', :'ct_case_id', :'cg_case_id')), 'staff-opened files get no intake receipt');
select pg_temp.ok((select count(*) = 1 from public.ltb_intake_alerts where case_id = :'cl_case_id')
  and (select count(*) = 1 from public.practice_notices where kind = 'staff_new_intake' and case_id = :'ct_case_id'),
  'staff-opened files alert like any intake (landlord files keep the LTB outbox)');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'ct_case_id'
  and event = 'intake_received' and actor_id = '72100000-0000-4000-8000-000000000001'
  and detail = '{"returningClient":false,"documents":0,"source":"staff"}'), 'staff opening logged');

-- Registered clients are protected everywhere; registration reaches every file.
set local role authenticated;
update public.ltb_clients set mailing_address = '1 Main St', occupation = 'Driver' where id = :'t1_client_id';
select pg_temp.ok((select registration_status = 'registered' from public.ltb_set_client_registration(:'t1_client_id',
  'registered')), 'client registered');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'g1_matter_id'
  and event = 'client_registration_changed') and (select count(*) = 1 from public.practice_matter_events
  where matter_id = :'t1_matter_id' and event = 'client_updated' and detail = '{"fields":["mailing_address","occupation"]}'),
  'client edits and registration are logged on traffic and other files');
select * from public.practice_create_matter('anderhue-paralegal', 'general',
  '{"email":"driver@example.com","firstName":"Someone","phone":"111"}', '{"category":"other"}') \gset cr_
reset role;
set local role service_role;
select * from public.practice_register_intake('anderhue-paralegal', 'traffic',
  '{"email":"driver@example.com","firstName":"Imposter","lastName":"Person","phone":"222"}', repeat('e', 64), '[]') \gset ri_
select pg_temp.ok(:'ri_returning_client' = 't' and :'cr_client_id' = :'t1_client_id', 'registered client recognized');
select pg_temp.ok((select first_name = 'Dana' and last_name = 'Driver' and phone = '4165550100'
  from public.ltb_clients where id = :'t1_client_id'), 'registered details unchanged by forms or staff shortcuts');
select pg_temp.ok((select review_notes like 'Returning client. Name entered on the form (Imposter Person) differs%'
    and review_notes like '%Phone entered on the form (222) differs%'
  from public.practice_matters where id = :'ri_matter_id')
  and (select review_notes like 'Returning client. Name entered by staff (Someone) differs%'
  from public.practice_matters where id = :'cr_case_id'), 'differences left for staff');
select pg_temp.ok((select not portal_visible from public.practice_matters where id = :'ri_matter_id')
  and (select count(*) = 0 from public.practice_notices where case_id = :'ri_matter_id' and audience = 'client'),
  'a public intake in a registered client''s name is held, with no receipt');
select pg_temp.ok((select portal_visible from public.ltb_cases where id = :'cl_case_id')
  and (select count(*) = 3 and bool_and(portal_visible) from public.practice_matters
    where id in (:'ct_case_id', :'cg_case_id', :'cr_case_id')), 'staff-opened files are always in the portal');

-- Revoking portal links. Emails not yet sent to the client are cancelled too
-- (their links would no longer work).
reset role;
select public.practice_enqueue_notice('anderhue-paralegal', 'traffic', :'t1_matter_id', null, 'upload_invite',
  'invite/traffic/' || :'t1_matter_id') as t1_invite \gset
update public.practice_notices set status = 'retry', attempt_count = 1, first_attempt_at = clock_timestamp(),
  failure_code = 'provider_timeout' where id = :'t1_invite';
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000004', true) as claim \gset
select pg_temp.fails(format('select public.practice_revoke_portal_access(%L)', :'t1_client_id'), 'PRACTICE_CASE_NOT_FOUND',
  'another practice cannot revoke');
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset
select pg_temp.ok(public.practice_revoke_portal_access(:'t1_client_id') = now(), 'portal links revoked');
reset role;
select pg_temp.ok((select portal_revoked_before = now() from public.ltb_clients where id = :'t1_client_id')
  and (select count(*) = 4 from public.practice_matter_events where event = 'portal_access_revoked'
    and matter_id in (select id from public.practice_matters where client_id = :'t1_client_id'))
  and (select count(*) = 0 from public.practice_matter_events where event = 'client_updated'
    and detail->'fields' ? 'portal_revoked_before'), 'revocation logged on every file of the client');
select pg_temp.ok((select count(*) = 2 and bool_and(status = 'cancelled' and failure_code = 'portal_access_revoked')
    from public.practice_notices where id in (:'t1_invite', (select id from public.practice_notices
      where event_key = 'shared/' || :'sd1_document_id')))
  and (select count(*) = 0 from public.practice_notices where client_id = :'t1_client_id' and audience = 'client'
    and status in ('pending', 'retry'))
  and (select status = 'pending' from public.practice_notices where event_key = 'staff-intake/' || :'t1_matter_id'),
  'revocation cancels the client''s unsent emails, not staff alerts');
set local role service_role;
select pg_temp.ok((select (public.practice_portal_session(:'t1_client_id')->>'revokedBefore')::timestamptz = now()),
  'session reports the revocation');

-- Correcting a client's email address revokes old links and cancels emails
-- not yet sent to the old address.
reset role;
update public.practice_notices set status = 'retry', attempt_count = 1, first_attempt_at = clock_timestamp(),
  failure_code = 'provider_timeout' where id = :'ct_notice_id';
set local role authenticated;
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000004', true) as claim \gset
select pg_temp.fails(format('select public.practice_set_client_email(%L, %L)', :'cl_client_id', 'wally@walker.example'),
  'PRACTICE_CLIENT_NOT_FOUND', 'another practice cannot change the address');
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000001', true) as claim \gset
select pg_temp.fails(format('select public.practice_set_client_email(%L, %L)', gen_random_uuid(), 'wally@walker.example'),
  'PRACTICE_CLIENT_NOT_FOUND', 'unknown client');
select pg_temp.fails(format('select public.practice_set_client_email(%L, %L)', :'cl_client_id', 'not an email'),
  'PRACTICE_EMAIL_INVALID', 'address format');
select pg_temp.fails(format('select public.practice_set_client_email(%L, null)', :'cl_client_id'),
  'PRACTICE_EMAIL_INVALID', 'address required');
select pg_temp.fails(format('select public.practice_set_client_email(%L, %L)', :'cl_client_id', E'wally@walker.example\u0007'),
  'PRACTICE_EMAIL_INVALID', 'no control characters');
select pg_temp.fails(format('select public.practice_set_client_email(%L, %L)', :'cl_client_id', ' Receipt@Example.com '),
  'PRACTICE_EMAIL_TAKEN', 'another client of the practice has the address');
select pg_temp.ok(public.practice_set_client_email(:'cl_client_id', ' Walk-In@Example.com ') = 'walk-in@example.com',
  'the current address again is accepted');
reset role;
select pg_temp.ok((select portal_revoked_before is null from public.ltb_clients where id = :'cl_client_id')
  and (select count(*) = 2 from public.practice_notices where id in (:'cl_notice_id', :'ct_notice_id')
    and status in ('pending', 'retry')), 'and changes nothing');
set local role authenticated;
select pg_temp.ok(public.practice_set_client_email(:'cl_client_id', ' Wally@Walker.Example ') = 'wally@walker.example',
  'address corrected');
reset role;
select pg_temp.ok((select email = 'wally@walker.example' and portal_revoked_before = now()
    and field_sources->'email' = '{"source":"staff"}' from public.ltb_clients where id = :'cl_client_id')
  and (select count(*) = 2 from public.practice_notices where id in (:'cl_notice_id', :'ct_notice_id')
    and status = 'cancelled' and failure_code = 'client_email_changed'),
  'old links revoked and emails to the old address cancelled');
select pg_temp.ok((select count(*) = 1 from public.ltb_case_events where case_id = :'cl_case_id' and event = 'client_updated'
    and detail = '{"fields":["email"]}')
  and (select count(*) = 1 from public.practice_matter_events where matter_id = :'ct_case_id' and event = 'client_updated'
    and detail = '{"fields":["email"]}'), 'the correction is logged on the client''s files');
set local role authenticated;
select (public.practice_set_stage('traffic', :'ct_case_id', 'under_review'))->>'noticeId' as wc_notice \gset
reset role;
select pg_temp.ok((select recipients = array['wally@walker.example'] and snapshot->'client'->>'email' = 'wally@walker.example'
  from public.practice_notices where id = :'wc_notice'), 'new emails go to the corrected address');
set local role service_role;
select pg_temp.ok(not public.practice_request_portal_link('anderhue-paralegal', 'walk-in@example.com'),
  'the old address no longer gets portal links');
select pg_temp.ok(public.practice_request_portal_link('anderhue-paralegal', 'wally@walker.example'),
  'the corrected one does');

-- ---------------------------------------------------------------------------
-- 10. Row level security and grants
-- ---------------------------------------------------------------------------
reset role;
select count(*) as anderhue_matters from public.practice_matters where practice_id = 'anderhue-paralegal' \gset
select count(*) as all_matters from public.practice_matters \gset

set local role authenticated;
select pg_temp.ok((select count(*) = :anderhue_matters from public.practice_matters)
  and (select count(*) = 0 from public.practice_matters where practice_id <> 'anderhue-paralegal')
  and (select count(*) = 0 from public.practice_notices where practice_id <> 'anderhue-paralegal')
  and (select count(*) > 0 from public.practice_notices)
  and (select count(*) = 0 from public.practice_matter_events where practice_id <> 'anderhue-paralegal'),
  'practice members see only their practice');
select pg_temp.ok((select count(*) > 0 from (select id, practice_id, area, case_id, audience, kind, detail, status,
  next_attempt_at, sent_at, failure_code, created_at from public.practice_notices) n), 'staff read notice status columns');
select pg_temp.ok((select count(*) > 0 from (select id, portal_visible from public.practice_matters) m)
  and (select count(*) > 0 from (select id, portal_visible from public.ltb_cases) c), 'staff see which files are in the portal');
select pg_temp.fails(format('update public.practice_matters set portal_visible = true where id = %L', :'ri_matter_id'),
  '42501', 'portal visibility changes only through staff actions');
select pg_temp.fails(format('update public.ltb_cases set portal_visible = true where id = %L', :'l1_case_id'),
  '42501', 'on landlord files too');
select pg_temp.fails(format('update public.ltb_clients set email = %L where id = %L', 'x@example.com', :'t1_client_id'),
  '42501', 'client addresses change only through practice_set_client_email');
select pg_temp.fails('select count(*) from public.practice_rate_limits', '42501', 'staff cannot read rate limits');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 3, 60)', repeat('e', 64)), '42501',
  'or use the rate limiter');
select pg_temp.fails('select snapshot from public.practice_notices', '42501', 'staff never read snapshots');
select pg_temp.fails('select email_payload from public.practice_notices', '42501', 'staff never read rendered emails');
select pg_temp.fails('select recipients from public.practice_notices', '42501', 'staff never read recipients');
select pg_temp.fails('select * from public.practice_notices', '42501', 'no wildcard reads of notices');
select pg_temp.fails('update public.practice_notices set status = ''cancelled''', '42501', 'notices change only via functions');
select pg_temp.fails('delete from public.practice_notices', '42501', 'notices are never deleted by staff');
select pg_temp.fails(format('update public.practice_matters set matter_number = %L where id = %L', 'TKT-2026-0000',
  :'g1_matter_id'), '42501', 'file numbers are not staff columns');
select pg_temp.fails(format('update public.practice_matters set stage = %L where id = %L', 'quoted', :'g1_matter_id'),
  '42501', 'stages change only through practice_set_stage');
select pg_temp.fails(format('update public.practice_matters set client_request_message = %L where id = %L', 'x',
  :'g1_matter_id'), '42501', 'requests change only through functions');
update public.practice_matters set ticket_city = 'Ottawa', court_location = 'Ottawa POA Court' where id = :'t1_matter_id';
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'case_updated' and detail = '{"fields":["court_location","ticket_city"]}'
  and actor_id = '72100000-0000-4000-8000-000000000001'), 'staff corrections logged by field name');
select pg_temp.fails(format('update public.practice_matters set intake_review_status = %L where id = %L', 'pending_scan',
  :'t1_matter_id'), '42501', 'staff cannot send a file back to scanning');
select pg_temp.fails(format('insert into public.practice_matters (practice_id, client_id, area) values (%L, %L, %L)',
  'anderhue-paralegal', :'t1_client_id', 'traffic'), '42501', 'staff cannot insert files');
select pg_temp.fails(format('delete from public.practice_matters where id = %L', :'g1_matter_id'), '42501',
  'staff cannot delete files');
select pg_temp.fails(format('insert into public.practice_matter_documents (matter_id, practice_id, storage_path, content_type, size_bytes) values (%L, %L, %L, %L, 1)',
  :'g1_matter_id', 'anderhue-paralegal', 'x', 'image/png'), '42501', 'staff cannot insert document rows');
select pg_temp.fails(format('insert into public.practice_matter_events (matter_id, practice_id, event) values (%L, %L, %L)',
  :'g1_matter_id', 'anderhue-paralegal', 'forged_event'), '42501', 'staff cannot write the event log');
select pg_temp.fails('select nextval(''public.practice_traffic_number_seq'')', '42501', 'number sequences are private');
select pg_temp.fails(format('select * from public.practice_register_intake(%L, %L, %L, %L)', 'anderhue-paralegal',
  'traffic', '{"email":"x@y.zz"}', repeat('a', 64)), '42501', 'staff cannot call intake functions');
select pg_temp.fails('select * from public.claim_practice_notices(1)', '42501', 'staff cannot claim notices');
select pg_temp.fails(format('select public.practice_portal_session(%L)', :'t1_client_id'), '42501',
  'staff cannot open client portal sessions');
select pg_temp.fails(format('select public.practice_enqueue_notice(%L, %L, %L, null, %L, %L)', 'anderhue-paralegal',
  'traffic', :'t1_matter_id', 'upload_invite', 'invite/forged'), '42501', 'staff cannot queue arbitrary notices');
select pg_temp.fails(format('select public.practice_notice_snapshot(%L, %L, null)', 'traffic', :'t1_matter_id'), '42501',
  'staff cannot build snapshots');

select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000004', true) as claim \gset
select pg_temp.ok((select count(*) = 1 and bool_and(practice_id = 'other-practice') from public.practice_matters)
  and (select count(*) > 0 and bool_and(practice_id = 'other-practice') from public.practice_notices),
  'the other practice sees only its own files and notices');
select set_config('request.jwt.claim.sub', '72100000-0000-4000-8000-000000000002', true) as claim \gset
select pg_temp.ok((select count(*) = :all_matters from public.practice_matters), 'Fabsy admins support every practice');
select set_config('request.jwt.claim.sub', '', true) as claim \gset
select pg_temp.ok((select count(*) = 0 from public.practice_matters), 'signed-out requests see nothing');

reset role;
set local role anon;
select pg_temp.fails('select count(*) from public.practice_matters', '42501', 'anonymous visitors cannot read files');
select pg_temp.fails('select count(*) from public.practice_matter_documents', '42501', 'or documents');
select pg_temp.fails('select id from public.practice_notices', '42501', 'or notices');
select pg_temp.fails(format('select public.practice_portal_session(%L)', :'t1_client_id'), '42501',
  'anonymous visitors cannot call portal functions');
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'traffic', :'t1_matter_id', 'quoted'), '42501',
  'or staff functions');
select pg_temp.fails('select public.practice_staff_can_upload(''practice-documents'', ''x'')', '42501',
  'or the storage helper');
select pg_temp.fails(format('select public.practice_set_client_email(%L, %L)', :'t1_client_id', 'x@example.com'), '42501',
  'or client address changes');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 3, 60)', repeat('e', 64)), '42501',
  'or the rate limiter');
select pg_temp.fails('select count(*) from public.practice_rate_limits', '42501', 'or its table');

reset role;
set local role service_role;
select pg_temp.fails(format('select public.practice_set_stage(%L, %L, %L)', 'traffic', :'t1_matter_id', 'quoted'), '42501',
  'staff functions are not service functions');
select pg_temp.fails(format('select public.practice_set_client_email(%L, %L)', :'t1_client_id', 'x@example.com'), '42501',
  'client address changes are staff decisions');

-- Rate limiter for the public edge functions: a counted window per key hash.
select pg_temp.fails('select public.practice_rate_limit_hit(''abc'', 3, 60)', 'PRACTICE_RATE_LIMIT_INVALID',
  'keys are SHA-256 hex digests');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 3, 60)', repeat('A', 64)),
  'PRACTICE_RATE_LIMIT_INVALID', 'in lower case');
select pg_temp.fails('select public.practice_rate_limit_hit(null, 3, 60)', 'PRACTICE_RATE_LIMIT_INVALID', 'key required');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 0, 60)', repeat('a', 64)),
  'PRACTICE_RATE_LIMIT_INVALID', 'limit at least 1');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 10001, 60)', repeat('a', 64)),
  'PRACTICE_RATE_LIMIT_INVALID', 'limit at most 10000');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, null, 60)', repeat('a', 64)),
  'PRACTICE_RATE_LIMIT_INVALID', 'limit required');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 3, 0)', repeat('a', 64)),
  'PRACTICE_RATE_LIMIT_INVALID', 'window at least a second');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 3, 86401)', repeat('a', 64)),
  'PRACTICE_RATE_LIMIT_INVALID', 'window at most a day');
select pg_temp.fails(format('select public.practice_rate_limit_hit(%L, 3, null)', repeat('a', 64)),
  'PRACTICE_RATE_LIMIT_INVALID', 'window required');
select pg_temp.ok(public.practice_rate_limit_hit(repeat('a', 64), 3, 60), 'first hit allowed');
select pg_temp.ok(public.practice_rate_limit_hit(repeat('a', 64), 3, 60), 'second hit allowed');
select pg_temp.ok(public.practice_rate_limit_hit(repeat('a', 64), 3, 60), 'third hit allowed');
select pg_temp.ok(not public.practice_rate_limit_hit(repeat('a', 64), 3, 60), 'fourth hit refused');
select pg_temp.ok(not public.practice_rate_limit_hit(repeat('a', 64), 3, 60), 'and every further hit in the window');
select pg_temp.ok(public.practice_rate_limit_hit(repeat('d', 64), 1, 60), 'keys count separately');
reset role;
select pg_temp.ok((select hits = 4 and window_started_at = now() from public.practice_rate_limits
  where key_hash = repeat('a', 64)), 'refused hits stop counting one past the limit');
update public.practice_rate_limits set window_started_at = now() - interval '61 seconds' where key_hash = repeat('a', 64);
insert into public.practice_rate_limits (key_hash, window_started_at, hits, updated_at) values
  (repeat('b', 64), now() - interval '3 days', 5, now() - interval '3 days'),
  (repeat('c', 64), now() - interval '1 day', 5, now() - interval '1 day');
set local role service_role;
select pg_temp.ok(public.practice_rate_limit_hit(repeat('a', 64), 3, 60), 'a new window starts after the old one');
select pg_temp.ok((select hits = 1 and window_started_at = now() from public.practice_rate_limits
  where key_hash = repeat('a', 64)), 'counting starts again');
select pg_temp.ok((select array_agg(left(key_hash, 1) order by key_hash) = array['a', 'c', 'd']
  from public.practice_rate_limits where key_hash in (repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64))),
  'keys idle for more than two days are deleted');
select pg_temp.fails(format('insert into public.practice_rate_limits (key_hash, window_started_at, hits) values (%L, now(), 1)',
  'not-a-hash'), '23514', 'only key hashes are stored');
-- Background workers write directly as the service role (like process-ltb-intake).
insert into public.practice_matter_events (matter_id, practice_id, event, detail)
  values (:'t1_matter_id', 'anderhue-paralegal', 'documents_read', '{"read":1,"unread":0}');
select pg_temp.ok((select count(*) = 1 from public.practice_matter_events where matter_id = :'t1_matter_id'
  and event = 'documents_read'), 'service role logs events without sequence privileges');
insert into public.practice_matters (practice_id, client_id, area, source, intake_review_status)
  values ('anderhue-paralegal', :'t1_client_id', 'general', 'smoke-test', 'needs_review') returning matter_number as direct_number \gset
select pg_temp.ok(:'direct_number' ~ '^MAT-[0-9]{4}-[0-9]{4,}$', 'direct inserts are numbered by the trigger');
select pg_temp.fails('select setval(''public.practice_traffic_number_seq'', 1)', '42501', 'nobody can move file numbers');
select pg_temp.fails(format('update public.practice_matters set matter_number = %L where id = %L', 'TKT-2026-0000',
  :'t1_matter_id'), 'PRACTICE_NUMBER_IMMUTABLE', 'file numbers never change');
select pg_temp.fails(format('update public.practice_matters set area = %L, ticket_type = null where id = %L', 'general',
  :'t1_matter_id'), 'PRACTICE_MATTER_IMMUTABLE', 'areas never change');
select pg_temp.fails(format('update public.practice_matters set practice_id = %L where id = %L', 'other-practice',
  :'t1_matter_id'), 'PRACTICE_MATTER_IMMUTABLE', 'files never move between practices');
reset role;
select pg_temp.fails(format('insert into public.practice_matter_documents (id, matter_id, practice_id, storage_path, content_type, size_bytes) values (%L, %L, %L, %L, %L, 1)',
  '72200000-0000-4000-8000-0000000000ff', :'t1_matter_id', 'other-practice',
  :'t1_matter_id' || '/72200000-0000-4000-8000-0000000000ff.png', 'image/png'),
  '23503', 'documents carry their file''s practice');
select pg_temp.fails(format('insert into public.practice_matter_documents (id, matter_id, practice_id, storage_path, content_type, size_bytes) values (%L, %L, %L, %L, %L, 1)',
  '72200000-0000-4000-8000-0000000000ff', :'t1_matter_id', 'anderhue-paralegal',
  :'g1_matter_id' || '/72200000-0000-4000-8000-0000000000ff.png', 'image/png'), '23514', 'documents live in their file''s folder');
select pg_temp.fails(format('insert into public.practice_matters (practice_id, client_id, area) values (%L, %L, %L)',
  'anderhue-paralegal', :'o1_client_id', 'traffic'), '23503', 'files belong to a client of the same practice');
select pg_temp.fails(format('insert into public.ltb_cases (practice_id, client_id) values (%L, %L)',
  'anderhue-paralegal', :'o1_client_id'), '23503', 'landlord files too');
select pg_temp.ok((select count(*) = 1 and bool_and(conname = 'ltb_cases_client_id_fkey' and convalidated
    and array_length(conkey, 1) = 2)
  from pg_constraint where conrelid = 'public.ltb_cases'::regclass and confrelid = 'public.ltb_clients'::regclass
    and contype = 'f'), 'one validated ltb_cases to ltb_clients key, so PostgREST embeds stay unambiguous');

reset role;
select 'practice-files tests passed' as result;
rollback;
