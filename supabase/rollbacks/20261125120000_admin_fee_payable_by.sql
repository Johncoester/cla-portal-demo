-- Rollback for FF-093 (20261125120000_admin_fee_payable_by.sql).
-- Admin fee Payable by is Buyer or Seller again. A commission Split is unchanged.
begin;
set local lock_timeout = '3s';

-- An admin fee already saved as Split cannot stay that way. Put it back on the side's default payer
-- (buyer on the buyer's agent side, seller on the listing side) and clear the two halves. The fee
-- ledger follows that row, so the buyer and seller columns move with it.
update public.deal_agent_fees
  set payer = case side when 'buyer' then 'buyer' else 'seller' end,
      split_buyer = null,
      split_seller = null
  where kind = 'admin' and payer = 'split';

alter table public.deal_agent_fees drop constraint if exists deal_agent_fees_payer_check;
alter table public.deal_agent_fees add constraint deal_agent_fees_payer_check
  check (payer is null or payer in ('buyer', 'seller') or (kind = 'commission' and payer = 'split'));

alter table public.deal_agent_fees drop constraint if exists deal_agent_fees_split_check;
alter table public.deal_agent_fees add constraint deal_agent_fees_split_check
  check (
    (payer = 'split' and kind = 'commission' and split_buyer > 0 and split_seller > 0 and round(split_buyer + split_seller, 2) = amount)
    or (payer is distinct from 'split' and split_buyer is null and split_seller is null)
  );

comment on column public.deal_agent_fees.split_buyer is
  'When Paid by is Split, the dollar amount the buyer pays. Otherwise blank.';
comment on column public.deal_agent_fees.split_seller is
  'When Paid by is Split, the dollar amount the seller pays. Otherwise blank.';

create or replace function private.agent_fee_text(v jsonb) returns text
language sql immutable set search_path to pg_catalog as $$
  select case when v is null then 'none'
    when v ->> 'kind' = 'commission' then trim(to_char((v ->> 'percent')::numeric, 'FM999990.9999'), '.') || '% / ' || to_char((v ->> 'amount')::numeric, 'FM$999,999,990.00')
    when v ->> 'kind' = 'other' then coalesce(v ->> 'description', 'Other fee') || ' ' || to_char((v ->> 'amount')::numeric, 'FM$999,999,990.00') || ' to ' || coalesce(v ->> 'paidTo', '')
    else to_char((v ->> 'amount')::numeric, 'FM$999,999,990.00') end
  || case when v ->> 'payer' is not null then ' (paid by ' || initcap(v ->> 'payer') || ')' else '' end $$;

create or replace function public.save_agent_fees(p_deal uuid, p_side text, p_fees jsonb, p_reason text default null)
returns setof jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $fn$
declare
  v_actor text; v_uid uuid := private.effective_uid(); v_price numeric; v_type text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_want jsonb := '[]'::jsonb; v_item jsonb; v_other jsonb; v_old public.deal_agent_fees; v_new jsonb; v_oldj jsonb;
  v_sync record; v_payer text; v_amount numeric; v_desc text; v_paid text; v_i int := 0; v_confirm boolean;
  v_changed int := 0; v_need_reason boolean := false; v_fresh boolean;
  v_base numeric; v_add numeric; v_sb numeric; v_ss numeric;
begin
  if p_side is null or p_side not in ('listing', 'buyer') then raise exception 'Pick the listing agent or buyer''s agent side.' using errcode = 'P0001'; end if;
  v_actor := private.agent_fee_actor(p_deal, p_side);
  if v_actor is null or v_actor = 'reader' then raise exception 'You can''t change agent fees on this file.' using errcode = '42501'; end if;
  select purchase_price, transaction_type into v_price, v_type from public.deals where id = p_deal;
  if v_type = 'Refinance' then raise exception 'A refinance has no agent fees.' using errcode = 'P0001'; end if;
  if p_fees is null or jsonb_typeof(p_fees) <> 'object' then raise exception 'Nothing to save.' using errcode = 'P0001'; end if;
  if v_reason is not null and length(v_reason) > 500 then raise exception 'Keep the reason under 500 characters.' using errcode = 'P0001'; end if;
  v_confirm := v_actor in ('agent', 'tc');

  if jsonb_typeof(p_fees -> 'commission') = 'object' then
    v_item := p_fees -> 'commission';
    v_base := private.agent_fee_num(v_item ->> 'base', 'Commission base');
    v_add := coalesce(private.agent_fee_num(v_item ->> 'additional', 'Additional amount'), 0);
    select * into v_sync from private.agent_fee_sync(v_price, v_item ->> 'basis',
      private.agent_fee_num(v_item ->> 'percent', 'Commission %'), private.agent_fee_num(v_item ->> 'amount', 'Commission $'), v_base, v_add);
    v_payer := coalesce(nullif(v_item ->> 'payer', ''), private.agent_fee_default_payer(p_side));
    v_sb := null; v_ss := null;
    if v_payer = 'split' then
      v_sb := private.agent_fee_num(v_item ->> 'splitBuyer', 'Buyer amount');
      v_ss := private.agent_fee_num(v_item ->> 'splitSeller', 'Seller amount');
      if v_sb is null or v_ss is null or v_sb <= 0 or v_ss <= 0 or round(v_sb + v_ss, 2) <> v_sync.amount then
        raise exception 'Split needs a dollar amount from the buyer and from the seller, and the two amounts must add up to the commission amount.' using errcode = 'P0001';
      end if;
    elsif v_payer not in ('buyer', 'seller') then
      raise exception 'Paid by must be Buyer, Seller, or Split.' using errcode = 'P0001';
    end if;
    v_want := v_want || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind', 'commission', 'slot', 0, 'basis', v_item ->> 'basis',
      'percent', v_sync.pct, 'amount', v_sync.amount, 'payer', v_payer, 'base', v_base,
      'additional', case when v_add = 0 then null else v_add end, 'splitBuyer', v_sb, 'splitSeller', v_ss)));
  end if;
  if jsonb_typeof(p_fees -> 'admin') = 'object' then
    v_item := p_fees -> 'admin';
    v_amount := private.agent_fee_num(v_item ->> 'amount', 'Admin fee');
    if v_amount is null or v_amount < 0 or v_amount > 1000000 then raise exception 'Admin fee must be a dollar amount of 0 or more.' using errcode = 'P0001'; end if;
    v_payer := coalesce(nullif(v_item ->> 'payer', ''), private.agent_fee_default_payer(p_side));
    v_want := v_want || jsonb_build_array(jsonb_build_object('kind', 'admin', 'slot', 0, 'amount', round(v_amount, 2), 'payer', v_payer));
  end if;
  if p_fees ? 'other' and jsonb_typeof(p_fees -> 'other') = 'array' then
    if jsonb_array_length(p_fees -> 'other') > 5 then raise exception 'Up to 5 other fees per agent.' using errcode = 'P0001'; end if;
    for v_other in select * from jsonb_array_elements(p_fees -> 'other') loop
      v_i := v_i + 1;
      v_desc := nullif(btrim(coalesce(v_other ->> 'description', '')), '');
      v_paid := nullif(btrim(coalesce(v_other ->> 'paidTo', '')), '');
      v_amount := private.agent_fee_num(v_other ->> 'amount', 'Other fee ' || v_i || ' amount');
      if v_desc is null then raise exception 'Other fee %: enter a description.', v_i using errcode = 'P0001'; end if;
      if v_paid is null then raise exception 'Other fee %: enter who it is paid to.', v_i using errcode = 'P0001'; end if;
      if length(v_desc) > 120 or length(v_paid) > 120 then raise exception 'Other fee %: keep the description and paid to under 120 characters.', v_i using errcode = 'P0001'; end if;
      if v_amount is null or v_amount < 0 or v_amount > 1000000 then raise exception 'Other fee %: the amount must be a dollar amount of 0 or more.', v_i using errcode = 'P0001'; end if;
      v_want := v_want || jsonb_build_array(jsonb_build_object('kind', 'other', 'slot', v_i, 'amount', round(v_amount, 2), 'description', v_desc,
        'paidTo', v_paid, 'payer', coalesce(nullif(v_other ->> 'payer', ''), private.agent_fee_default_payer(p_side))));
    end loop;
  end if;
  for v_item in select * from jsonb_array_elements(v_want) loop
    if (v_item ->> 'kind') = 'commission' then
      if (v_item ->> 'payer') not in ('buyer', 'seller', 'split') then raise exception 'Paid by must be Buyer, Seller, or Split.' using errcode = 'P0001'; end if;
    elsif (v_item ->> 'payer') not in ('buyer', 'seller') then
      raise exception 'Paid by must be Buyer or Seller.' using errcode = 'P0001';
    end if;
  end loop;

  if v_actor = 'staff' then
    select exists (
      select 1 from public.deal_agent_fees f
      where f.deal_id = p_deal and f.side = p_side and f.confirmed_at is not null
        and private.agent_fee_json(f) - 'side' is distinct from (
          select w from jsonb_array_elements(v_want) w
          where w ->> 'kind' = f.kind and (w ->> 'slot')::int = f.slot)
    ) into v_need_reason;
    if v_need_reason and (v_reason is null or length(v_reason) < 3) then
      raise exception 'The agent confirmed these fees. Enter a reason for the change.' using errcode = 'P0001';
    end if;
  end if;

  for v_old in select * from public.deal_agent_fees f where f.deal_id = p_deal and f.side = p_side
      and not exists (select 1 from jsonb_array_elements(v_want) w where w ->> 'kind' = f.kind and (w ->> 'slot')::int = f.slot) loop
    delete from public.deal_agent_fees where id = v_old.id;
    insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
      values (p_deal, p_side, v_old.kind, v_old.slot, private.agent_fee_json(v_old), null, v_reason, v_actor, v_uid);
    v_changed := v_changed + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(v_want) loop
    select * into v_old from public.deal_agent_fees f where f.deal_id = p_deal and f.side = p_side and f.kind = v_item ->> 'kind' and f.slot = (v_item ->> 'slot')::int;
    v_oldj := private.agent_fee_json(v_old);
    v_new := v_item || jsonb_build_object('side', p_side);
    v_fresh := v_confirm and (v_old.confirmed_at is null or v_old.source is distinct from v_actor or v_old.confirmed_by is distinct from v_uid);
    if v_oldj is not null and v_oldj = jsonb_strip_nulls(v_new) and not v_fresh then
      continue;
    end if;
    insert into public.deal_agent_fees as f (deal_id, side, kind, slot, basis, pct, amount, payer, description, paid_to,
        base_amount, additional_amount, split_buyer, split_seller, source,
        confirmed_by, confirmed_role, confirmed_at, updated_by, updated_at)
      values (p_deal, p_side, v_item ->> 'kind', (v_item ->> 'slot')::int, v_item ->> 'basis', (v_item ->> 'percent')::numeric,
        (v_item ->> 'amount')::numeric, v_item ->> 'payer', v_item ->> 'description', v_item ->> 'paidTo',
        (v_item ->> 'base')::numeric, coalesce((v_item ->> 'additional')::numeric, 0),
        (v_item ->> 'splitBuyer')::numeric, (v_item ->> 'splitSeller')::numeric, v_actor,
        case when v_confirm then v_uid end, case when v_confirm then v_actor end, case when v_confirm then now() end, v_uid, now())
      on conflict (deal_id, side, kind, slot) do update set
        basis = excluded.basis, pct = excluded.pct, amount = excluded.amount, payer = excluded.payer, description = excluded.description,
        paid_to = excluded.paid_to, base_amount = excluded.base_amount, additional_amount = excluded.additional_amount,
        split_buyer = excluded.split_buyer, split_seller = excluded.split_seller,
        source = excluded.source, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        confirmed_by = case when v_confirm then excluded.confirmed_by else f.confirmed_by end,
        confirmed_role = case when v_confirm then excluded.confirmed_role else f.confirmed_role end,
        confirmed_at = case when v_confirm then excluded.confirmed_at else f.confirmed_at end;
    insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
      values (p_deal, p_side, v_item ->> 'kind', (v_item ->> 'slot')::int, v_oldj, jsonb_strip_nulls(v_new),
              case when v_oldj is not distinct from jsonb_strip_nulls(v_new) then coalesce(v_reason, 'Confirmed') else v_reason end, v_actor, v_uid);
    v_changed := v_changed + 1;
  end loop;

  if v_changed > 0 then perform private.agent_fee_notify(p_deal, p_side, v_actor, v_reason); end if;
  return query select to_jsonb(x) from public.agent_fees(p_deal) x where x.side = p_side;
end $fn$;

commit;
