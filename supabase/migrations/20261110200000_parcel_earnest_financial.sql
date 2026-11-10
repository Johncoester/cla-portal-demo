-- Parcel ID and earnest / commission figures on an order.
-- Does not write the contacts custom column and does not add a marker key there.
-- CRM validation (private.crm_settings_row / crm_custom_in, in force with the
-- hosted import migration 20261110100000) rejects unknown keys in the contacts
-- custom column. This file does not write that column.
--
-- deals.parcel_id   property parcel id. Existing rows stay blank.
-- deals.financial   jsonb object: emdHeldBy, commissionBase, commissionPercent,
--                   commissionAdditional, commissionTotal, commissionPaidBy.
--                   Existing rows stay {}. EMD held by and a buyer or seller
--                   commission percent also mirror columns the app already reads
--                   when those columns are present; this file does not add them.
--
-- Table grants already cover new columns. RLS is unchanged.
-- Rollback: supabase/rollbacks/20261110200000_parcel_earnest_financial.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
declare n int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals'
      and column_name in ('parcel_id', 'financial')
  ) then
    raise exception 'drift: deals.parcel_id or deals.financial already exists';
  end if;
  if exists (select 1 from pg_constraint where conname in ('deals_parcel_id_len', 'deals_financial_obj')) then
    raise exception 'drift: a parcel or financial check already exists';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals'
      and column_name = 'lender_address' and data_type = 'text' and is_nullable = 'NO'
  ) then
    raise exception 'drift: deals.lender_address is missing or changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals'
      and column_name = 'loss_payee_name' and data_type = 'text' and is_nullable = 'NO'
  ) then
    raise exception 'drift: deals.loss_payee_name is missing or changed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals'
      and column_name = 'latitude' and data_type = 'double precision'
  ) then
    raise exception 'drift: deals.latitude is missing (closing-office migration)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals'
      and column_name = 'longitude' and data_type = 'double precision'
  ) then
    raise exception 'drift: deals.longitude is missing (closing-office migration)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'drift: deals RLS is off';
  end if;
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'deals';
  if n <> 67 then
    raise exception 'drift: deals has % columns, expected 67', n;
  end if;
end $$;

alter table public.deals
  add column parcel_id text not null default '',
  add column financial jsonb not null default '{}'::jsonb;

alter table public.deals add constraint deals_parcel_id_len check (char_length(parcel_id) <= 80);
alter table public.deals add constraint deals_financial_obj check (jsonb_typeof(financial) = 'object');

comment on column public.deals.parcel_id is
  'Property parcel id. Existing rows are blank.';
comment on column public.deals.financial is
  'Earnest and commission figures for this order (emdHeldBy, commissionBase, commissionPercent, commissionAdditional, commissionTotal, commissionPaidBy). Existing rows are {}.';

do $$
declare n int;
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'deals'
        and column_name = 'parcel_id' and data_type = 'text' and is_nullable = 'NO'
        and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: parcel_id not as expected';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'deals'
        and column_name = 'financial' and data_type = 'jsonb' and is_nullable = 'NO'
        and column_default = '''{}''::jsonb') <> 1 then
    raise exception 'readback: financial not as expected';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_parcel_id_len' and convalidated) then
    raise exception 'readback: deals_parcel_id_len missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_financial_obj' and convalidated) then
    raise exception 'readback: deals_financial_obj missing';
  end if;
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'deals';
  if n <> 69 then
    raise exception 'readback: deals has % columns, expected 69', n;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'readback: deals RLS is off';
  end if;
end $$;

commit;
