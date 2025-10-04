-- Enable RLS on blog_posts table if not already enabled
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for published posts" ON blog_posts;
DROP POLICY IF EXISTS "Enable read access for authenticated admin users" ON blog_posts;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON blog_posts;

-- Policy 1: Allow anyone to read published blog posts
CREATE POLICY "Enable read access for published posts" ON blog_posts
    FOR SELECT USING (status = 'published');

-- Policy 2: Allow authenticated users to read all blog posts (drafts and published)
CREATE POLICY "Enable read access for authenticated admin users" ON blog_posts
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy 3: Allow service_role to do everything (for N8N workflows)
CREATE POLICY "Enable all access for service role" ON blog_posts
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Alternative: Disable RLS temporarily to test (NOT RECOMMENDED FOR PRODUCTION)
-- ALTER TABLE blog_posts DISABLE ROW LEVEL SECURITY;