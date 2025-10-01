-- SECURITY FIX: Update ticket_submissions RLS policy
-- Ticket submissions should only be created through backend validation

-- Drop the existing policy that allows anyone to insert
DROP POLICY IF EXISTS "Anyone can insert submissions (public form)" ON public.ticket_submissions;

-- Add a policy that only allows backend (service role) to insert submissions
CREATE POLICY "Only backend can insert submissions"
ON public.ticket_submissions
FOR INSERT
WITH CHECK (false); -- No direct inserts from client, only via edge functions with service role

-- Add comment explaining the security model
COMMENT ON TABLE public.ticket_submissions IS 'Ticket submissions created only through backend edge functions with validation. Direct public INSERT disabled for security.';