-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105222958, name accounting_calc_fees.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 36 (John, Nov 3: "start working on having our fees recording fees into the system"): CLA RATES on the Accounting fee ledger.
-- The app's "Calculate fees from CLA rates" (public/js/data/fee-engine.js, the CLA quote calculator's own code + rate tables vendored
-- read-only) adds / updates fees tagged calc_source = 'cla-rates'. Re-runnable. Turns nothing on (the 'accounting' switch from migration 34
-- still gates every read and write). FAKE DATA ONLY in every environment this has been run in. No delete is added anywhere.
--  * calc_key       which calculated line this is (e.g. 'lendersPolicy', 'tax:State transfer tax', 'cla:Settlement Fee to CLA Title & Escrow:buyer');
--                   one ACTIVE (not retired) fee per order and key.
--  * calc_fields    what the calculation set: {description, altaSection, cdSection, cdLine, payee, amount, paidBy, split{buyer,seller,lender,other},
--                   titlePrefix, timing, poc} (same names as the app).
--  * rate_source, calculation, calc_inputs, calc_version, calc_at: where the amount came from and how it was worked out.
--  * overridden     kept by a trigger: true when the row differs from calc_fields (a person changed it). The app keeps overridden rows as they
--                   are on a re-run and only updates untouched ones. The tag and key never change once set.
-- =====================================================================
alter table public.accounting_fees add column if not exists calc_source text;
alter table public.accounting_fees add column if not exists calc_key text;
alter table public.accounting_fees add column if not exists calc_fields jsonb;
alter table public.accounting_fees add column if not exists rate_source text;
alter table public.accounting_fees add column if not exists calculation text;
alter table public.accounting_fees add column if not exists calc_inputs jsonb;
alter table public.accounting_fees add column if not exists calc_version text;
alter table public.accounting_fees add column if not exists calc_at timestamptz;
alter table public.accounting_fees add column if not exists overridden boolean not null default false;
alter table public.accounting_fees drop constraint if exists accounting_fees_calc_rules;
alter table public.accounting_fees add constraint accounting_fees_calc_rules check (
  (calc_source is null and calc_key is null and calc_fields is null and not overridden)
  or (coalesce(calc_source = 'cla-rates', false) and calc_key is not null and calc_fields is not null and kind = 'charge' and char_length(btrim(calc_key)) between 1 and 200 and jsonb_typeof(calc_fields) = 'object'
      and char_length(coalesce(rate_source, '')) <= 500 and char_length(coalesce(calculation, '')) <= 2000));
create unique index if not exists accounting_fees_calc_active_key on public.accounting_fees (deal_id, calc_key) where calc_key is not null and retired_at is null;

create or replace function private.acct_calc_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_now jsonb;
begin
  if tg_op = 'UPDATE' and old.calc_source is not null and (new.calc_source is distinct from old.calc_source or new.calc_key is distinct from old.calc_key) then
    raise exception 'A fee calculated from CLA rates keeps its tag and key.' using errcode = 'P0001'; end if;
  if new.calc_source is null then new.overridden := false; return new; end if;
  v_now := jsonb_build_object('description', new.description, 'altaSection', new.alta_section, 'cdSection', new.cd_section, 'cdLine', new.cd_line, 'payee', new.payee,
    'amount', new.amount, 'paidBy', new.paid_by, 'split', jsonb_build_object('buyer', new.split_buyer, 'seller', new.split_seller, 'lender', new.split_lender, 'other', new.split_other),
    'titlePrefix', new.title_prefix, 'timing', new.timing, 'poc', new.poc);
  new.overridden := exists (select 1 from jsonb_each(v_now) e where (new.calc_fields -> e.key) is distinct from e.value);
  return new;
end $$;
drop trigger if exists accounting_fees_zcalc on public.accounting_fees;   -- "z": runs after accounting_fees_guard (BEFORE triggers fire by name)
create trigger accounting_fees_zcalc before insert or update on public.accounting_fees for each row execute function private.acct_calc_guard();
