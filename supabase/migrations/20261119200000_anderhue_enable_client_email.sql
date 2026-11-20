-- Brett approved the current rendered client-email templates in chat on 2026-11-19.
-- Exact approval and reviewed source hashes: docs/anderhue/email-template-approval-2026-11-19.json.
-- Resend domain verified; preserve all existing recipients and queued history.
update public.ltb_practices
set client_updates_enabled = true
where id = 'anderhue-paralegal';
