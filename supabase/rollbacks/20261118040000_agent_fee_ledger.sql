-- Rollback for AF-5 (20261118040000_agent_fee_ledger.sql): stops automatic posting. Ledger lines already posted stay on the ledger
-- (fees are never deleted); retire them on the Accounting tab if needed.
begin;
drop trigger if exists zz_agent_fee_ledger on public.deal_agent_fees;
drop function if exists private.agent_fee_ledger_sync();
drop function if exists private.agent_fee_ledger_shape(public.accounting_fees);
drop table if exists public.deal_agent_fee_ledger;
commit;
