begin;
create table public.ads_draft_attribution (
 draft_id uuid primary key references public.ticket_intake_drafts(id), fields jsonb not null default '{}', consent_version text,
 readable_at timestamptz, readable_by uuid references auth.users(id), contact_verified_at timestamptz, contact_verified_by uuid references auth.users(id), contact_evidence text,
 created_at timestamptz not null default now()
);
alter table public.ads_draft_attribution enable row level security;
revoke all on public.ads_draft_attribution from public,anon,authenticated;
grant all on public.ads_draft_attribution to service_role;
alter table public.ads_funnel_events alter column submission_id drop not null;
alter table public.ads_funnel_events add column draft_id uuid references public.ticket_intake_drafts(id);
alter table public.ads_funnel_events add constraint ads_funnel_exact_receipt check((submission_id is null) <> (draft_id is null));
commit;
