-- Rollback of 20261109200100_gmail_sync_schedule.sql: stop the reply check, remove its token, remove pg_cron / pg_net.
-- Refuses if any OTHER cron job exists (then only the Gmail job and token are removed by hand, and the extensions stay).
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname <> 'gmail-sync-every-3-min') then
      raise exception 'refusing: another cron job exists; unschedule gmail-sync-every-3-min by hand and keep the extensions'; end if;
    if exists (select 1 from cron.job where jobname = 'gmail-sync-every-3-min') then perform cron.unschedule('gmail-sync-every-3-min'); end if;
  end if;
end $$;
delete from vault.secrets where name = 'gmail_sync_token';
drop extension if exists pg_cron;
drop extension if exists pg_net;
commit;
