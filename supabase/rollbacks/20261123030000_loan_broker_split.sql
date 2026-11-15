-- Rollback FF-053. Broker contacts lose the mortgage_broker mark so the old check can return.
-- The brokerage name on the order is kept.
begin;
set local lock_timeout = '3s';
update public.contacts set lender_role = null where lender_role = 'mortgage_broker';
alter table public.contacts drop constraint if exists contacts_lender_role_chk;
alter table public.contacts add constraint contacts_lender_role_chk
  check (lender_role is null or lender_role in ('loan_officer', 'lender_tc'));
comment on column public.deals.mortgage_broker_name is
  'Mortgage broker or lender brokerage. Not the lender company name. Existing rows start blank.';
comment on column public.contacts.lender_role is
  'loan_officer or lender_tc (the lender processor). Null on every existing contact and on a lender company saved with no person.';
commit;
