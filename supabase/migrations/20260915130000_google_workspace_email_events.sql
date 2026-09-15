begin;

alter table public.idr_email_events
  drop constraint if exists idr_email_events_event_type_check;

alter table public.idr_email_events
  add constraint idr_email_events_event_type_check
  check (event_type in (
    'verdict_set',
    'conviction_stands_offer',
    'report_delivered',
    'case_resolved',
    'status_in_progress',
    'disclosure_requested'
  ));

comment on column public.idr_email_events.event_type is
  'Durable client notification event. Status and disclosure updates are sent once from hello@fabsy.ca through Google Workspace.';

alter table public.disclosure_automation_state
  add column if not exists last_inbox_poll_at timestamptz,
  add column if not exists last_inbox_error text;

comment on column public.disclosure_automation_state.last_inbox_poll_at is
  'Most recent Google Workspace Gmail API poll for Crown disclosure confirmations.';

commit;
