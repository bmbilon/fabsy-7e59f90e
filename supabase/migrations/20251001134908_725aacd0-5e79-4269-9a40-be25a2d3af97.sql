-- SECURITY FIX: Remove public INSERT access to clients table
-- Client records should only be created by backend edge functions with proper validation

-- Drop the insecure policy that allows anyone to insert
DROP POLICY IF EXISTS "Anyone can insert clients (public form)" ON public.clients;

-- Add a policy that only allows service role (backend) to insert clients
-- This prevents attackers from spamming the database with fake client records
CREATE POLICY "Only backend can insert clients"
ON public.clients
FOR INSERT
WITH CHECK (false); -- No direct inserts from client, only via edge functions with service role

-- Add comment explaining the security model
COMMENT ON TABLE public.clients IS 'Client records created only by backend edge functions with validation. Direct public INSERT disabled for security.';