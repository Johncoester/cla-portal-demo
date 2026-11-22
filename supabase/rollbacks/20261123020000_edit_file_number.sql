-- Rollback FF-050. Numbers already changed stay as they are. The automatic number on a new file is unchanged.
begin;
set local lock_timeout = '3s';
drop trigger if exists deals_file_number_edit on public.deals;
drop function if exists private.deal_file_number_edit();
commit;
