-- Create storage bucket for consent forms
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('consent-forms', 'consent-forms', false, 5242880, ARRAY['application/pdf']);

-- Add column to ticket_submissions for consent form storage
ALTER TABLE public.ticket_submissions
ADD COLUMN consent_form_path text;

-- Create RLS policies for consent-forms bucket
CREATE POLICY "Admins can view consent forms"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'consent-forms' AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'case_manager'::app_role))
);

CREATE POLICY "System can upload consent forms"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'consent-forms');