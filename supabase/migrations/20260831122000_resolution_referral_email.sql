begin;

alter table public.idr_email_events
  drop constraint if exists idr_email_events_event_type_check;
alter table public.idr_email_events
  add constraint idr_email_events_event_type_check
    check (event_type in ('verdict_set','conviction_stands_offer','report_delivered','case_resolved')),
  add column referral_invite_included boolean not null default false,
  add column requested_by uuid references auth.users(id) on delete set null,
  add column resolution_payload jsonb check (resolution_payload is null or jsonb_typeof(resolution_payload) = 'object');

comment on column public.idr_email_events.referral_invite_included is
  'Explicit staff-reviewed invitation only; operator confirms consent/preferences. Never set by a case-outcome trigger.';
comment on column public.idr_email_events.resolution_payload is
  'Private immutable-by-application email snapshot used for identical provider-idempotency retries; no public read.';

commit;
