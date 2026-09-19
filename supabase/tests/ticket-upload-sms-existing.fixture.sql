-- Simulate an upload that happened before owner SMS was enabled.
insert into public.ticket_intake_drafts(id,email,ticket_document_path,ticket_uploaded_at)
values ('00000000-0000-4000-8000-000000000099','old@example.com','old.pdf',now()-interval '1 day');
