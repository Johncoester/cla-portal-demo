-- MF-051 / FF-051 / FF-075 (Francis, confirmed Nov 11 2026 and option 1 on Nov 13 2026).
-- Each agent side keeps one commission in deal_agent_fees. The commission amount is
-- commission base × percent + additional amount. The base defaults to the sales price.
-- Paid by can be Buyer, Seller, or Split (a dollar amount from each).
-- Rollback: supabase/rollbacks/20261123040000_earnest_commission_panels.sql
begin;
set local lock_timeout = '3s';

alter table public.deal_agent_fees add column if not exists base_amount numeric(12, 2);
alter table public.deal_agent_fees add column if not exists additional_amount numeric(12, 2) not null default 0;
alter table public.deal_agent_fees add column if not exists split_buyer numeric(12, 2);
alter table public.deal_agent_fees add column if not exists split_seller numeric(12, 2);

do $chk$
declare n text;
begin
  -- Postgres stores "payer in ('buyer', 'seller')" as "payer = ANY (ARRAY['buyer'::text, 'seller'::text])".
  select c.conname into n from pg_constraint c
   where c.conrelid = 'public.deal_agent_fees'::regclass and c.contype = 'c'
     and (
       pg_get_constraintdef(c.oid) ilike '%payer in (%'
       or pg_get_constraintdef(c.oid) ilike '%payer = any (array[%'
     )
   order by c.conname
   limit 1;
  if n is null then raise exception 'drift: the agent fee payer check is missing'; end if;
  execute format('alter table public.deal_agent_fees drop constraint %I', n);
end $chk$;

alter table public.deal_agent_fees drop constraint if exists deal_agent_fees_payer_check;
alter table public.deal_agent_fees add constraint deal_agent_fees_payer_check
  check (payer is null or payer in ('buyer', 'seller') or (kind = 'commission' and payer = 'split'));
alter table public.deal_agent_fees drop constraint if exists deal_agent_fees_base_check;
alter table public.deal_agent_fees add constraint deal_agent_fees_base_check
  check (base_amount is null or (base_amount > 0 and base_amount <= 100000000));
alter table public.deal_agent_fees drop constraint if exists deal_agent_fees_additional_check;
alter table public.deal_agent_fees add constraint deal_agent_fees_additional_check
  check (additional_amount >= 0 and additional_amount <= 100000000);
alter table public.deal_agent_fees drop constraint if exists deal_agent_fees_split_check;
alter table public.deal_agent_fees add constraint deal_agent_fees_split_check
  check (
    (payer = 'split' and kind = 'commission' and split_buyer > 0 and split_seller > 0 and round(split_buyer + split_seller, 2) = amount)
    or (payer is distinct from 'split' and split_buyer is null and split_seller is null)
  );

comment on column public.deal_agent_fees.base_amount is
  'Commission base. Blank means the sales price. Commission amount = base × percent + additional amount.';
comment on column public.deal_agent_fees.additional_amount is
  'Added on top of base × percent. Zero when there is none.';
comment on column public.deal_agent_fees.split_buyer is
  'When Paid by is Split, the dollar amount the buyer pays. Otherwise blank.';
comment on column public.deal_agent_fees.split_seller is
  'When Paid by is Split, the dollar amount the seller pays. Otherwise blank.';

drop function if exists private.agent_fee_sync(numeric, text, numeric, numeric);
create function private.agent_fee_sync(p_price numeric, p_basis text, p_pct numeric, p_amount numeric,
  p_base numeric default null, p_additional numeric default 0,
  out pct numeric, out amount numeric)
language plpgsql immutable set search_path to pg_catalog as $fn$
declare v_base numeric; v_add numeric; v_from numeric;
begin
  v_add := coalesce(p_additional, 0);
  if v_add < 0 then raise exception 'Additional amount must be a dollar amount of 0 or more.' using errcode = 'P0001'; end if;
  if p_base is null and (p_price is null or p_price <= 0) then
    raise exception 'Add the sales price before entering a commission, so the %% and $ stay in step.' using errcode = 'P0001'; end if;
  v_base := coalesce(p_base, p_price);
  if v_base is null or v_base <= 0 then raise exception 'Commission base must be more than 0.' using errcode = 'P0001'; end if;
  if p_basis = 'percent' then
    if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'Commission %% must be a number from 0 to 100.' using errcode = 'P0001'; end if;
    pct := round(p_pct, 8);
    amount := round(round(v_base * pct / 100, 2) + v_add, 2);
  elsif p_basis = 'amount' then
    if p_amount is null or p_amount < 0 then raise exception 'Commission $ must be a dollar amount of 0 or more.' using errcode = 'P0001'; end if;
    if p_amount < v_add then raise exception 'Commission amount must be at least the additional amount. The additional amount is added on top of the percent.' using errcode = 'P0001'; end if;
    v_from := round(p_amount - v_add, 2);
    if v_from > v_base then
      if v_add = 0 and p_base is null then raise exception 'The commission $ can''t be more than the sales price.' using errcode = 'P0001'; end if;
      raise exception 'The commission from the base can''t be more than the commission base.' using errcode = 'P0001';
    end if;
    amount := round(p_amount, 2);
    pct := round(v_from * 100 / v_base, 8);
  else
    raise exception 'Enter the commission as a %% or a $ amount.' using errcode = 'P0001';
  end if;
end $fn$;

create or replace function private.agent_fee_json(f public.deal_agent_fees) returns jsonb
language sql stable set search_path to pg_catalog, public as $fn$
  select case when f.id is null then null else jsonb_strip_nulls(jsonb_build_object(
    'side', f.side, 'kind', f.kind, 'slot', f.slot, 'basis', f.basis, 'percent', f.pct, 'amount', f.amount, 'payer', f.payer,
    'description', f.description, 'paidTo', f.paid_to,
    'base', f.base_amount,
    'additional', case when coalesce(f.additional_amount, 0) = 0 then null else f.additional_amount end,
    'splitBuyer', f.split_buyer, 'splitSeller', f.split_seller)) end $fn$;

drop function if exists public.agent_fees(uuid);
create function public.agent_fees(p_deal uuid)
returns table (side text, kind text, slot smallint, basis text, percent numeric, amount numeric, payer text, description text,
               paid_to text, source text, confirmed_role text, confirmed_by_name text, confirmed_at timestamptz, updated_at timestamptz,
               can_edit boolean, base_amount numeric, additional_amount numeric, split_buyer numeric, split_seller numeric)
language sql stable security definer set search_path to pg_catalog, public, extensions as $fn$
  select f.side, f.kind, f.slot, f.basis, round(f.pct, 4), f.amount, f.payer, f.description, f.paid_to, f.source, f.confirmed_role,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), f.confirmed_at, f.updated_at,
         a.actor in ('staff', 'agent', 'tc'), f.base_amount, f.additional_amount, f.split_buyer, f.split_seller
  from public.deal_agent_fees f
  cross join lateral (select private.agent_fee_actor(p_deal, f.side) as actor) a
  left join public.profiles p on p.id = f.confirmed_by
  where f.deal_id = p_deal and a.actor is not null
  order by f.side, case f.kind when 'commission' then 0 when 'admin' then 1 else 2 end, f.slot $fn$;

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

create or replace function private.agent_fee_price_sync() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $fn$
declare f public.deal_agent_fees; v_sync record; v_reason text; v_basis text;
begin
  if new.purchase_price is not distinct from old.purchase_price or new.purchase_price is null or new.purchase_price <= 0 then return null; end if;
  v_reason := 'Sales price changed from ' || coalesce(to_char(old.purchase_price, 'FM$999,999,999,990.00'), 'blank') || ' to ' || to_char(new.purchase_price, 'FM$999,999,999,990.00');
  -- A typed base, or a Split with its own dollar amounts, stays until someone edits the panel.
  for f in select * from public.deal_agent_fees x where x.deal_id = new.id and x.kind = 'commission' and x.base_amount is null and x.payer is distinct from 'split' loop
    v_basis := case when f.basis = 'amount' and (f.amount - coalesce(f.additional_amount, 0)) > new.purchase_price then 'percent' else f.basis end;
    select * into v_sync from private.agent_fee_sync(new.purchase_price, v_basis, f.pct, f.amount, null, coalesce(f.additional_amount, 0));
    if v_sync.pct is distinct from f.pct or v_sync.amount is distinct from f.amount or v_basis is distinct from f.basis then
      update public.deal_agent_fees set pct = v_sync.pct, amount = v_sync.amount, basis = v_basis, updated_at = now() where id = f.id;
      insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
        values (new.id, f.side, f.kind, f.slot, private.agent_fee_json(f),
                private.agent_fee_json(f) || jsonb_build_object('percent', v_sync.pct, 'amount', v_sync.amount, 'basis', v_basis), v_reason, 'system', private.effective_uid());
    end if;
  end loop;
  return null;
end $fn$;

create or replace function private.agent_fee_ledger_sync() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $fn$
declare
  r public.deal_agent_fees := case when tg_op = 'DELETE' then old else new end;
  v_key text := 'agent_fee:' || r.side || ':' || r.kind || ':' || r.slot;
  v_link public.deal_agent_fee_ledger; v_line public.accounting_fees; v_company text; v_side text; v_payer text;
  v_desc text; v_payee text; v_live boolean := tg_op <> 'DELETE' and r.amount > 0;
  v_buyer numeric; v_seller numeric;
begin
  select * into v_link from public.deal_agent_fee_ledger where deal_id = r.deal_id and preset_key = v_key;
  if v_link.fee_id is not null then select * into v_line from public.accounting_fees where id = v_link.fee_id; end if;
  if v_line.id is not null and private.agent_fee_ledger_shape(v_line) is distinct from v_link.posted then return null; end if;
  if not v_live then
    if v_line.id is not null and v_line.retired_at is null then update public.accounting_fees set retired_at = now() where id = v_line.id; end if;
    if v_line.id is not null then
      select * into v_line from public.accounting_fees where id = v_line.id;
      update public.deal_agent_fee_ledger set posted = private.agent_fee_ledger_shape(v_line), posted_at = now() where deal_id = r.deal_id and preset_key = v_key;
    end if;
    return null;
  end if;
  v_side := case r.side when 'buyer' then 'buyer''s agent' else 'listing agent' end;
  v_payer := coalesce(r.payer, private.agent_fee_default_payer(r.side));
  v_buyer := case when v_payer = 'buyer' then r.amount when v_payer = 'split' then coalesce(r.split_buyer, 0) else 0 end;
  v_seller := case when v_payer = 'seller' then r.amount when v_payer = 'split' then coalesce(r.split_seller, 0) else 0 end;
  if (select transaction_type from public.deals where id = r.deal_id) = 'Refinance' then return null; end if;
  select nullif(btrim(coalesce(c.company, '')), '') into v_company from public.deal_participants p join public.contacts c on c.id = p.contact_id
   where p.deal_id = r.deal_id and p.role = case r.side when 'buyer' then 'Buyer Agent' else 'Listing Agent' end order by p.created_at limit 1;
  v_desc := case r.kind when 'commission' then 'Real estate commission - ' || v_side || ' (' || trim(to_char(r.pct, 'FM999990.9999'), '.') || '%)'
                        when 'admin' then 'Admin fee - ' || v_side
                        else left(r.description, 170) || ' - ' || v_side end;
  v_payee := left(coalesce(case when r.kind = 'other' then r.paid_to end, v_company, initcap(v_side)), 120);
  if v_line.id is null then
    insert into public.accounting_fees (deal_id, kind, description, alta_section, cd_section, cd_line, payee, amount, paid_by,
        split_buyer, split_seller, split_lender, split_other, timing, note, preset_key)
      values (r.deal_id, 'charge', v_desc, 'commission', 'H', '', v_payee, r.amount, v_payer, v_buyer, v_seller, 0, 0, 'at',
        'From Agent fees on the file overview. Change it there; a change made here stops the automatic updates for this line.', v_key)
      returning * into v_line;
  else
    update public.accounting_fees set retired_at = null, description = v_desc, payee = v_payee, amount = r.amount, paid_by = v_payer,
        split_buyer = v_buyer, split_seller = v_seller, split_lender = 0, split_other = 0, alta_section = 'commission', cd_section = 'H'
      where id = v_line.id returning * into v_line;
  end if;
  insert into public.deal_agent_fee_ledger (deal_id, preset_key, fee_id, posted, posted_at)
    values (r.deal_id, v_key, v_line.id, private.agent_fee_ledger_shape(v_line), now())
    on conflict (deal_id, preset_key) do update set fee_id = excluded.fee_id, posted = excluded.posted, posted_at = excluded.posted_at;
  return null;
end $fn$;

revoke all on function private.agent_fee_sync(numeric, text, numeric, numeric, numeric, numeric),
  private.agent_fee_json(public.deal_agent_fees), private.agent_fee_price_sync(), private.agent_fee_ledger_sync() from public, anon, authenticated;
revoke all on function public.agent_fees(uuid), public.save_agent_fees(uuid, text, jsonb, text) from public, anon;
grant execute on function public.agent_fees(uuid), public.save_agent_fees(uuid, text, jsonb, text) to authenticated;

commit;
