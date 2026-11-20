-- Resend verified anderhue.ca on 2026-11-19. Preserve existing staff recipients.
-- Client email activation remains a separate release step.
update public.ltb_practices
set notice_from = 'AnderHue Case Desk <files@anderhue.ca>'
where id = 'anderhue-paralegal';
