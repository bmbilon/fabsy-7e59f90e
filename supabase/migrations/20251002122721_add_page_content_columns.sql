-- Add missing columns to page_content table for city/violation pages

-- Add city column
ALTER TABLE public.page_content
ADD COLUMN IF NOT EXISTS city TEXT;

-- Add violation type column
ALTER TABLE public.page_content
ADD COLUMN IF NOT EXISTS violation TEXT;

-- Add HTML content column
ALTER TABLE public.page_content
ADD COLUMN IF NOT EXISTS content TEXT;

-- Add stats as JSONB (includes success_rate, average_savings_cad, price_cad, demerit_points)
ALTER TABLE public.page_content
ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}'::jsonb;

-- Add local_info column
ALTER TABLE public.page_content
ADD COLUMN IF NOT EXISTS local_info TEXT;

-- Create indexes for filtering by city and violation type
CREATE INDEX IF NOT EXISTS idx_page_content_city ON public.page_content(city);
CREATE INDEX IF NOT EXISTS idx_page_content_violation ON public.page_content(violation);

-- Create composite index for city + violation lookups
CREATE INDEX IF NOT EXISTS idx_page_content_city_violation ON public.page_content(city, violation);

COMMENT ON COLUMN public.page_content.city IS 'City name for location-specific content (e.g., Calgary, Edmonton)';
COMMENT ON COLUMN public.page_content.violation IS 'Violation type (e.g., speeding, red-light, distracted, careless)';
COMMENT ON COLUMN public.page_content.content IS 'HTML content for the page';
COMMENT ON COLUMN public.page_content.stats IS 'Statistics including success_rate, average_savings_cad, price_cad, demerit_points';
COMMENT ON COLUMN public.page_content.local_info IS 'Local court information and city-specific details';