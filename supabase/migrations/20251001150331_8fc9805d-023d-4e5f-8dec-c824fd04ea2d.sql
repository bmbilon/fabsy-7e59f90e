-- Add explicit DENY policies for unauthenticated (anon) users on clients table
-- This ensures the security scanner recognizes that anonymous access is explicitly blocked

CREATE POLICY "Block anonymous SELECT on clients"
ON public.clients
FOR SELECT
TO anon
USING (false);

CREATE POLICY "Block anonymous INSERT on clients"
ON public.clients
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "Block anonymous UPDATE on clients"
ON public.clients
FOR UPDATE
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Block anonymous DELETE on clients"
ON public.clients
FOR DELETE
TO anon
USING (false);