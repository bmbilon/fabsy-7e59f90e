-- Admit notary/commissioning requests without reopening unrelated general matters.
create or replace function public.practice_guard_anderhue_area()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.practice_id = 'anderhue-paralegal' and new.area = 'general'
     and new.category is distinct from 'notary' then
    if tg_op = 'INSERT' then
      raise exception 'PRACTICE_AREA_UNAVAILABLE';
    elsif old.practice_id is distinct from new.practice_id
       or old.area is distinct from new.area
       or old.category is distinct from new.category then
      raise exception 'PRACTICE_AREA_UNAVAILABLE';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.practice_guard_anderhue_area() from public, anon, authenticated;
drop trigger practice_matters_anderhue_area_guard on public.practice_matters;
create trigger practice_matters_anderhue_area_guard
before insert or update of practice_id, area, category on public.practice_matters
for each row execute function public.practice_guard_anderhue_area();
