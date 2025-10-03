-- Remove legacy policies that reference auth.users and cause permission errors
DROP POLICY IF EXISTS "Admins can manage posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can manage topics" ON public.blog_topics;

-- Blog posts: admins can select, insert, update, delete
DROP POLICY IF EXISTS "Admins can select blog posts" ON public.blog_posts;
CREATE POLICY "Admins can select blog posts"
ON public.blog_posts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert blog posts" ON public.blog_posts;
CREATE POLICY "Admins can insert blog posts"
ON public.blog_posts
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update blog posts" ON public.blog_posts;
CREATE POLICY "Admins can update blog posts"
ON public.blog_posts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete blog posts" ON public.blog_posts;
CREATE POLICY "Admins can delete blog posts"
ON public.blog_posts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Blog topics: admins can select and insert
DROP POLICY IF EXISTS "Admins can select blog topics" ON public.blog_topics;
CREATE POLICY "Admins can select blog topics"
ON public.blog_topics
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert blog topics" ON public.blog_topics;
CREATE POLICY "Admins can insert blog topics"
ON public.blog_topics
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update blog topics" ON public.blog_topics;
CREATE POLICY "Admins can update blog topics"
ON public.blog_topics
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete blog topics" ON public.blog_topics;
CREATE POLICY "Admins can delete blog topics"
ON public.blog_topics
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));