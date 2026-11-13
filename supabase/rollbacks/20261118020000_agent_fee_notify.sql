-- Rollback for AF-3 (20261118020000_agent_fee_notify.sql): puts back the AF-1 save_agent_fees (no notices) and drops the notice helpers.
-- Notices and queued outbox rows already written are kept.
begin;
create or replace function public.save_agent_fees(p_deal uuid, p_side text, p_fees jsonb, p_reason text default null)
returns setof jsonb
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  v_actor text; v_uid uuid := private.effective_uid(); v_price numeric; v_type text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_want jsonb := '[]'::jsonb; v_item jsonb; v_other jsonb; v_old public.deal_agent_fees; v_new jsonb; v_oldj jsonb;
  v_sync record; v_payer text; v_amount numeric; v_desc text; v_paid text; v_i int := 0; v_confirm boolean;
  v_changed int := 0; v_need_reason boolean := false; v_fresh boolean;
begin
  if p_side is null or p_side not in ('listing', 'buyer') then raise exception 'Pick the listing agent or buyer''s agent side.' using errcode = 'P0001'; end if;
  v_actor := private.agent_fee_actor(p_deal, p_side);
  if v_actor is null or v_actor = 'reader' then raise exception 'You can''t change agent fees on this file.' using errcode = '42501'; end if;
  select purchase_price, transaction_type into v_price, v_type from public.deals where id = p_deal;
  if v_type = 'Refinance' then raise exception 'A refinance has no agent fees.' using errcode = 'P0001'; end if;
  if p_fees is null or jsonb_typeof(p_fees) <> 'object' then raise exception 'Nothing to save.' using errcode = 'P0001'; end if;
  if v_reason is not null and length(v_reason) > 500 then raise exception 'Keep the reason under 500 characters.' using errcode = 'P0001'; end if;
  v_confirm := v_actor in ('agent', 'tc');

  -- what the side should hold after the save, checked
  if jsonb_typeof(p_fees -> 'commission') = 'object' then
    v_item := p_fees -> 'commission';
    select * into v_sync from private.agent_fee_sync(v_price, v_item ->> 'basis',
      private.agent_fee_num(v_item ->> 'percent', 'Commission %'), private.agent_fee_num(v_item ->> 'amount', 'Commission $'));
    v_want := v_want || jsonb_build_array(jsonb_build_object('kind', 'commission', 'slot', 0, 'basis', v_item ->> 'basis',
      'percent', v_sync.pct, 'amount', v_sync.amount, 'payer', coalesce(nullif(v_item ->> 'payer', ''), private.agent_fee_default_payer(p_side))));
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
    if (v_item ->> 'payer') not in ('buyer', 'seller') then raise exception 'Paid by must be Buyer or Seller.' using errcode = 'P0001'; end if;
  end loop;

  -- staff changing (or removing) something an agent or TC confirmed needs a reason
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

  -- remove fees left out
  for v_old in select * from public.deal_agent_fees f where f.deal_id = p_deal and f.side = p_side
      and not exists (select 1 from jsonb_array_elements(v_want) w where w ->> 'kind' = f.kind and (w ->> 'slot')::int = f.slot) loop
    delete from public.deal_agent_fees where id = v_old.id;
    insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
      values (p_deal, p_side, v_old.kind, v_old.slot, private.agent_fee_json(v_old), null, v_reason, v_actor, v_uid);
    v_changed := v_changed + 1;
  end loop;

  -- add or change the rest
  for v_item in select * from jsonb_array_elements(v_want) loop
    select * into v_old from public.deal_agent_fees f where f.deal_id = p_deal and f.side = p_side and f.kind = v_item ->> 'kind' and f.slot = (v_item ->> 'slot')::int;
    v_oldj := private.agent_fee_json(v_old);
    v_new := v_item || jsonb_build_object('side', p_side);
    -- an agent or TC saving confirms the fee, unless they already confirmed exactly this value
    v_fresh := v_confirm and (v_old.confirmed_at is null or v_old.source is distinct from v_actor or v_old.confirmed_by is distinct from v_uid);
    if v_oldj is not null and v_oldj = jsonb_strip_nulls(v_new) and not v_fresh then
      continue; -- unchanged, and nothing new to confirm
    end if;
    insert into public.deal_agent_fees as f (deal_id, side, kind, slot, basis, pct, amount, payer, description, paid_to, source,
        confirmed_by, confirmed_role, confirmed_at, updated_by, updated_at)
      values (p_deal, p_side, v_item ->> 'kind', (v_item ->> 'slot')::int, v_item ->> 'basis', (v_item ->> 'percent')::numeric,
        (v_item ->> 'amount')::numeric, v_item ->> 'payer', v_item ->> 'description', v_item ->> 'paidTo', v_actor,
        case when v_confirm then v_uid end, case when v_confirm then v_actor end, case when v_confirm then now() end, v_uid, now())
      on conflict (deal_id, side, kind, slot) do update set
        basis = excluded.basis, pct = excluded.pct, amount = excluded.amount, payer = excluded.payer, description = excluded.description,
        paid_to = excluded.paid_to, source = excluded.source, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        -- a staff change keeps the record of who confirmed (so later staff changes still need a reason); an agent or TC save re-confirms
        confirmed_by = case when v_confirm then excluded.confirmed_by else f.confirmed_by end,
        confirmed_role = case when v_confirm then excluded.confirmed_role else f.confirmed_role end,
        confirmed_at = case when v_confirm then excluded.confirmed_at else f.confirmed_at end;
    -- every change is logged; a confirmation of an unchanged value is logged too (reason "Confirmed")
    insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
      values (p_deal, p_side, v_item ->> 'kind', (v_item ->> 'slot')::int, v_oldj, jsonb_strip_nulls(v_new),
              case when v_oldj is not distinct from jsonb_strip_nulls(v_new) then coalesce(v_reason, 'Confirmed') else v_reason end, v_actor, v_uid);
    v_changed := v_changed + 1;
  end loop;

  return query select to_jsonb(x) from public.agent_fees(p_deal) x where x.side = p_side;
end $$;

drop function if exists private.agent_fee_notify(uuid, text, text, text);
drop function if exists private.agent_fee_label(text, int);
drop function if exists private.agent_fee_text(jsonb);
commit;
