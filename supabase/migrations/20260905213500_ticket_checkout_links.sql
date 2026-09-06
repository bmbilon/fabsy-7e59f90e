-- Short, first-party payment links for ticket checkout SMS messages. The code
-- is a purpose-limited bearer: it can open the matching Stripe Checkout only;
-- it cannot read or modify the saved ticket intake.

create table if not exists public.ticket_checkout_links (
  checkout_intent_id uuid primary key
    references public.idr_checkout_intents(id) on delete cascade,
  submission_id uuid not null
    references public.ticket_submissions(id) on delete cascade,
  code text not null unique
    check (code ~ '^[A-Za-z0-9_-]{22}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists idx_ticket_checkout_links_submission
  on public.ticket_checkout_links(submission_id);

alter table public.ticket_checkout_links enable row level security;
alter table public.ticket_checkout_links force row level security;

revoke all on public.ticket_checkout_links from public, anon, authenticated;
grant select, insert, update, delete on public.ticket_checkout_links to service_role;

drop trigger if exists update_ticket_checkout_links_updated_at
  on public.ticket_checkout_links;
create trigger update_ticket_checkout_links_updated_at
  before update on public.ticket_checkout_links
  for each row execute function public.update_updated_at_column();

comment on table public.ticket_checkout_links is
  'Service-only opaque aliases for short-lived Fabsy payment links. Codes expose checkout access only and never expose saved-intake access.';
