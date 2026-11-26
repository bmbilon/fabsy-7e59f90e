-- The ticket number on the standalone checkout is optional. Compare two absent
-- numbers as equal while still binding the lookup to the exact order and product.
create or replace function public.require_service_order_portal_lookup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product <> 'insurance_report' and not exists (
    select 1 from public.service_order_portal_lookups lookup
    where lookup.order_id = new.id
      and lookup.access_token_hash = new.access_token_hash
      and lookup.product = new.product
      and lookup.ticket_number is not distinct from nullif(public.canonical_ticket_number(new.ticket_number), '')
  ) then
    raise exception 'PORTAL_LOOKUP_REQUIRED';
  end if;
  return new;
end;
$$;
