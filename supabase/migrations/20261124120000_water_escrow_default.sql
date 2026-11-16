-- PRORATE-1 (Caroline Kim, Nov 16 2026, 2:18 PM ET; John confirmed 2:50 PM ET; tracker row 322).
-- A NEW purchase file gets the state water escrow as a seller charge on the fee ledger (CD section H,
-- ALTA Miscellaneous), so it shows on the Settlement Statement and the Closing Disclosure.
--   Maryland and DC $400, Florida $250, Virginia and every other state: no line.
-- A refinance gets no line. Files already in the database are not changed: this runs only when a file is created.
-- Staff can change the amount, who pays, or retire the line. A later save does not put the default back.
-- Not applied by this pull request. Rollback: supabase/rollbacks/20261124120000_water_escrow_default.sql
begin;
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.accounting_fees') is null then
    raise exception 'drift: accounting_fees is not on this database';
  end if;
  if to_regclass('public.deals') is null then
    raise exception 'drift: deals is not on this database';
  end if;
  if to_regprocedure('private.seed_water_escrow()') is not null then
    raise exception 'drift: seed_water_escrow already exists';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.deals'::regclass and tgname = 'deals_water_escrow') then
    raise exception 'drift: deals_water_escrow trigger already exists';
  end if;
end $$;

create function private.seed_water_escrow() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  amt numeric;
  st text := upper(btrim(coalesce(new.state, '')));
begin
  if coalesce(new.transaction_type, 'Purchase') = 'Refinance' then return new; end if;
  amt := case st when 'MD' then 400 when 'DC' then 400 when 'FL' then 250 else 0 end;
  if amt <= 0 then return new; end if;
  if exists (
    select 1 from public.accounting_fees f
    where f.deal_id = new.id
      and (f.preset_key = 'waterEscrow' or lower(btrim(f.description)) = 'water escrow')
  ) then return new; end if;
  insert into public.accounting_fees (
    deal_id, kind, description, alta_section, cd_section, cd_line, payee, amount,
    paid_by, split_buyer, split_seller, split_lender, split_other, timing, poc, title_prefix,
    note, preset_key
  ) values (
    new.id, 'charge', 'Water escrow', 'misc', 'H', '', 'CLA Title & Escrow', amt,
    'seller', 0, amt, 0, 0, 'at', false, false,
    'Default for ' || st || '. The seller pays this at closing. It is held for the final water bill. Change the amount on this file if it should be different.',
    'waterEscrow'
  );
  return new;
end
$fn$;

create trigger deals_water_escrow
  after insert on public.deals
  for each row execute function private.seed_water_escrow();

commit;
