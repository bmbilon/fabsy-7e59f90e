-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'case_manager', 'user');

-- Create user_roles table for admin access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create ticket_submissions table
CREATE TABLE public.ticket_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Personal Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  date_of_birth DATE,
  drivers_license TEXT,
  
  -- Ticket Details
  ticket_number TEXT NOT NULL,
  violation TEXT NOT NULL,
  fine_amount TEXT NOT NULL,
  violation_date DATE,
  violation_time TEXT,
  court_location TEXT,
  court_date DATE,
  
  -- Defense Information
  defense_strategy TEXT,
  additional_notes TEXT,
  
  -- Communication Preferences
  sms_opt_in BOOLEAN DEFAULT false,
  
  -- Payment Information
  coupon_code TEXT,
  insurance_company TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending',
  assigned_to UUID REFERENCES auth.users(id),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Full text search
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', 
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(ticket_number, '') || ' ' ||
      coalesce(violation, '')
    )
  ) STORED
);

-- Enable RLS on ticket_submissions
ALTER TABLE public.ticket_submissions ENABLE ROW LEVEL SECURITY;

-- Create index for full text search
CREATE INDEX idx_ticket_submissions_search ON public.ticket_submissions USING gin(search_vector);

-- Create index for common queries
CREATE INDEX idx_ticket_submissions_status ON public.ticket_submissions(status);
CREATE INDEX idx_ticket_submissions_created_at ON public.ticket_submissions(created_at DESC);
CREATE INDEX idx_ticket_submissions_email ON public.ticket_submissions(email);

-- RLS Policies for user_roles (admins can manage roles)
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for ticket_submissions
CREATE POLICY "Admins and case managers can view all submissions"
  ON public.ticket_submissions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'case_manager')
  );

CREATE POLICY "Admins and case managers can update submissions"
  ON public.ticket_submissions FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'case_manager')
  );

CREATE POLICY "Anyone can insert submissions (public form)"
  ON public.ticket_submissions FOR INSERT
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ticket_submissions_updated_at
  BEFORE UPDATE ON public.ticket_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();