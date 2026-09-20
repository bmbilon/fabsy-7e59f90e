begin;
select test_assert(not (select prosecdef from pg_proc
  where oid='public.verify_disclosure_automation_operator()'::regprocedure),
  'operator verification executes as caller, never function owner');
select test_assert(not has_function_privilege('anon',
  'public.verify_disclosure_automation_operator()','EXECUTE'), 'anon cannot verify as operator');
select test_assert(not has_function_privilege('authenticated',
  'public.verify_disclosure_automation_operator()','EXECUTE'), 'ordinary users cannot verify as operator');
select test_assert(has_function_privilege('service_role',
  'public.verify_disclosure_automation_operator()','EXECUTE'), 'service role can invoke verifier');

-- A claim string alone is not authority; current_user must be the actual role.
select set_config('request.jwt.claim.role','service_role',true);
select test_assert(not verify_disclosure_automation_operator(),
  'forged role claim cannot authorize a different database role');
set local role anon;
do $$ begin
  begin
    perform public.verify_disclosure_automation_operator();
    raise exception 'anon verification unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    perform public.verify_disclosure_automation_operator();
    raise exception 'authenticated verification unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.role','authenticated',true);
set local role service_role;
select test_assert(verify_disclosure_automation_operator(),
  'actual service role verifies independently of arbitrary claim strings');
reset role;
rollback;
select 'disclosure operator verification tests passed' as result;
