-- Tighten access to KPI summary view by revoking all default permissions
REVOKE ALL ON public.aeo_kpi_summary FROM PUBLIC;
REVOKE ALL ON public.aeo_kpi_summary FROM anon;
REVOKE ALL ON public.aeo_kpi_summary FROM authenticated;

-- Restrict execution of the RPC function to authenticated users only
-- (Postgres grants EXECUTE to PUBLIC by default on functions)
REVOKE ALL ON FUNCTION public.get_aeo_kpi_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_aeo_kpi_summary() FROM anon;

-- Grant execution only to authenticated users
-- The function itself checks for admin role via has_role()
GRANT EXECUTE ON FUNCTION public.get_aeo_kpi_summary() TO authenticated;