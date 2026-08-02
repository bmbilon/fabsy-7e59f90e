-- Run this file manually in the production Supabase SQL editor.
-- Replace the placeholder values before the first run. Vault keeps them out of cron.job.
-- The schedule is daily at 15:00 UTC.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Preserve existing named secrets on reruns. Rotate an existing cron secret
-- explicitly with vault.update_secret rather than placing its value in this
-- reusable scheduling script.
do $vault_setup$
declare
  cron_secret_value text := 'REPLACE_WITH_THE_IDR_CRON_SECRET';
begin
  if not exists (
    select 1 from vault.secrets where name = 'idr_project_url'
  ) then
    perform vault.create_secret(
      'https://gcasbisxfrssonllpqrw.supabase.co',
      'idr_project_url',
      'Fabsy IDR Edge Function base URL'
    );
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'idr_cron_secret'
  ) then
    if cron_secret_value like 'REPLACE\_WITH\_%' escape '\' then
      raise exception
        'Replace REPLACE_WITH_THE_IDR_CRON_SECRET before creating the first reminder job.';
    end if;
    perform vault.create_secret(
      cron_secret_value,
      'idr_cron_secret',
      'Fabsy IDR reminder authentication secret'
    );
  end if;
end
$vault_setup$;

select cron.schedule(
  'fabsy-idr-reminders-daily',
  '0 15 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'idr_project_url'
      limit 1
    ) || '/functions/v1/send-idr-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'idr_cron_secret'
        limit 1
      )
    ),
    body := jsonb_build_object('source', 'pg_cron', 'requested_at', now())
  ) as request_id;
  $$
);

-- Verify the job after scheduling:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'fabsy-idr-reminders-daily';
-- select * from cron.job_run_details order by start_time desc limit 20;
