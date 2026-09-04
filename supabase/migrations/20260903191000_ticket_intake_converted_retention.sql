-- Remove redundant converted intake drafts after their resume window expires.
-- The canonical client, submission and case-document reference remain intact;
-- converted drafts never enter either Storage deletion queue.

begin;

-- A converted draft is subordinate to both canonical records. It must not
-- prevent an authorized erasure of either record. SET NULL is not safe here
-- because it would violate the converted-row shape invariant.
alter table public.ticket_intake_drafts
  drop constraint if exists ticket_intake_drafts_converted_submission_id_fkey,
  drop constraint if exists ticket_intake_drafts_client_id_fkey;

alter table public.ticket_intake_drafts
  add constraint ticket_intake_drafts_converted_submission_id_fkey
    foreign key (converted_submission_id)
    references public.ticket_submissions(id)
    on delete cascade,
  add constraint ticket_intake_drafts_client_id_fkey
    foreign key (client_id)
    references public.clients(id)
    on delete cascade;

create index if not exists ticket_intake_drafts_converted_retention_idx
  on public.ticket_intake_drafts (expires_at, id)
  where status = 'converted';

create or replace function public.purge_expired_converted_ticket_intake_drafts(
  p_limit integer default 25
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := clock_timestamp() - interval '24 hours';
  purged integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception using
      errcode = '22023',
      message = 'TICKET_INTAKE_CONVERTED_PURGE_LIMIT_INVALID';
  end if;

  -- A converted row is redundant even if the canonical case later replaces
  -- its document path. The status-shape constraints and foreign keys prove
  -- that canonical records exist. No Storage/tombstone RPC is called: every
  -- canonical object remains untouched.
  with candidates as materialized (
    select d.id
    from public.ticket_intake_drafts d
    where d.status = 'converted'
      and d.expires_at <= cutoff
      and d.cleanup_claim_id is null
    order by d.expires_at, d.id
    limit p_limit
    for update of d skip locked
  ), deleted as (
    delete from public.ticket_intake_drafts d
    using candidates c
    where d.id = c.id
      and d.status = 'converted'
      and d.expires_at <= cutoff
      and d.cleanup_claim_id is null
    returning d.id
  )
  select count(*)::integer into purged from deleted;

  return purged;
end;
$$;

comment on function public.purge_expired_converted_ticket_intake_drafts(integer) is
  'Service-only bounded purge of redundant converted autosaves 24 hours after expiry. Preserves canonical submissions, clients and case-document objects.';

revoke all on function public.purge_expired_converted_ticket_intake_drafts(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_converted_ticket_intake_drafts(integer)
  to service_role;

commit;
