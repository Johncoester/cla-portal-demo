-- Agent fees follow-ups (John, Nov 13 2026; assigned to Claude): one source for commissions.
-- Commissions used to be typed in four places (Place Order, Edit order details, Accounting > Contract figures, the TC's contract
-- figures) and saved on the order (deals.listing_commission_pct / _amount, deals.buyer_commission_pct / _amount, and the commission
-- keys of deals.financial). Anyone on the file could read those columns, buyers and sellers included. From now on the only home for
-- commissions is Agent fees (deal_agent_fees, AF-1), which buyers and sellers can't read.
--   1. Every commission still on an order is moved into Agent fees for its side (listing agent / buyer's agent), as a staff entry,
--      unless that side already has a commission there. The move is in the Agent fees change history. A value that can't be checked
--      against the sales price (no price, or more than the price) is kept in the history only, with the reason.
--   2. The old columns are emptied and the commission keys are taken out of deals.financial. EMD held by stays.
--   3. A guard stops anything from writing a commission to the order again, with a plain message (an old page still open).
-- Rollback: supabase/rollbacks/20261119030000_agent_fee_one_source.sql (removes the guard; the moved fees stay in Agent fees).
begin;
set local lock_timeout = '3s';

do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
        and column_name in ('listing_commission_pct', 'listing_commission_amount', 'buyer_commission_pct', 'buyer_commission_amount', 'financial')) <> 5 then
    raise exception 'drift: deals is missing an older commission column or financial';
  end if;
  if to_regclass('public.deal_agent_fees') is null or to_regprocedure('private.agent_fee_sync(numeric,text,numeric,numeric)') is null then
    raise exception 'drift: apply the Agent fees migrations (20261117100000 to 20261118040000) first';
  end if;
end $$;

-- the commission keys Place Order, Edit order details and Accounting kept in deals.financial
create or replace function private.old_commission_keys() returns text[]
language sql immutable set search_path to pg_catalog as $$
  select array['commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionTotal', 'commissionPaidBy',
               'listingCommissionPercent', 'listingCommissionAmount', 'buyerCommissionPercent', 'buyerCommissionAmount'] $$;

-- a stored number, or null when it isn't one
create or replace function private.old_commission_num(p jsonb) returns numeric
language plpgsql immutable set search_path to pg_catalog as $$
begin
  if p is null or jsonb_typeof(p) not in ('number', 'string') or btrim(p #>> '{}') = '' then return null; end if;
  return replace(replace(btrim(p #>> '{}'), ',', ''), '$', '')::numeric;
exception when others then return null;
end $$;

-- 1. move what's on the orders into Agent fees
do $$
declare
  d record; s text; v_pct numeric; v_amt numeric; v_basis text; v_sync record; f jsonb; v_old jsonb;
  v_reason text := 'Moved from the order''s older commission fields (one place for commissions, Nov 13 2026)';
begin
  for d in select x.id, x.purchase_price, x.transaction_type, x.listing_commission_pct, x.listing_commission_amount,
                  x.buyer_commission_pct, x.buyer_commission_amount, coalesce(x.financial, '{}'::jsonb) as financial
             from public.deals x
            where x.listing_commission_pct is not null or x.listing_commission_amount is not null
               or x.buyer_commission_pct is not null or x.buyer_commission_amount is not null
               or coalesce(x.financial, '{}'::jsonb) ?| private.old_commission_keys() loop
    f := d.financial;
    foreach s in array array['listing', 'buyer'] loop
      if s = 'listing' then
        v_pct := coalesce(d.listing_commission_pct, private.old_commission_num(f -> 'listingCommissionPercent'),
                          case when f ->> 'commissionPaidBy' = 'seller' then private.old_commission_num(f -> 'commissionPercent') end);
        v_amt := coalesce(d.listing_commission_amount, private.old_commission_num(f -> 'listingCommissionAmount'),
                          case when f ->> 'commissionPaidBy' = 'seller' then private.old_commission_num(f -> 'commissionTotal') end);
      else
        v_pct := coalesce(d.buyer_commission_pct, private.old_commission_num(f -> 'buyerCommissionPercent'),
                          case when f ->> 'commissionPaidBy' = 'buyer' then private.old_commission_num(f -> 'commissionPercent') end);
        v_amt := coalesce(d.buyer_commission_amount, private.old_commission_num(f -> 'buyerCommissionAmount'),
                          case when f ->> 'commissionPaidBy' = 'buyer' then private.old_commission_num(f -> 'commissionTotal') end);
      end if;
      continue when v_pct is null and v_amt is null;
      continue when d.transaction_type = 'Refinance';   -- a refinance has no agent fees
      v_old := jsonb_strip_nulls(jsonb_build_object('kind', 'commission', 'percent', v_pct, 'amount', v_amt, 'from', 'order'));
      if exists (select 1 from public.deal_agent_fees x where x.deal_id = d.id and x.side = s and x.kind = 'commission') then
        -- Agent fees already has this side's commission, which wins; the older figure is kept in the history
        insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
          values (d.id, s, 'commission', 0, v_old, null, 'Older commission field cleared: Agent fees already had this commission.', 'system', null);
        continue;
      end if;
      v_basis := case when v_amt is not null then 'amount' else 'percent' end;
      begin
        select * into v_sync from private.agent_fee_sync(d.purchase_price, v_basis, v_pct, v_amt);
        insert into public.deal_agent_fees (deal_id, side, kind, slot, basis, pct, amount, payer, source, updated_at)
          values (d.id, s, 'commission', 0, v_basis, v_sync.pct, v_sync.amount, private.agent_fee_default_payer(s), 'staff', now());
        insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
          values (d.id, s, 'commission', 0, null,
                  jsonb_build_object('side', s, 'kind', 'commission', 'slot', 0, 'basis', v_basis, 'percent', v_sync.pct, 'amount', v_sync.amount,
                                     'payer', private.agent_fee_default_payer(s)), v_reason, 'system', null);
      exception when others then
        -- no sales price, or a $ figure above the price: keep the old figure in the history so nothing is lost
        insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
          values (d.id, s, 'commission', 0, v_old, null, 'Older commission field cleared without moving it: ' || sqlerrm || ' Enter it in Agent fees.', 'system', null);
      end;
    end loop;
  end loop;
end $$;

-- 2. empty the old places (EMD held by and anything else in financial stays)
update public.deals
   set listing_commission_pct = null, listing_commission_amount = null, buyer_commission_pct = null, buyer_commission_amount = null,
       financial = coalesce(financial, '{}'::jsonb) - private.old_commission_keys()
 where listing_commission_pct is not null or listing_commission_amount is not null
    or buyer_commission_pct is not null or buyer_commission_amount is not null
    or coalesce(financial, '{}'::jsonb) ?| private.old_commission_keys();

-- 3. nothing writes a commission to the order again
create or replace function private.deal_old_commission_guard() returns trigger
language plpgsql set search_path to pg_catalog, public as $$
begin
  if new.listing_commission_pct is not null or new.listing_commission_amount is not null
     or new.buyer_commission_pct is not null or new.buyer_commission_amount is not null
     or jsonb_strip_nulls(coalesce(new.financial, '{}'::jsonb)) ?| private.old_commission_keys() then
    raise exception 'Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter them there. Nothing was saved.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists deals_old_commission_guard on public.deals;
create trigger deals_old_commission_guard before insert or update on public.deals
  for each row execute function private.deal_old_commission_guard();

comment on column public.deals.listing_commission_pct is 'No longer used (Nov 13 2026): commissions live in deal_agent_fees. Always empty.';
comment on column public.deals.listing_commission_amount is 'No longer used (Nov 13 2026): commissions live in deal_agent_fees. Always empty.';
comment on column public.deals.buyer_commission_pct is 'No longer used (Nov 13 2026): commissions live in deal_agent_fees. Always empty.';
comment on column public.deals.buyer_commission_amount is 'No longer used (Nov 13 2026): commissions live in deal_agent_fees. Always empty.';

revoke all on function private.old_commission_keys(), private.old_commission_num(jsonb), private.deal_old_commission_guard() from public, anon, authenticated;

commit;
