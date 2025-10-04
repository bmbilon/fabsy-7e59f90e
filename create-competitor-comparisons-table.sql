-- Create competitor_comparisons table for comparison guides
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS competitor_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic content fields
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    meta_description TEXT,
    keywords TEXT[] DEFAULT '{}',
    
    -- Comparison-specific fields
    violation_type TEXT NOT NULL, -- 'speeding', 'distracted-driving', 'photo-radar', etc.
    comparison_data JSONB, -- Store structured comparison data
    
    -- Competitors included in comparison
    competitors TEXT[] DEFAULT '{}', -- ['pointts', 'x-copper', 'traditional-lawyer', 'diy']
    
    -- Content quality metrics
    aeo_score INTEGER DEFAULT 85,
    word_count INTEGER,
    
    -- Publishing status
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    
    -- SEO and engagement
    view_count INTEGER DEFAULT 0,
    conversion_score INTEGER DEFAULT 0, -- Track how well it converts
    
    -- Metadata
    ai_generated_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    author TEXT DEFAULT 'Fabsy Team',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_competitor_comparisons_status ON competitor_comparisons(status);
CREATE INDEX IF NOT EXISTS idx_competitor_comparisons_violation ON competitor_comparisons(violation_type);
CREATE INDEX IF NOT EXISTS idx_competitor_comparisons_published ON competitor_comparisons(published_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_competitor_comparisons_slug ON competitor_comparisons(slug);

-- Enable Row Level Security
ALTER TABLE competitor_comparisons ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow public read access to published comparisons"
ON competitor_comparisons FOR SELECT
USING (status = 'published');

CREATE POLICY "Allow service_role full access to comparisons"
ON competitor_comparisons FOR ALL
USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Grant permissions
GRANT SELECT ON competitor_comparisons TO anon;
GRANT SELECT ON competitor_comparisons TO authenticated;
GRANT ALL ON competitor_comparisons TO service_role;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_competitor_comparisons_updated_at
BEFORE UPDATE ON competitor_comparisons
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data to test
INSERT INTO competitor_comparisons (
    title,
    slug, 
    content,
    meta_description,
    keywords,
    violation_type,
    comparison_data,
    competitors,
    status
) VALUES (
    'Test Comparison: Speeding Ticket Options in Alberta',
    'test-speeding-ticket-comparison',
    '# Test Comparison Guide\n\nThis is a test comparison of speeding ticket defense options.',
    'Test comparison guide for speeding tickets in Alberta',
    ARRAY['alberta speeding tickets', 'fabsy vs competitors', 'traffic defense'],
    'speeding',
    '{"options": [{"name": "DIY", "cost": "$0", "time": "8-15 hrs", "success_rate": "15-25%"}, {"name": "Fabsy", "cost": "$488", "time": "5 min", "success_rate": "100%"}]}',
    ARRAY['pointts', 'x-copper', 'traditional-lawyer', 'diy'],
    'draft'
);

-- Verify the table was created
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'competitor_comparisons' 
ORDER BY ordinal_position;