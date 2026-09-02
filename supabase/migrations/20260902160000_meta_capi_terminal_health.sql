begin;

create or replace function public.count_meta_capi_terminal_failures()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  terminal_count integer;
begin
  -- Consent withdrawal is an expected privacy cancellation. Every other dead
  -- state is a delivery failure that must keep the scheduler visibly failing
  -- until the retained row is investigated or reaches its retention horizon.
  select count(*)::integer into terminal_count
  from meta_private.meta_capi_outbox queued
  where queued.status = 'dead'
    and queued.last_error_code is distinct from 'consent_withdrawn';
  return terminal_count;
end;
$$;

revoke all on function public.count_meta_capi_terminal_failures()
  from public, anon, authenticated, service_role;
grant execute on function public.count_meta_capi_terminal_failures()
  to service_role;

comment on function public.count_meta_capi_terminal_failures() is
  'Service-role-only scheduler health check that exposes every retained terminal delivery failure except expected consent withdrawal.';

commit;
