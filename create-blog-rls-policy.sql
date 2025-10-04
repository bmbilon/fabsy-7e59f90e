-- Create RLS policy to allow public access to published blog posts
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/gcasbisxfrssonllpqrw/sql

-- First, ensure RLS is enabled on the blog_posts table
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow public read access to published blog posts" ON blog_posts;

-- Create new policy to allow anyone to read published blog posts
CREATE POLICY "Allow public read access to published blog posts"
ON blog_posts FOR SELECT
USING (status = 'published');

-- Optional: Allow authenticated users to read all posts (including drafts)
DROP POLICY IF EXISTS "Allow authenticated users to read all blog posts" ON blog_posts;
CREATE POLICY "Allow authenticated users to read all blog posts"
ON blog_posts FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow service_role to do everything (for N8N and admin operations)
DROP POLICY IF EXISTS "Allow service_role full access to blog posts" ON blog_posts;
CREATE POLICY "Allow service_role full access to blog posts"
ON blog_posts FOR ALL
USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Grant necessary permissions to anon role for published posts
GRANT SELECT ON blog_posts TO anon;
GRANT SELECT ON blog_posts TO authenticated;

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'blog_posts';