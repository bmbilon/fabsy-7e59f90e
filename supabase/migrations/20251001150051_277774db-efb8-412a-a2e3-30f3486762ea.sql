-- Ensure RLS is enabled on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner (prevents bypassing RLS even with elevated privileges)
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Admins and case managers can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Admins and case managers can update clients" ON public.clients;
DROP POLICY IF EXISTS "Only backend can insert clients" ON public.clients;

-- Recreate SELECT policy (only authenticated admins/case managers)
CREATE POLICY "Admins and case managers can view all clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'case_manager'::app_role)
);

-- Recreate UPDATE policy (only authenticated admins/case managers)
CREATE POLICY "Admins and case managers can update clients"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'case_manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'case_manager'::app_role)
);

-- Recreate INSERT policy (deny direct inserts, only backend via service role)
CREATE POLICY "Only backend can insert clients"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Add explicit DELETE denial policy
CREATE POLICY "Prevent all deletes on clients"
ON public.clients
FOR DELETE
TO authenticated
USING (false);