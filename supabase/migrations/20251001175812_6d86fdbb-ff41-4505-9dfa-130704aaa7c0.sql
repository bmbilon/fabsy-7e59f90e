-- Create analytics events table for AEO KPI tracking
CREATE TABLE IF NOT EXISTS public.aeo_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  page_slug TEXT,
  session_id TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX idx_aeo_analytics_event_type ON public.aeo_analytics(event_type);
CREATE INDEX idx_aeo_analytics_created_at ON public.aeo_analytics(created_at DESC);
CREATE INDEX idx_aeo_analytics_page_slug ON public.aeo_analytics(page_slug);

-- Enable RLS
ALTER TABLE public.aeo_analytics ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (for tracking)
CREATE POLICY "Allow public insert analytics events"
ON public.aeo_analytics
FOR INSERT
TO public
WITH CHECK (true);

-- Only admins can view analytics
CREATE POLICY "Admins can view analytics"
ON public.aeo_analytics
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create a view for easy KPI reporting
CREATE OR REPLACE VIEW public.aeo_kpi_summary AS
SELECT 
  event_type,
  COUNT(*) as total_events,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT page_slug) as unique_pages,
  DATE_TRUNC('day', created_at) as event_date
FROM public.aeo_analytics
GROUP BY event_type, DATE_TRUNC('day', created_at)
ORDER BY event_date DESC, total_events DESC;

-- Grant access to the view for admins
GRANT SELECT ON public.aeo_kpi_summary TO authenticated;

COMMENT ON TABLE public.aeo_analytics IS 'Tracks AEO-specific analytics events for content performance and conversion tracking';
COMMENT ON COLUMN public.aeo_analytics.event_type IS 'Event types: page_impression, rich_result_win, ai_query, micro_lead, human_review_request, conversion_paid, traffic_from_llm';
