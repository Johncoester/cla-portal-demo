-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105223025, name accounting_qualia.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 40 (John, Nov 4 2026: "mimic everything that you see in the accounting tab video ... This is exactly how Qualia works"):
-- the Accounting tab's Charges pages follow Qualia's Closing › Charges workflow. Re-runnable. Turns NOTHING on: the 'accounting' switch from
-- migration 34 still gates every read and write (off by default). FAKE DATA ONLY in every environment this has been run in. No delete is added.
--  * accounting_fees.charge_meta (jsonb, null = none): the Qualia line settings + payments of a charge line
--      payments  [{ payee, method check|wire|netFunded|aggregate|transfer|holdback, label, memo, amount, street, unit, intl, transferOrder,
--                  forBenefitOf, releaseNote, releaseDate, aggregatePayee }]  (at most 8; the first payee gets the rest of the line)
--      loanPct   A.01 "% of Loan Amount (Points)" user override       months   F.01/F.02/F.04 # of months, G # of months
--      perMonth  G $ per month                                          recType  E.01 recording type (Deed, Mortgage, Release ...)
--      perDiem   F.03 prepaid interest { from, to, perDiem, rate, daysPerYear 360|365|366, decimals 0-5, paidBy buyer|seller }
--    Only these keys are accepted (CHECK accounting_fees_meta_rules). WIRE INSTRUCTIONS (routing / account numbers, bank names) can NEVER be stored:
--    there is no key for them and any unknown key is refused.
--  * Qualia shows description-only lines ("H.01 Home Warranty" with no amount yet): a CHARGE on a NUMBERED line (cd_line 01-99) of a CD fee
--    section A-H may now be $0.00 (accounting_fees_rules re-created with that one change; not for the aggregate adjustment). Everything else
--    must still be more than zero.
-- NOTE: migration 34 (re)creates accounting_fees_rules with amount > 0; apply 40 after any re-run of 34 (the normal in-order run does that).
-- =====================================================================
alter table public.accounting_fees add column if not exists charge_meta jsonb;

create or replace function private.acct_meta_ok(m jsonb) returns boolean language plpgsql immutable set search_path = public as $$
declare p jsonb; k text;
begin
  if m is null then return true; end if;
  if jsonb_typeof(m) <> 'object' or pg_column_size(m) > 8000 then return false; end if;
  for k in select jsonb_object_keys(m) loop if k not in ('payments', 'loanPct', 'months', 'perDiem', 'perMonth', 'recType') then return false; end if; end loop;
  if m ? 'loanPct' and not (jsonb_typeof(m -> 'loanPct') = 'number' and (m ->> 'loanPct')::numeric between 0 and 100) then return false; end if;
  if m ? 'months' and not (jsonb_typeof(m -> 'months') = 'number' and (m ->> 'months')::numeric between 0 and 360 and (m ->> 'months')::numeric = trunc((m ->> 'months')::numeric)) then return false; end if;
  if m ? 'perMonth' and not (jsonb_typeof(m -> 'perMonth') = 'number' and (m ->> 'perMonth')::numeric between 0 and 100000000) then return false; end if;
  if m ? 'recType' and not coalesce(m ->> 'recType' in ('Deed', 'Mortgage', 'Release', 'Assignment', 'Power of Attorney', 'Other'), false) then return false; end if;
  if m ? 'perDiem' then
    if jsonb_typeof(m -> 'perDiem') <> 'object' then return false; end if;
    for k in select jsonb_object_keys(m -> 'perDiem') loop if k not in ('from', 'to', 'perDiem', 'rate', 'daysPerYear', 'decimals', 'paidBy') then return false; end if; end loop;
    if (m -> 'perDiem') ? 'from' and not coalesce(m -> 'perDiem' ->> 'from' ~ '^\d{4}-\d{2}-\d{2}$', false) then return false; end if;
    if (m -> 'perDiem') ? 'to' and not coalesce(m -> 'perDiem' ->> 'to' ~ '^\d{4}-\d{2}-\d{2}$', false) then return false; end if;
    if (m -> 'perDiem') ? 'daysPerYear' and not coalesce(m -> 'perDiem' ->> 'daysPerYear' in ('360', '365', '366'), false) then return false; end if;
    if (m -> 'perDiem') ? 'paidBy' and not coalesce(m -> 'perDiem' ->> 'paidBy' in ('buyer', 'seller'), false) then return false; end if;
  end if;
  if m ? 'payments' then
    if jsonb_typeof(m -> 'payments') <> 'array' or jsonb_array_length(m -> 'payments') > 8 then return false; end if;
    for p in select jsonb_array_elements(m -> 'payments') loop
      if jsonb_typeof(p) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(p) loop
        if k not in ('payee', 'method', 'label', 'memo', 'amount', 'street', 'unit', 'intl', 'transferOrder', 'forBenefitOf', 'releaseNote', 'releaseDate', 'aggregatePayee') then return false; end if; end loop;
      if not coalesce(p ->> 'method' in ('check', 'wire', 'netFunded', 'aggregate', 'transfer', 'holdback'), false) then return false; end if;
      if p ? 'amount' and not (jsonb_typeof(p -> 'amount') = 'number' and (p ->> 'amount')::numeric between 0 and 100000000) then return false; end if;
      if p ? 'releaseDate' and not coalesce(p ->> 'releaseDate' ~ '^\d{4}-\d{2}-\d{2}$', false) then return false; end if;
      if p ? 'forBenefitOf' and not coalesce(p ->> 'forBenefitOf' in ('buyer', 'seller', 'lender', 'other'), false) then return false; end if;
      if char_length(coalesce(p ->> 'payee', '')) > 120 or char_length(coalesce(p ->> 'memo', '')) > 200 or char_length(coalesce(p ->> 'releaseNote', '')) > 300 then return false; end if;
    end loop;
  end if;
  return true;
end $$;

alter table public.accounting_fees drop constraint if exists accounting_fees_meta_rules;
alter table public.accounting_fees add constraint accounting_fees_meta_rules check (private.acct_meta_ok(charge_meta) and (charge_meta is null or kind = 'charge'));

-- migration 34's row rules, with ONE change: amount = 0 allowed for a charge on a numbered A-H line (description-only lines, Qualia)
alter table public.accounting_fees drop constraint if exists accounting_fees_rules;
alter table public.accounting_fees add constraint accounting_fees_rules check (
  kind in ('charge', 'credit') and char_length(btrim(description)) between 1 and 200
  and alta_section in ('financial', 'prorations', 'loanCharges', 'otherLoanCharges', 'impounds', 'title', 'commission', 'government', 'payoffs', 'misc')
  and cd_section in ('A', 'B', 'C', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N', '') and cd_line ~ '^((0[1-9])|([1-9][0-9]))?$'
  and (amount > 0 or (amount = 0 and kind = 'charge' and cd_section in ('A', 'B', 'C', 'E', 'F', 'G', 'H') and cd_line <> '' and not reduces))
  and amount <= 100000000 and split_buyer >= 0 and split_seller >= 0 and split_lender >= 0 and split_other >= 0
  and char_length(payee) <= 120 and char_length(note) <= 1000 and timing in ('at', 'before') and (not poc or timing = 'before')
  and (kind <> 'charge' or (credit_from is null and credit_to is null and paid_by in ('buyer', 'seller', 'lender', 'other', 'split')
        and split_buyer + split_seller + split_lender + split_other <= amount and cd_section not in ('K', 'L', 'M')
        and (cd_section <> 'N' or split_seller > 0) and (not title_prefix or alta_section = 'title')))
  and (kind <> 'credit' or (credit_from in ('buyer', 'seller', 'lender', 'deposit', 'other') and credit_to in ('buyer', 'seller') and credit_from <> credit_to
        and cd_section in ('', 'K', 'L', 'M', 'N') and paid_by is null and split_buyer + split_seller + split_lender + split_other = 0
        and not title_prefix and not poc and timing = 'at')));
