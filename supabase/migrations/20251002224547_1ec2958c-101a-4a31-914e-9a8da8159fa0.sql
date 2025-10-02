-- ============================================
-- SECURITY DOCUMENTATION: ticket_submissions Table
-- ============================================
-- This migration adds comprehensive documentation explaining the security model
-- for the ticket_submissions table to prevent future confusion.

-- Document the security architecture
COMMENT ON POLICY "Only backend can insert submissions" ON public.ticket_submissions IS 
'SECURITY: This policy intentionally has WITH CHECK (false) to block ALL client-side inserts. 
Data can ONLY be inserted via the submit-ticket edge function using the service role key, 
which bypasses RLS after performing validation, rate limiting, and input sanitization. 
This prevents malicious users from directly inserting data through the Supabase client.';

COMMENT ON POLICY "Admins and case managers can view all submissions" ON public.ticket_submissions IS
'SECURITY: Only authenticated users with admin or case_manager roles can view submission data.
Uses the has_role() security definer function to prevent RLS recursion.';

COMMENT ON POLICY "Admins and case managers can update submissions" ON public.ticket_submissions IS
'SECURITY: Only authenticated users with admin or case_manager roles can update submissions.
This allows case management workflow while protecting client data from unauthorized access.';

-- Add a policy to explicitly block all deletes (if not already present)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ticket_submissions' 
    AND policyname = 'Prevent all deletes on ticket_submissions'
  ) THEN
    CREATE POLICY "Prevent all deletes on ticket_submissions" 
    ON public.ticket_submissions 
    FOR DELETE 
    USING (false);
  END IF;
END $$;

COMMENT ON POLICY "Prevent all deletes on ticket_submissions" ON public.ticket_submissions IS
'SECURITY: Deletes are completely blocked for audit trail purposes. Legal submissions must be preserved.';

-- Update table comment with security overview
COMMENT ON TABLE public.ticket_submissions IS 
'Contains sensitive legal case data and personal information.

SECURITY MODEL:
- RLS enabled with default-deny
- INSERT: Only via submit-ticket edge function (service role bypasses RLS after validation)
- SELECT: Only admins and case managers (authenticated via has_role function)
- UPDATE: Only admins and case managers
- DELETE: Completely blocked for audit trail

EDGE FUNCTION PROTECTIONS:
- Rate limiting: 5 submissions per hour per IP
- Input validation: Length limits on all fields
- Format validation: Email, phone number patterns
- No sensitive data logging
- CORS restricted to specific origins

DATA SENSITIVITY:
Contains PII (names, emails, phones, addresses, DOB, driver license) and legal strategy information.
Unauthorized access could enable identity theft, case interference, or client harassment.';

-- Document the clients table as well
COMMENT ON POLICY "Only backend can insert clients" ON public.clients IS
'SECURITY: This policy intentionally has WITH CHECK (false) to block ALL client-side inserts.
Clients can ONLY be created via edge functions using the service role key after proper validation.';

COMMENT ON POLICY "Admins and case managers can view all clients" ON public.clients IS
'SECURITY: Only authenticated users with admin or case_manager roles can view client data.';

COMMENT ON POLICY "Admins and case managers can update clients" ON public.clients IS
'SECURITY: Only authenticated users with admin or case_manager roles can update client records.';

COMMENT ON POLICY "Prevent all deletes on clients" ON public.clients IS
'SECURITY: Deletes are completely blocked. Client records must be preserved for legal compliance.';