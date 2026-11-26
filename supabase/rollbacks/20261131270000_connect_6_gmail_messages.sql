-- Rollback for 20261131270000_connect_6_gmail_messages.sql
-- Drops the Messages read function. public.deal_emails rows and staff Email-tab RLS are unchanged.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;
drop function if exists public.list_deal_emails(uuid);
commit;
