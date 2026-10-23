-- Objects the LTB intake migration (20260925150000) needs from earlier Fabsy
-- migrations, copied from their real definitions in
-- supabase/migrations/20250930233722_86dfb5ff-6837-4fa4-a0b4-09308b097b2a.sql
-- (no later migration alters them). Applied after supabase-stubs.sql.
create type public.app_role as enum ('admin', 'case_manager', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamp with time zone default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;
