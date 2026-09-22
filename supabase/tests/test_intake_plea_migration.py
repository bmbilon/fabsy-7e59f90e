"""Verify intake plea persistence in a disposable, socket-only PostgreSQL database.

Run: python3 supabase/tests/test_intake_plea_migration.py
Uses synthetic records only; never connects to an existing or remote database.
"""
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = """
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.clients(id uuid primary key, drivers_license text not null,
  first_name text, last_name text, email text, phone text, updated_at timestamptz);
create table public.ticket_submissions(
  id uuid primary key, client_id uuid references public.clients(id), first_name text, last_name text,
  email text, phone text, ticket_number text, violation text, fine_amount text,
  status text, service_type text, preferred_locale text, representation_access_token_hash text,
  ticket_document_path text, source_assessment_id uuid, representation_includes_assessment boolean,
  ticket_type_source text, additional_notes text, consent_form_path text, updated_at timestamptz,
  ticket_type text default 'officer_issued', order_type text default 'rapid_resolution',
  review_path text default 'standard', registered_owner_on_offence_date text, insurance_company text,
  constraint ticket_submissions_product_route_check check (true));
create table public.idr_checkout_intents(ticket_submission_id uuid, checkout_kind text, status text);
"""
CHECKS = """
create function pg_temp.check_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERT FAILED: %',label; end if; end; $$;
create function pg_temp.expect_error(statement text,needle text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(needle in sqlerrm)>0 then return; end if;
    raise exception 'Wrong error (%), expected %',sqlerrm,needle;
  end;
  raise exception 'Expected error %, but statement succeeded',needle;
end; $$;
do $$
declare
  ticket_id uuid;
  choice boolean;
  consent jsonb;
  saved jsonb;
begin
  foreach choice in array array[true,false,null] loop
    ticket_id := gen_random_uuid();
    consent := jsonb_build_object('accepted',true,'method','checkbox',
      'version',case when choice is null then 'photo-upload-consent-v2' else 'photo-upload-consent-v3' end,
      'acceptedAt','2026-09-20T12:00:00Z','ticketSubmissionId',ticket_id::text,
      'ticketDocumentPath',ticket_id::text||'/ticket.pdf');
    if choice is not null then consent := consent || jsonb_build_object('pleadNotGuilty',choice); end if;
    perform public.prepare_photo_ticket_intake(ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.pdf');
    select intake_consent into saved from public.ticket_submissions where id=ticket_id;
    perform pg_temp.check_true(saved=consent,'exact initial consent stored');
    perform public.prepare_photo_ticket_intake(ticket_id,repeat('a',64),consent || '{"acceptedAt":"2026-09-20T12:01:00Z"}',ticket_id::text||'/ticket.pdf');
    perform pg_temp.check_true((select intake_consent=consent from public.ticket_submissions where id=ticket_id),'retry retains original timestamp and choice');
    if choice is null then
      perform pg_temp.check_true(not(saved ? 'pleadNotGuilty'),'legacy remains absent');
    else
      perform pg_temp.check_true((saved->'pleadNotGuilty')=to_jsonb(choice),'true and false round-trip as JSON booleans');
      perform pg_temp.expect_error(format('select public.prepare_photo_ticket_intake(%L,%L,%L::jsonb,%L)',
        ticket_id,repeat('a',64),consent||jsonb_build_object('pleadNotGuilty',not choice),ticket_id::text||'/ticket.pdf'),'INTAKE_CONSENT_CHANGED');
      perform pg_temp.expect_error(format('update public.ticket_submissions set intake_consent=intake_consent-''pleadNotGuilty'' where id=%L',ticket_id),'ticket_submissions_intake_plea_check');
      perform pg_temp.expect_error(format('update public.ticket_submissions set intake_consent=intake_consent||''{"pleadNotGuilty":"true"}''::jsonb where id=%L',ticket_id),'ticket_submissions_intake_plea_check');
      perform pg_temp.expect_error(format('update public.ticket_submissions set intake_consent=intake_consent||''{"pleadNotGuilty":null}''::jsonb where id=%L',ticket_id),'ticket_submissions_intake_plea_check');
      insert into public.idr_checkout_intents values(ticket_id,'ticket_only','paid');
      perform pg_temp.expect_error(format('update public.ticket_submissions set intake_consent=intake_consent||%L::jsonb where id=%L',jsonb_build_object('pleadNotGuilty',not choice),ticket_id),'REPRESENTATION_CHECKOUT_IMMUTABLE');
    end if;
  end loop;
  ticket_id := gen_random_uuid();
  consent := jsonb_build_object('accepted',true,'method','checkbox','version','photo-upload-consent-v3',
    'acceptedAt','2026-09-20T12:00:00Z','ticketSubmissionId',ticket_id::text,'ticketDocumentPath',ticket_id::text||'/ticket.pdf');
  perform pg_temp.expect_error(format('select public.prepare_photo_ticket_intake(%L,%L,%L::jsonb,%L)',
    ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.pdf'),'INTAKE_AUTHORIZATION_INVALID');
  perform pg_temp.expect_error(format('select public.prepare_photo_ticket_intake(%L,%L,%L::jsonb,%L)',
    ticket_id,repeat('a',64),consent||'{"pleadNotGuilty":"false"}',ticket_id::text||'/ticket.pdf'),'INTAKE_AUTHORIZATION_INVALID');
end; $$;
select pg_temp.check_true(not has_function_privilege('anon','public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid)','execute'),'anonymous direct writes denied');
select pg_temp.check_true(not has_function_privilege('authenticated','public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid)','execute'),'customer direct writes denied');
select pg_temp.check_true(has_function_privilege('service_role','public.prepare_photo_ticket_intake(uuid,text,jsonb,text,uuid)','execute'),'validated service can prepare');
"""

SERVICE_CHECKS = """
do $$
declare ticket_id uuid; ticket_type text; consent jsonb; saved public.ticket_submissions;
begin
  foreach ticket_type in array array['officer_issued','photo_radar'] loop
    ticket_id := gen_random_uuid();
    consent := jsonb_build_object('accepted',true,'method','checkbox','version','photo-upload-consent-v3',
      'pleadNotGuilty',true,'acceptedAt','2026-09-22T12:00:00Z',
      'ticketSubmissionId',ticket_id::text,'ticketDocumentPath',ticket_id::text||'/ticket.png');
    perform public.prepare_photo_ticket_intake(ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.png',gen_random_uuid(),ticket_type);
    select * into saved from public.ticket_submissions where id=ticket_id;
    perform pg_temp.check_true(saved.ticket_type=ticket_type and saved.ticket_type_source='manual','selected ticket type stored');
    perform pg_temp.check_true(saved.order_type=case when ticket_type='photo_radar' then 'photo_radar' else 'rapid_resolution' end,'matching order type');
    perform pg_temp.check_true(saved.review_path=case when ticket_type='photo_radar' then 'ate' else 'standard' end,'matching review path');
    perform pg_temp.check_true(saved.representation_includes_assessment=(ticket_type<>'photo_radar'),'camera selection excludes assessment');
    perform public.prepare_photo_ticket_intake(ticket_id,repeat('a',64),consent||'{"acceptedAt":"2026-09-22T12:01:00Z"}',ticket_id::text||'/ticket.png',null,ticket_type);
    perform pg_temp.check_true((select intake_consent=consent from public.ticket_submissions where id=ticket_id),'same service retry retains consent');
    perform pg_temp.expect_error(format('select public.prepare_photo_ticket_intake(%L,%L,%L::jsonb,%L,null,%L)',
      ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.png',case when ticket_type='photo_radar' then 'officer_issued' else 'photo_radar' end),'INTAKE_TICKET_TYPE_CHANGED');
    perform pg_temp.expect_error(format('select public.prepare_photo_ticket_intake(%L,%L,%L::jsonb,%L,null,%L)',
      ticket_id,repeat('b',64),consent,ticket_id::text||'/ticket.png',ticket_type),'INTAKE_AUTHORIZATION_INVALID');
    insert into public.idr_checkout_intents values(ticket_id,'ticket_only','open');
    perform pg_temp.expect_error(format('select public.prepare_photo_ticket_intake(%L,%L,%L::jsonb,%L,null,%L)',
      ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.png',ticket_type),'REPRESENTATION_CHECKOUT_IMMUTABLE');
  end loop;
  perform pg_temp.expect_error(format('select public.prepare_photo_ticket_intake(%L,%L,%L::jsonb,%L,null,%L)',
    ticket_id,repeat('a',64),consent,ticket_id::text||'/ticket.png','invalid'),'INTAKE_TICKET_TYPE_INVALID');
end; $$;
"""


def run():
    binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "psql")}
    if not all(binaries.values()):
        raise SystemExit("Local PostgreSQL is required; no remote fallback is used.")

    def command(args, **kwargs):
        result = subprocess.run(args, text=True, capture_output=True, **kwargs)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    with tempfile.TemporaryDirectory(prefix="fabsy-plea-pg-", dir="/tmp") as folder:
        temporary = Path(folder)
        cluster = temporary / "data"
        socket = temporary / "socket"
        socket.mkdir()
        command([binaries["initdb"], "-D", str(cluster), "-A", "trust", "-U", "fabsy_plea_test", "--no-locale", "--encoding=UTF8"])
        started = False
        try:
            command([binaries["pg_ctl"], "-D", str(cluster), "-l", str(temporary / "postgres.log"), "-o", shlex.join(["-k", str(socket), "-h", "", "-p", "55447"]), "-w", "start"])
            started = True
            connection = [binaries["psql"], "-X", "-q", "-h", str(socket), "-p", "55447", "-U", "fabsy_plea_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
            command(connection, input=BOOTSTRAP)
            for migration in ("20260920120000_combined_ticket_consent.sql", "20260920130000_photo_only_intake.sql", "20260920140000_intake_plea_instruction.sql"):
                command([*connection, "-f", str(ROOT / "supabase/migrations" / migration)])
            command(connection, input=CHECKS)
            command([*connection, "-f", str(ROOT / "supabase/migrations/20260922120000_photo_intake_service_selection.sql")])
            command(connection, input=CHECKS.replace("(uuid,text,jsonb,text,uuid)", "(uuid,text,jsonb,text,uuid,text)") + SERVICE_CHECKS)
            for migration in ("20260922180000_intake_offer_context.sql", "20260922182000_intake_landing_variant.sql"):
                command([*connection, "-f", str(ROOT / "supabase/migrations" / migration)])
            command(connection, input=CHECKS.split("do $$")[0] + (ROOT / "supabase/tests/intake-offer-context.test.sql").read_text())
            print("Intake database assertions passed: legacy, service selection, immutable consent/context, atomic contact and alternate label.")
        finally:
            if started:
                command([binaries["pg_ctl"], "-D", str(cluster), "-m", "immediate", "-w", "stop"])


if __name__ == "__main__":
    run()
