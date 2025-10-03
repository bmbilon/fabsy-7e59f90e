-- Add policy for admins to view all blog posts (drafts and published)
CREATE POLICY "Admins can view all blog posts"
ON public.blog_posts
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add policy for admins to manage blog topics
CREATE POLICY "Admins can view all blog topics"
ON public.blog_topics
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update comment on blog_posts table
COMMENT ON TABLE public.blog_posts IS 
'Blog posts with AI generation tracking. 
Security: Published posts are public. Drafts require admin role.
RLS Policies:
- Anyone can read published posts (status = published)
- Admins with has_role(auth.uid(), admin) can view and manage all posts
- Service role and @fabsy.ca emails can manage posts (legacy policy)';
