-- ============================================
-- SECURITY FIX: Clean up redundant RLS policies
-- ============================================
-- This migration removes redundant "Block anonymous" policies that are unnecessary
-- because RLS default-denies all access when enabled. This makes the security
-- posture clearer and easier to audit.

-- Clean up clients table policies
-- Drop redundant anonymous-blocking policies (RLS default-deny handles this)
DROP POLICY IF EXISTS "Block anonymous DELETE on clients" ON public.clients;
DROP POLICY IF EXISTS "Block anonymous INSERT on clients" ON public.clients;
DROP POLICY IF EXISTS "Block anonymous SELECT on clients" ON public.clients;
DROP POLICY IF EXISTS "Block anonymous UPDATE on clients" ON public.clients;

-- Ensure clear, explicit policies remain:
-- 1. Only backend (via service role) can INSERT (policy denies client-side inserts)
-- 2. Only admins/case_managers can SELECT
-- 3. Only admins/case_managers can UPDATE  
-- 4. DELETE is completely blocked (even for admins)

-- Verify RLS is enabled on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Add comment explaining the security model
COMMENT ON TABLE public.clients IS 'Contains highly sensitive PII. RLS enforced: No public access. Inserts only via backend edge functions using service role. Admins and case managers can view/update. Deletes completely blocked.';

-- Clean up ticket_submissions table policies  
DROP POLICY IF EXISTS "Block anonymous DELETE on ticket_submissions" ON public.ticket_submissions;
DROP POLICY IF EXISTS "Block anonymous INSERT on ticket_submissions" ON public.ticket_submissions;
DROP POLICY IF EXISTS "Block anonymous SELECT on ticket_submissions" ON public.ticket_submissions;
DROP POLICY IF EXISTS "Block anonymous UPDATE on ticket_submissions" ON public.ticket_submissions;

-- Verify RLS is enabled on ticket_submissions table
ALTER TABLE public.ticket_submissions ENABLE ROW LEVEL SECURITY;

-- Add comment explaining the security model
COMMENT ON TABLE public.ticket_submissions IS 'Contains sensitive legal case data and PII. RLS enforced: No public access. Inserts only via backend edge functions using service role. Admins and case managers can view/update. Deletes completely blocked.';

-- Verify the remaining policies are correct
-- For clients table, we should have:
--   1. "Admins and case managers can view all clients" (SELECT)
--   2. "Admins and case managers can update clients" (UPDATE)
--   3. "Only backend can insert clients" (INSERT with false - denies client-side)
--   4. "Prevent all deletes on clients" (DELETE with false)

-- For ticket_submissions table, we should have:
--   1. "Admins and case managers can view all submissions" (SELECT)
--   2. "Admins and case managers can update submissions" (UPDATE)
--   3. "Only backend can insert submissions" (INSERT with false - denies client-side)
--   4. DELETE policy with false (if exists)