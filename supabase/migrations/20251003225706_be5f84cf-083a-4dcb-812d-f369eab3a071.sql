-- Drop the existing restrictive policy if it exists
DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;

-- Create a permissive policy for reading published blog posts
CREATE POLICY "Enable read access for published posts"
ON public.blog_posts
FOR SELECT
TO anon, authenticated
USING (status = 'published');

-- Add comment explaining the policy
COMMENT ON POLICY "Enable read access for published posts" ON public.blog_posts IS 
'Allows anyone (anonymous or authenticated) to read blog posts that have status = published';
