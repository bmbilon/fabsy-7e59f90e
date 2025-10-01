-- Create clients table with DL number as unique identifier
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drivers_license TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  date_of_birth DATE,
  sms_opt_in BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for clients table
CREATE POLICY "Admins and case managers can view all clients"
ON public.clients
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'case_manager'::app_role));

CREATE POLICY "Admins and case managers can update clients"
ON public.clients
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'case_manager'::app_role));

CREATE POLICY "Anyone can insert clients (public form)"
ON public.clients
FOR INSERT
WITH CHECK (true);

-- Migrate existing client data from ticket_submissions to clients table
INSERT INTO public.clients (
  drivers_license,
  first_name,
  last_name,
  email,
  phone,
  address,
  city,
  postal_code,
  date_of_birth,
  sms_opt_in,
  created_at,
  updated_at
)
SELECT DISTINCT ON (drivers_license)
  drivers_license,
  first_name,
  last_name,
  email,
  phone,
  address,
  city,
  postal_code,
  date_of_birth,
  sms_opt_in,
  created_at,
  updated_at
FROM public.ticket_submissions
WHERE drivers_license IS NOT NULL
ORDER BY drivers_license, created_at DESC;

-- Add client_id column to ticket_submissions
ALTER TABLE public.ticket_submissions
ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- Update ticket_submissions to link to clients
UPDATE public.ticket_submissions ts
SET client_id = c.id
FROM public.clients c
WHERE ts.drivers_license = c.drivers_license;

-- Make client_id required
ALTER TABLE public.ticket_submissions
ALTER COLUMN client_id SET NOT NULL;

-- Remove redundant client fields from ticket_submissions (keep them for now in case of issues)
-- We'll drop these after verifying everything works
-- ALTER TABLE public.ticket_submissions
-- DROP COLUMN first_name,
-- DROP COLUMN last_name,
-- DROP COLUMN email,
-- DROP COLUMN phone,
-- DROP COLUMN address,
-- DROP COLUMN city,
-- DROP COLUMN postal_code,
-- DROP COLUMN date_of_birth,
-- DROP COLUMN drivers_license,
-- DROP COLUMN sms_opt_in;

-- Create index on client_id for faster joins
CREATE INDEX idx_ticket_submissions_client_id ON public.ticket_submissions(client_id);

-- Create trigger for updating clients updated_at
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.clients IS 'Stores unique client information with driver license as business key';
COMMENT ON COLUMN public.ticket_submissions.client_id IS 'Foreign key reference to clients table';