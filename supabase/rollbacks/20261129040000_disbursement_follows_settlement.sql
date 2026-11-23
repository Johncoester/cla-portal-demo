-- Rollback MF-060. Disbursement dates already cleared stay automatic (they show the closing date on a purchase).
begin;
set local lock_timeout = '3s';
drop trigger if exists deals_disbursement_follows on public.deals;
drop function if exists private.deal_disbursement_follows_closing();
commit;
