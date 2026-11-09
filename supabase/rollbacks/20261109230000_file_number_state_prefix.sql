-- Rollback 20261109230000_file_number_state_prefix: restores the hard-coded MD-26- default. Numbers already assigned are left as they are.
begin;
set local lock_timeout = '3s';
alter table public.deals alter column file_number set default ('MD-26-'::text || nextval('file_number_seq'::regclass));
drop trigger if exists deals_file_number on public.deals;
drop function if exists private.deal_file_number();
drop function if exists private.file_number_prefix(text);
commit;
