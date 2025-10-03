-- Remove legacy policies that reference auth.users and cause permission errors
DROP POLICY IF EXISTS "Admins can manage posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can manage topics" ON public.blog_topics;

-- Blog posts: admins can insert, update, delete using has_role()
CREATE POLICY "Admins can insert blog_posts"
ON public.blog_posts
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update blog_posts"
ON public.blog_posts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete blog_posts"
ON public.blog_posts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Blog topics: admins can insert/update/delete (select policy already exists)
CREATE POLICY "Admins can insert blog_topics"
ON public.blog_topics
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update blog_topics"
ON public.blog_topics
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete blog_topics"
ON public.blog_topics
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Document security model
COMMENT ON TABLE public.blog_posts IS 
'Blog posts. RLS: Published posts are public; admins (has_role(admin)) can manage all posts.';

COMMENT ON TABLE public.blog_topics IS 
'Blog topics. RLS: Admins (has_role(admin)) can select/insert/update/delete.';