-- Create page_content table for AI-generated content
CREATE TABLE IF NOT EXISTS public.page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  meta_title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  h1 TEXT NOT NULL,
  hook TEXT NOT NULL,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  what TEXT,
  how TEXT,
  next TEXT,
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  video JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;

-- Public read access for content pages
CREATE POLICY "Anyone can view published pages"
  ON public.page_content
  FOR SELECT
  USING (true);

-- Only admins can insert/update pages
CREATE POLICY "Admins can insert pages"
  ON public.page_content
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pages"
  ON public.page_content
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Only backend can insert (for edge function)
CREATE POLICY "Backend can insert pages"
  ON public.page_content
  FOR INSERT
  WITH CHECK (false);

-- Create trigger for updated_at
CREATE TRIGGER update_page_content_updated_at
  BEFORE UPDATE ON public.page_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster slug lookups
CREATE INDEX idx_page_content_slug ON public.page_content(slug);

-- Create index for updated_at (for sync operations)
CREATE INDEX idx_page_content_updated_at ON public.page_content(updated_at DESC);