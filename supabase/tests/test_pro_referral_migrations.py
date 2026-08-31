#!/usr/bin/env python3
"""Exercise photo-radar, pro pricing, referrals and resolution email schema in PG.

Only a private local Unix socket is used; no project secrets, network listeners,
existing database, Stripe calls, refunds, emails, or real client data.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import os
import json
import shutil
import subprocess
import tempfile

from test_referral_program import BOOTSTRAP

ROOT = Path(__file__).resolve().parents[2]
DEPENDENCIES = """
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.is_idr_staff() returns boolean language sql stable security definer as
$$ select public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'case_manager') $$;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
-- An earlier setup mistake must not leave the evidence bucket public.
insert into storage.buckets(id,name,public) values('pro-licences','pro-licences',true);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select on storage.objects to authenticated;
grant all on all tables in schema storage to service_role;
alter table public.ticket_submissions
  add column first_name text not null default 'Synthetic',
  add column last_name text not null default 'Driver',
  add column drivers_license text not null default 'TEST123456',
  add column preferred_locale text not null default 'en',
  add column insurance_company text,
  add column representation_includes_assessment boolean not null default false,
  add column representation_credit_eligible boolean not null default false,
  add column assessment_payment_source text,
  add column assessment_intake jsonb,
  add column assessment_ticket_path text,
  add column assessment_access_token_hash text,
  add column representation_access_token_hash text,
  add column fine_amount text not null default '200.00',
  add column case_outcome text;
alter table public.idr_checkout_intents
  add column type text not null default 'ticket',
  add column expected_amount_cents integer not null default 19800,
  add column purchaser_email text not null default 'synthetic@example.test',
  add column stripe_checkout_session_id text unique,
  add column attempts integer not null default 1;
create table public.idr_orders(id uuid primary key default gen_random_uuid(),ticket_submission_id uuid references public.ticket_submissions(id),
  type text not null,price_paid numeric(10,2) not null);
grant all on public.idr_orders to service_role;
grant select,insert,update on public.idr_checkout_intents to authenticated;
-- Representative pre-existing email schema/policy from the IDR migration. Broad
-- browser grants deliberately exercise RLS, including its new payload columns.
create table public.idr_reports(id uuid primary key default gen_random_uuid());
create table public.idr_email_events (
  id uuid primary key default gen_random_uuid(),
  ticket_submission_id uuid references public.ticket_submissions(id) on delete restrict,
  idr_report_id uuid references public.idr_reports(id) on delete restrict,
  event_key text not null unique,
  event_type text not null check (event_type in ('verdict_set','conviction_stands_offer','report_delivered')),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  recipient_email text not null,
  attempts integer not null default 0 check (attempts >= 0),
  processing_at timestamptz,
  lease_expires_at timestamptz,
  processing_by text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.idr_email_events enable row level security;
grant all on public.idr_email_events to service_role;
grant select,insert,update,delete on public.idr_email_events to anon,authenticated;
create policy "IDR staff can read email events" on public.idr_email_events
  for select to authenticated using (public.is_idr_staff());
insert into public.idr_email_events(event_key,event_type,recipient_email)
  select 'existing-' || kind,kind,'private@example.test'
  from unnest(array['verdict_set','conviction_stands_offer','report_delivered']) as kind;
"""


def main():
    pg_config = shutil.which("pg_config")
    if not pg_config:
        raise SystemExit("Local PostgreSQL is required; remote databases are never used.")
    bindir = Path(subprocess.check_output([pg_config, "--bindir"], text=True).strip())
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    with tempfile.TemporaryDirectory(prefix="fabsy-pro-referral-pg-") as directory:
        temporary = Path(directory)
        cluster = temporary / "data"
        socket = temporary / "socket"
        socket.mkdir()

        def command(args, **kwargs):
            result = subprocess.run(args, env=env, text=True, capture_output=True, **kwargs)
            if result.returncode:
                raise RuntimeError(result.stderr or result.stdout)
            return result

        command([str(bindir / "initdb"), "-D", str(cluster), "-U", "postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"])
        started = False
        try:
            command([str(bindir / "pg_ctl"), "-D", str(cluster), "-l", str(temporary / "postgres.log"),
                     "-o", f"-F -c listen_addresses='' -k {socket} -p 55483", "-w", "start"])
            started = True
            connection = [str(bindir / "psql"), "--no-psqlrc", "-h", str(socket), "-p", "55483", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1"]
            command(connection, input=BOOTSTRAP + DEPENDENCIES)
            for migration in ["20260831115000_photo_radar_product.sql", "20260831120000_pro_driver_discount.sql", "20260831121000_referral_program.sql", "20260831122000_resolution_referral_email.sql"]:
                command([*connection, "-f", str(ROOT / "supabase/migrations" / migration)])
            command([*connection, "-f", str(ROOT / "supabase/tests/pro-referral-migrations.test.sql")])
            command([*connection, "-f", str(ROOT / "supabase/tests/product-locales.test.sql")])
            command([*connection, "-f", str(ROOT / "supabase/tests/resolution-referral-email.test.sql")])
            def reconcile(status):
                return command(connection, input=f"""
set request.jwt.claim.role = 'service_role';
select public.complete_pro_discount_refund('40000000-0000-4000-8000-000000000002','pi_refund_race','re_race',4158,'{status}');
""")
            with ThreadPoolExecutor(max_workers=2) as executor:
                list(executor.map(reconcile, ["pending", "succeeded"]))
            command(connection, input="""
do $$ begin
  if not exists(select 1 from public.pro_discount_refunds r join public.ticket_submissions t on t.id = r.ticket_submission_id
    where t.id = '40000000-0000-4000-8000-000000000002' and r.status = 'succeeded' and t.discount_applied = 'PRO20' and t.pro_discount_cents = 3960)
    then raise exception 'Concurrent refund events regressed success or split parent state'; end if;
end $$;
""")
            # Execute the actual aggregate report inside a READ ONLY transaction.
            # A bundle's report allocation and a PRO refund's GST must not inflate
            # or double-reduce service revenue. Other refund amounts remain unknown.
            report = (ROOT / "supabase/reports/pro-referral-metrics.sql").read_text().strip().removesuffix(";")
            metrics_output = command([*connection, "-A", "-t"], input="begin read only;\nselect row_to_json(metrics) from (\n" + report + "\n) metrics;\ncommit;")
            metrics = json.loads(metrics_output.stdout.strip())
            expected = {
                "current_paid_service_orders": 6,
                "current_paid_officer_orders": 5,
                "pro_verified_officer_orders": 4,
                "current_paid_camera_orders": 1,
                "legacy_or_unpriced_paid_orders": 1,
                "orders_with_duplicate_paid_intents": 0,
                "officer_pro_verified_share_percent": 80,
                "officer_share_exceeds_business_review_threshold": True,
                "camera_referred_orders": 1,
                "camera_fleet_excluded_orders": 1,
                "booked_service_after_upfront_discount_cad": 1014.60,
                "recorded_pro_service_refunds_cad": 39.60,
                "recorded_service_before_other_refunds_cad": 975.00,
                "recorded_service_arpu_before_other_refunds_cad": 162.50,
                "complete_net_service_arpu_cad": None,
                "orders_needing_refund_reconciliation": 2,
            }
            for key, value in expected.items():
                if metrics[key] != value:
                    raise AssertionError(f"Aggregate metric {key}: expected {value}, got {metrics[key]}")
            print("Combined SQL: photo-radar/pro/referral/resolution migrations, proof/privacy, pricing snapshots, atomic refunds, bundle allocation and referral stacking checks passed.")
        finally:
            if started:
                command([str(bindir / "pg_ctl"), "-D", str(cluster), "-m", "fast", "-w", "stop"])


if __name__ == "__main__":
    main()
