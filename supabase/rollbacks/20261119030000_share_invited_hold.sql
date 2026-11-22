-- Rollback for 20261119030000_share_invited_hold.sql.
-- Conversations already started for someone without a login stay (the sender can still read them). The held rows are dropped,
-- so nobody is added to those conversations when they sign in later.
begin;
set local lock_timeout = '3s';
drop trigger if exists zz_release_thread_invitees on public.contacts;
drop function if exists private.trg_release_thread_invitees();
drop function if exists public.thread_invitees_list(uuid[]);
drop function if exists public.create_thread_invited(uuid, text, uuid, text);
drop function if exists private.rpc_create_thread_invited(uuid, text, uuid, text);
drop table if exists public.thread_invitees;
commit;

notify pgrst, 'reload schema';
