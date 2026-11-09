-- Rollback of 20261109200000_gmail_phase1.sql (roll back 20261109200100 first).
-- Removes everything the migration added: tables (with their policies), functions and every gmail_refresh_* Vault secret.
-- Revoke tokens at Google first (Profile > Disconnect) if anyone connected; deleting the Vault secret alone does not revoke them.
-- Emails stored on files are DELETED. Attachments saved to Documents stay (documents cannot be deleted).
begin;
set local lock_timeout = '3s';
do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'gmail-sync-every-3-min') then
      raise exception 'refusing: roll back 20261109200100_gmail_sync_schedule first'; end if;
  end if;
end $$;
drop function if exists public.gmail_svc_check_sync_token(text);
drop function if exists public.gmail_svc_record(jsonb);
drop function if exists public.gmail_svc_audit(uuid, uuid, text, text);
drop function if exists public.gmail_svc_known_messages(text, text[]);
drop function if exists public.gmail_svc_linked_threads(text);
drop function if exists public.gmail_svc_connected_accounts();
drop function if exists public.gmail_svc_update_account(uuid, text, text, text, boolean);
drop function if exists public.gmail_svc_disconnect(uuid, text);
drop function if exists public.gmail_svc_token(uuid);
drop function if exists public.gmail_svc_connect(uuid, text, text, text, text);
drop function if exists public.gmail_svc_take_oauth(text);
drop function if exists public.gmail_svc_begin_oauth(uuid, text, text);
drop function if exists public.gmail_set_signature(text);
drop function if exists public.gmail_my_context();
delete from vault.secrets where name like 'gmail\_refresh\_%';
drop table if exists public.deal_emails;
drop table if exists private.mail_threads;
drop table if exists private.gmail_oauth_states;
drop table if exists private.mail_account_secrets;
drop table if exists public.mail_accounts;
drop function if exists private.gmail_roles();
commit;
