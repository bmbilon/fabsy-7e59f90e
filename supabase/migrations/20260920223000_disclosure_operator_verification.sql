begin;

-- PostgREST verifies the caller's bearer token and sets its database role before
-- invoking this function. Never infer operator authority from unverified claims.
create function public.verify_disclosure_automation_operator()
returns boolean
language sql stable security invoker
set search_path = pg_catalog
as $$ select current_user = 'service_role'; $$;

revoke all on function public.verify_disclosure_automation_operator()
  from public, anon, authenticated;
grant execute on function public.verify_disclosure_automation_operator()
  to service_role;
comment on function public.verify_disclosure_automation_operator() is
  'Read-only operator credential verification under the caller role validated by PostgREST. Returns no case data.';

commit;
