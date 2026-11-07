-- Rollback for 20261107_test_accounting_contract_terms.sql.
-- Drops the contract-figure table, its log, and its trigger. Does not change private.features.
-- Does not change deals, accounting_fees, payoffs, funding, or wires.

drop trigger if exists accounting_contract_terms_guard on public.accounting_contract_terms;
drop table if exists public.accounting_contract_terms_log;
drop table if exists public.accounting_contract_terms;
drop function if exists private.accounting_contract_terms_guard();
