-- Rollback for 20261131000000_outbox_sender.sql (OUTBOX-SEND-1). Stops the sender; keeps every row and what happened to it.
-- The two "never send" checks come back NOT VALID, so sent / skipped rows stay as they are and nothing new can be sent.
begin;
set local lock_timeout = '3s';
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'outbox-send-every-minute') then perform cron.unschedule('outbox-send-every-minute'); end if;
  end if;
end $$;
drop function if exists public.outbox_claim_batch(integer);
drop function if exists public.outbox_mark_result(uuid, boolean, text, text, boolean);
drop function if exists public.outbox_svc_check_token(text);
drop function if exists private.outbox_tc_only_problem(public.outbox);
drop function if exists private.set_outbox_send_mode(text, text);
drop table if exists private.outbox_send_settings;
drop index if exists public.outbox_send_queue;
-- a row a sender had taken goes back to queued (it was not marked sent)
update public.outbox set status = 'queued', claimed_at = null where status = 'sending';
alter table public.outbox drop constraint if exists outbox_status_check;
alter table public.outbox drop constraint if exists outbox_sent_at_check;
alter table public.outbox drop constraint if exists outbox_attempts_check;
alter table public.outbox add constraint outbox_status_check check (status = 'queued') not valid;
alter table public.outbox add constraint outbox_sent_at_check check (sent_at is null) not valid;
-- the new columns stay (they hold the history); drop them by hand only if nothing was ever sent
commit;
notify pgrst, 'reload schema';
