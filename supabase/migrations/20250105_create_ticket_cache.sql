-- Create ticket_cache table for storing OCR ticket data
CREATE TABLE ticket_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  ticket_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast lookups by cache_key
CREATE INDEX idx_ticket_cache_key ON ticket_cache(cache_key);

-- Create index for cleanup queries (expired records)
CREATE INDEX idx_ticket_cache_expires ON ticket_cache(expires_at);

-- Enable RLS (Row Level Security)
ALTER TABLE ticket_cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous access (for public ticket scanning)
CREATE POLICY "Allow anonymous access to ticket cache" ON ticket_cache
FOR ALL USING (true);

-- Create function to automatically clean up expired records
CREATE OR REPLACE FUNCTION cleanup_expired_ticket_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM ticket_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a cron job to run cleanup every hour (requires pg_cron extension)
-- This will be created manually in Supabase dashboard if needed