-- Fix security definer view by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.aeo_kpi_summary;

CREATE OR REPLACE VIEW public.aeo_kpi_summary 
WITH (security_invoker = true)
AS
SELECT 
  event_type,
  COUNT(*) as total_events,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT page_slug) as unique_pages,
  DATE_TRUNC('day', created_at) as event_date
FROM public.aeo_analytics
GROUP BY event_type, DATE_TRUNC('day', created_at)
ORDER BY event_date DESC, total_events DESC;

COMMENT ON VIEW public.aeo_kpi_summary IS 'AEO KPI summary view with security invoker - respects querying user permissions';
