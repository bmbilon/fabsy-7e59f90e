-- ============================================
-- SECURITY: Add explicit anonymous blocking policies for defense-in-depth
-- ============================================
-- While RLS with default-deny already blocks anonymous access, explicit deny policies
-- provide defense-in-depth and make security audits clearer.

-- Explicit anonymous blocking for clients table
CREATE POLICY "Explicitly block all anonymous access to clients" 
ON public.clients 
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

COMMENT ON POLICY "Explicitly block all anonymous access to clients" ON public.clients IS
'DEFENSE-IN-DEPTH: Explicitly blocks anonymous users from any operation on clients table.
While RLS default-deny already provides this protection, explicit policies make audits clearer
and provide an additional safety layer if other policies are misconfigured.';

-- Explicit anonymous blocking for ticket_submissions table
CREATE POLICY "Explicitly block all anonymous access to ticket_submissions" 
ON public.ticket_submissions 
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

COMMENT ON POLICY "Explicitly block all anonymous access to ticket_submissions" ON public.ticket_submissions IS
'DEFENSE-IN-DEPTH: Explicitly blocks anonymous users from any operation on ticket_submissions.
While RLS default-deny already provides this protection, explicit policies make audits clearer
and provide an additional safety layer if other policies are misconfigured.';

-- Verify RLS is enabled on both tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_submissions ENABLE ROW LEVEL SECURITY;

-- Add security summary comments
COMMENT ON TABLE public.clients IS 
'Contains highly sensitive PII: emails, phone numbers, addresses, DOB, driver license numbers.

SECURITY LAYERS:
1. RLS enabled with default-deny (blocks all access unless explicitly granted)
2. Explicit anonymous blocking policy (defense-in-depth)
3. Only authenticated admins/case_managers can SELECT/UPDATE via has_role() function
4. INSERT only via backend edge functions (service role bypasses RLS after validation)
5. DELETE completely blocked for all users (audit trail compliance)

EDGE FUNCTION PROTECTIONS:
- Rate limiting: 5 submissions/hour per IP
- Comprehensive input validation and sanitization
- No sensitive data in logs

THREAT MODEL:
Protects against: identity theft, fraud, spam, unauthorized access, data breaches.
If compromised: High risk - personal information exposure could harm clients.';

COMMENT ON TABLE public.ticket_submissions IS 
'Contains sensitive legal case data and personal information.

SECURITY LAYERS:
1. RLS enabled with default-deny (blocks all access unless explicitly granted)
2. Explicit anonymous blocking policy (defense-in-depth)
3. Only authenticated admins/case_managers can SELECT/UPDATE via has_role() function
4. INSERT only via backend edge functions (service role bypasses RLS after validation)
5. DELETE completely blocked for all users (audit trail compliance)

EDGE FUNCTION PROTECTIONS:
- Rate limiting: 5 submissions/hour per IP
- Comprehensive input validation and sanitization
- Format validation: Email, phone patterns
- No sensitive data in logs

DATA SENSITIVITY:
Contains PII (names, emails, phones, addresses, DOB, driver license) and legal strategy.

THREAT MODEL:
Protects against: identity theft, case interference, client harassment, data breaches.
If compromised: Critical risk - could damage legal cases and expose sensitive personal data.';