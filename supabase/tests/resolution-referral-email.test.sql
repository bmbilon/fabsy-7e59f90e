-- Run after the real 122000 migration, using synthetic local fixtures only.
set request.jwt.claim.role = 'service_role';
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Assertion failed: %',message; end if; end;
$$;

select pg_temp.assert((select count(*) = 3 from public.idr_email_events
  where event_key like 'existing-%' and not referral_invite_included
    and requested_by is null and resolution_payload is null),
  'existing event rows survive with private invitation disabled by default');
select pg_temp.assert((select relrowsecurity from pg_class where oid = 'public.idr_email_events'::regclass),
  'resolution migration preserves RLS');

-- Existing event types can still be written after the constraint replacement.
insert into public.idr_email_events(event_key,event_type,recipient_email)
  select 'new-' || kind,kind,'private@example.test'
  from unnest(array['verdict_set','conviction_stands_offer','report_delivered']) as kind;
insert into public.idr_email_events(event_key,event_type,recipient_email,ticket_submission_id,
  requested_by,referral_invite_included,resolution_payload)
  values('resolved-fixture','case_resolved','private@example.test','30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',true,'{"subject":"Synthetic resolution","html":"Private fixture"}'::jsonb);
select pg_temp.assert((select count(*) = 7 from public.idr_email_events),
  'all legacy types and the new case_resolved event are accepted');

do $$ begin
  begin
    insert into public.idr_email_events(event_key,event_type,recipient_email)
      values('unknown-fixture','unsupported_event','private@example.test');
    raise exception 'unknown email event accepted';
  exception when check_violation then null; end;
  begin
    insert into public.idr_email_events(event_key,event_type,recipient_email,resolution_payload)
      values('array-fixture','case_resolved','private@example.test','[]'::jsonb);
    raise exception 'array accepted as resolution payload';
  exception when check_violation then null; end;
  begin
    insert into public.idr_email_events(event_key,event_type,recipient_email,resolution_payload)
      values('json-null-fixture','case_resolved','private@example.test','null'::jsonb);
    raise exception 'JSON null accepted as resolution payload';
  exception when check_violation then null; end;
  begin
    insert into public.idr_email_events(event_key,event_type,recipient_email,requested_by)
      values('unknown-staff-fixture','case_resolved','private@example.test','ffffffff-ffff-4fff-8fff-ffffffffffff');
    raise exception 'nonexistent requesting user accepted';
  exception when foreign_key_violation then null; end;
end $$;

-- Populated recipient/payload rows are invisible even with broad table grants.
set role anon;
set request.jwt.claim.role = 'anon';
select pg_temp.assert((select count(*) = 0 from public.idr_email_events),
  'anonymous users cannot read any email event or payload');
reset role;
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
select pg_temp.assert((select count(*) = 0 from public.idr_email_events),
  'a registered portal user cannot read event recipient, snapshot or staff id');
do $$ declare changed integer; begin
  begin
    insert into public.idr_email_events(event_key,event_type,recipient_email)
      values('browser-fixture','case_resolved','private@example.test');
    raise exception 'browser created a resolution send event';
  exception when insufficient_privilege then null; end;
  update public.idr_email_events set referral_invite_included = false where event_key = 'resolved-fixture';
  get diagnostics changed = row_count;
  perform pg_temp.assert(changed = 0,'browser cannot rewrite private invitation snapshot');
end $$;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) = 7 from public.idr_email_events),
  'staff retains existing read access to the new resolution rows');
do $$ declare changed integer; begin
  update public.idr_email_events set referral_invite_included = false where event_key = 'resolved-fixture';
  get diagnostics changed = row_count;
  perform pg_temp.assert(changed = 0,'staff browser read policy does not permit direct payload mutations');
end $$;
reset role;
set request.jwt.claim.role = 'service_role';
select pg_temp.assert((select referral_invite_included and resolution_payload->>'html' = 'Private fixture'
  from public.idr_email_events where event_key = 'resolved-fixture'),
  'denied browser writes leave the private event unchanged');
