-- Add featured_image column to blog_posts table
-- Run this in your Supabase SQL Editor

-- Add the featured_image column
ALTER TABLE blog_posts 
ADD COLUMN IF NOT EXISTS featured_image TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN blog_posts.featured_image IS 'URL to the featured/hero image for the blog post';

-- Create an index for performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_blog_posts_featured_image ON blog_posts(featured_image) WHERE featured_image IS NOT NULL;

-- Verify the column was added
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'blog_posts' 
    AND column_name = 'featured_image';

-- Show the updated table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'blog_posts'
ORDER BY ordinal_position;