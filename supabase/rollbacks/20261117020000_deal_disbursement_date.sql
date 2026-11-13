-- Rollback for 20261117020000_deal_disbursement_date.sql. Drops the processor-set dates (the automatic date needs no column).
begin;
alter table public.deals drop column if exists disbursement_date;
commit;
