-- FF-053 (Francis, Nov 11 2026, confirmed "That's correct"): a mortgage broker is a contact type
-- of its own, so several brokers can sit under one brokerage. The brokerage company name stays
-- on deals.mortgage_broker_name. No new deal column.
-- Rollback: supabase/rollbacks/20261123030000_loan_broker_split.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_lender_role_chk') then
    raise exception 'drift: contacts_lender_role_chk is missing'; end if;
end $$;

alter table public.contacts drop constraint contacts_lender_role_chk;
alter table public.contacts add constraint contacts_lender_role_chk
  check (lender_role is null or lender_role in ('loan_officer', 'lender_tc', 'mortgage_broker'));

comment on column public.deals.mortgage_broker_name is
  'Mortgage brokerage company name. Individual brokers are contacts with lender_role mortgage_broker.';
comment on column public.contacts.lender_role is
  'loan_officer, lender_tc, or mortgage_broker. Null when not set, including a company saved with no person.';

commit;
