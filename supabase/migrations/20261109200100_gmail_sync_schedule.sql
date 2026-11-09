-- John, Nov 9: Gmail phase 1 reply check on CLA Portal Live Test (TEST only). John OK'd pg_cron + pg_net on TEST.
-- Every 3 minutes pg_cron calls the gmail-sync edge function (verify_jwt off; it checks this shared token against Vault).
-- The token is random, made here, kept only in Vault, and read by the cron job at run time. Nobody sees or copies it.
-- gmail-sync stores ONLY messages in Gmail threads already linked to a file; nothing else is read past its id.
-- Rollback: supabase/rollbacks/20261109200100_gmail_sync_schedule.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regprocedure('public.gmail_svc_check_sync_token(text)') is null then raise exception 'drift: apply 20261109200000_gmail_phase1 first'; end if;
  if exists (select 1 from pg_extension where extname in ('pg_cron', 'pg_net')) then raise exception 'drift: pg_cron or pg_net already installed'; end if;
  if exists (select 1 from vault.secrets where name = 'gmail_sync_token') then raise exception 'drift: gmail_sync_token already exists'; end if;
end $$;

create extension pg_net with schema extensions;
create extension pg_cron with schema pg_catalog;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'gmail_sync_token', 'cron -> gmail-sync shared token (CLA portal TEST)');

select cron.schedule('gmail-sync-every-3-min', '*/3 * * * *', $job$
  select net.http_post(
    url := 'https://aqcervntopidtcazcmlv.supabase.co/functions/v1/gmail-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-gmail-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_token')),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 55000)
$job$);

commit;
