-- Run after the base practice-files tests, before the area restriction.
-- A historical general file is seeded before applying the new migration.
\set ON_ERROR_STOP 1
begin;
insert into public.ltb_clients (id, practice_id, email) values
  ('72400000-0000-4000-8000-000000000001', 'anderhue-paralegal', 'historical-area@example.test');
insert into public.practice_matters (id, practice_id, client_id, area, source) values
  ('72400000-0000-4000-8000-000000000002', 'anderhue-paralegal', '72400000-0000-4000-8000-000000000001', 'general', 'staff');
insert into auth.users (id, email) values
  ('72400000-0000-4000-8000-000000000003', 'area-staff@example.test');
insert into public.ltb_practice_members (practice_id, user_id, role) values
  ('anderhue-paralegal', '72400000-0000-4000-8000-000000000003', 'licensee');
select set_config('request.jwt.claim.sub', '72400000-0000-4000-8000-000000000003', true);

\ir ../migrations/20261002120000_anderhue_ltb_traffic_only.sql

create function pg_temp.area_rejected(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm = 'PRACTICE_AREA_UNAVAILABLE' then return; end if;
    raise;
  end;
  raise exception 'Expected PRACTICE_AREA_UNAVAILABLE';
end;
$$;

select pg_temp.area_rejected($q$select * from public.practice_register_intake(
  'anderhue-paralegal', 'general', '{"email":"new-general@example.test","notes":"A new matter","category":"small_claims"}', repeat('a',64), '[]')$q$);
select pg_temp.area_rejected($q$select * from public.practice_create_matter(
  'anderhue-paralegal', 'general', '{"email":"new-staff-general@example.test","firstName":"Test"}', '{"category":"small_claims"}', false)$q$);

-- Historical files remain editable, including no-op area assignments.
update public.practice_matters set client_notes = 'Historical file is still editable', area = area
where id = '72400000-0000-4000-8000-000000000002';
select * from public.practice_create_matter('anderhue-paralegal', 'traffic',
  '{"email":"new-traffic@example.test","firstName":"Test"}', '{"ticketType":"speeding"}', false);
select * from public.practice_create_matter('anderhue-paralegal', 'ltb',
  '{"email":"new-ltb@example.test","firstName":"Test"}', '{"issue":"arrears"}', false);
rollback;
