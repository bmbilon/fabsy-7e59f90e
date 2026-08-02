-- Supabase's public-schema default privileges can grant EXECUTE directly to
-- anon and authenticated when a function is created. Revoke those explicit
-- grants so payment reservation and report delivery remain service-only.

revoke all on function public.reserve_standalone_idr_checkout_intent(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_standalone_idr_checkout_intent(uuid, integer, text, text)
  to service_role;

revoke all on function public.begin_idr_report_delivery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_idr_report_delivery(uuid, uuid)
  to service_role;

revoke all on function public.finalize_idr_report_delivery(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_idr_report_delivery(uuid, uuid, uuid, text, text, jsonb)
  to service_role;

revoke all on function public.release_idr_report_delivery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_idr_report_delivery(uuid, uuid)
  to service_role;
