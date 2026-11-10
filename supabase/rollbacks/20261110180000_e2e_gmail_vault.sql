-- Rollback of 20261110180000_e2e_gmail_vault.sql
-- Drops the one-time test-inbox setup and deletes only these Vault names:
--   e2e_gmail_client_id, e2e_gmail_client_secret, e2e_gmail_refresh_token
-- Does not delete staff Gmail tokens, auth users, or mail_accounts.
-- NOT APPLIED.

begin;
set local lock_timeout = '3s';

drop function if exists public.e2e_gmail_credentials();
drop function if exists public.e2e_gmail_svc_finish(text, text, text);
drop function if exists public.e2e_gmail_svc_abort();
drop function if exists public.e2e_gmail_svc_take(text);
drop function if exists public.e2e_gmail_svc_peek(text);
drop function if exists public.e2e_gmail_svc_begin(uuid, text, text);
drop function if exists public.e2e_gmail_svc_reopen(uuid);
drop function if exists public.e2e_gmail_svc_save_client(uuid, text, text);
drop function if exists public.e2e_gmail_svc_status(uuid);
drop function if exists private.e2e_gmail_vault_get(text);
drop function if exists private.e2e_gmail_vault_put(text, text, text);
drop function if exists private.e2e_gmail_admin(uuid);
drop table if exists private.e2e_gmail_setup;

do $$
begin
  if to_regclass('vault.secrets') is not null then
    delete from vault.secrets where name in ('e2e_gmail_client_id', 'e2e_gmail_client_secret', 'e2e_gmail_refresh_token');
  end if;
end $$;

commit;
