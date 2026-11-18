-- Rolls back 20261125170000_tax_rate_sheets.sql. Drops the tax rate sheet tables. Does not touch orders or fees.
begin;
set local lock_timeout = '3s';
drop table if exists public.tax_allocations;
drop table if exists public.tax_questions;
drop table if exists public.tax_exemptions;
drop table if exists public.tax_rate_lines;
drop table if exists public.tax_jurisdictions;
commit;
