-- Fix user_roles table security: Block anonymous access completely

-- First, ensure RLS is enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop the existing restrictive SELECT policy and replace with permissive policy
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Create a permissive policy that ONLY allows authenticated admins to view roles
CREATE POLICY "Only admins can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Explicitly block all anonymous SELECT access
CREATE POLICY "Block anonymous SELECT on user_roles"
ON public.user_roles
FOR SELECT
TO anon
USING (false);

-- Explicitly block all anonymous INSERT access
CREATE POLICY "Block anonymous INSERT on user_roles"
ON public.user_roles
FOR INSERT
TO anon
WITH CHECK (false);

-- Explicitly block all anonymous UPDATE access
CREATE POLICY "Block anonymous UPDATE on user_roles"
ON public.user_roles
FOR UPDATE
TO anon
USING (false)
WITH CHECK (false);

-- Explicitly block all anonymous DELETE access
CREATE POLICY "Block anonymous DELETE on user_roles"
ON public.user_roles
FOR DELETE
TO anon
USING (false);