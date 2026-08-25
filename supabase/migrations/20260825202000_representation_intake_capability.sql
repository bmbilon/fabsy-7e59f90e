-- Bind public representation-intake actions to a per-submission capability.

begin;

alter table public.ticket_submissions
  add column if not exists representation_access_token_hash text;

alter table public.ticket_submissions
  drop constraint if exists ticket_submissions_representation_access_token_hash_check;

alter table public.ticket_submissions
  add constraint ticket_submissions_representation_access_token_hash_check
    check (
      representation_access_token_hash is null or
      representation_access_token_hash ~ '^[0-9a-f]{64}$'
    );

comment on column public.ticket_submissions.representation_access_token_hash is
  'SHA-256 capability hash used to authorize public consent, notification and checkout actions for an unpaid representation intake.';

commit;
