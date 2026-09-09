-- The existing private IDR scheduler secrets are already used by this project.
-- Skip on fresh/local projects until these secrets have been provisioned.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net')
    and exists(select 1 from pg_namespace where nspname='vault') then
    if exists(select 1 from vault.secrets where name='idr_project_url')
      and exists(select 1 from vault.secrets where name='idr_cron_secret') then
      perform cron.schedule('fabsy-disclosure-notices','* * * * *', $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='idr_project_url') || '/functions/v1/process-disclosure-notices',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name='idr_cron_secret')),
          body := '{}'::jsonb,
          timeout_milliseconds := 150000
        );
      $job$);
    end if;
  end if;
end $$;
