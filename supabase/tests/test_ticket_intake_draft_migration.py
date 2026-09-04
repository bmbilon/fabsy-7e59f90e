"""Exercise ticket-intake draft RLS, capabilities and conversion locally.

Run: python3 supabase/tests/test_ticket_intake_draft_migration.py
Requires local initdb/pg_ctl/psql. It opens no network listener, reads no
Supabase credentials and uses synthetic contact data only.
"""
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = r"""
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function public.is_idr_staff() returns boolean language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.staff', true), 'false') = 'true'
$$;
grant execute on function public.is_idr_staff() to authenticated, service_role;
create function public.update_updated_at_column() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end
$$;
create table public.clients (id uuid primary key);
create table public.ticket_submissions (
  id uuid primary key,
  client_id uuid not null references public.clients(id),
  service_type text not null,
  status text not null,
  representation_access_token_hash text,
  ticket_document_path text,
  preferred_locale text not null,
  email text not null,
  phone text not null
);
create table public.ticket_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  ticket_data jsonb not null,
  expires_at timestamptz not null default now() + interval '1 day'
);
alter table public.ticket_cache enable row level security;
grant all on public.ticket_cache to anon, authenticated, service_role;
create policy "Allow anonymous access to ticket cache" on public.ticket_cache for all using (true);
create function public.cleanup_expired_ticket_cache() returns void language sql as $$
  delete from public.ticket_cache where expires_at < now()
$$;
grant execute on function public.cleanup_expired_ticket_cache() to public, anon, authenticated, service_role;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create policy "System can upload consent forms" on storage.objects for insert
  with check (bucket_id = 'consent-forms');
grant all on public.clients, public.ticket_submissions to service_role;
"""


def run() -> None:
    binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "psql")}
    if not all(binaries.values()):
        raise SystemExit("Local PostgreSQL binaries are required; no remote database will be used.")

    def command(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(args, text=True, capture_output=True, **kwargs)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    with tempfile.TemporaryDirectory(prefix="fabsy-ticket-draft-pg-", dir="/tmp") as folder:
        temporary = Path(folder)
        cluster = temporary / "data"
        socket = temporary / "socket"
        socket.mkdir()
        bootstrap = temporary / "bootstrap.sql"
        bootstrap.write_text(BOOTSTRAP)
        command([binaries["initdb"], "-D", str(cluster), "-A", "trust", "-U", "fabsy_draft_test", "--no-locale", "--encoding=UTF8"])
        started = False
        try:
            command([
                binaries["pg_ctl"], "-D", str(cluster), "-l", str(temporary / "postgres.log"),
                "-o", shlex.join(["-k", str(socket), "-h", "", "-p", "55443"]), "-w", "start",
            ])
            started = True
            connection = [
                binaries["psql"], "-X", "-q", "-h", str(socket), "-p", "55443",
                "-U", "fabsy_draft_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
            ]
            command([*connection, "-f", str(bootstrap)])
            command([*connection, "-f", str(ROOT / "supabase/migrations/20260903120000_ticket_intake_drafts.sql")])
            result = command([*connection, "-f", str(Path(__file__).with_name("ticket-intake-drafts.test.sql"))])
            print(result.stdout.strip())
        finally:
            if started:
                command([binaries["pg_ctl"], "-D", str(cluster), "-m", "immediate", "-w", "stop"])


if __name__ == "__main__":
    run()
