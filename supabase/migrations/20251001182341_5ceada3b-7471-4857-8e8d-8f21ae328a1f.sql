-- Revoke public access to the KPI summary view
REVOKE ALL ON public.aeo_kpi_summary FROM PUBLIC;
REVOKE ALL ON public.aeo_kpi_summary FROM anon;
REVOKE ALL ON public.aeo_kpi_summary FROM authenticated;

-- Create a security definer function to access KPI data (admins only)
CREATE OR REPLACE FUNCTION public.get_aeo_kpi_summary()
RETURNS SETOF public.aeo_kpi_summary
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Only allow admins to access KPI data
  SELECT *
  FROM public.aeo_kpi_summary
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;

-- Grant execute permission to authenticated users (the function checks admin role internally)
GRANT EXECUTE ON FUNCTION public.get_aeo_kpi_summary() TO authenticated;