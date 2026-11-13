-- AF-1 Agent fees: fee records and change history (John, Nov 12 2026 decisions; spec docs/specs/agent-fees-flow.md).
-- For each agent side of a file (listing agent and buyer's agent):
--   * commission: % and $ always in sync from the sales price (deals.purchase_price). Whichever one was typed is the
--     "basis"; the other is worked out from the price, and both are redone when the sales price changes.
--   * admin fee: an amount and who pays it (default buyer for the buyer's agent, seller for the listing agent).
--   * up to 5 other fees: description, amount, paid to.
-- Each fee records its source (staff, agent or TC) and who confirmed it and when. deal_agent_fee_log keeps who, when,
-- old value, new value, reason and source for every change. Staff must give a reason to change a fee the agent (or TC)
-- confirmed; the agent is not asked to re-approve (Decision 3). Notices (AF-3/AF-4) and Accounting lines (AF-5) come later.
-- Every read and write goes through the functions below. Nobody reads or writes the tables directly.
begin;
set local lock_timeout = '3s';

create table if not exists public.deal_agent_fees (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  side text not null check (side in ('listing', 'buyer')),
  kind text not null check (kind in ('commission', 'admin', 'other')),
  slot smallint not null default 0,
  basis text check (basis in ('percent', 'amount')),
  pct numeric(12, 8),
  amount numeric(12, 2) not null check (amount >= 0 and amount <= 100000000),
  payer text check (payer in ('buyer', 'seller')),
  description text check (description is null or length(description) <= 120),
  paid_to text check (paid_to is null or length(paid_to) <= 120),
  source text not null check (source in ('staff', 'agent', 'tc', 'system')),
  confirmed_by uuid,
  confirmed_role text check (confirmed_role in ('agent', 'tc')),
  confirmed_at timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (deal_id, side, kind, slot),
  check ((kind = 'other' and slot between 1 and 5) or (kind <> 'other' and slot = 0)),
  check ((kind = 'commission') = (basis is not null and pct is not null)),
  check (kind <> 'commission' or (pct >= 0 and pct <= 100)),
  check (kind <> 'other' or (description is not null and paid_to is not null)),
  check ((confirmed_at is null) = (confirmed_role is null))
);

create table if not exists public.deal_agent_fee_log (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals(id) on delete cascade,
  side text not null,
  kind text not null,
  slot smallint not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  source text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists deal_agent_fee_log_deal on public.deal_agent_fee_log (deal_id, changed_at desc);

alter table public.deal_agent_fees enable row level security;
alter table public.deal_agent_fee_log enable row level security;
revoke all on public.deal_agent_fees from public, anon, authenticated;
revoke all on public.deal_agent_fee_log from public, anon, authenticated;

drop trigger if exists aaa_view_as_readonly on public.deal_agent_fees;
create trigger aaa_view_as_readonly before insert or delete or update on public.deal_agent_fees
  for each row execute function private.view_as_readonly();

-- Default payer for an admin fee or other fee: the buyer pays on the buyer's agent side, the seller on the listing side.
create or replace function private.agent_fee_default_payer(p_side text) returns text
language sql immutable set search_path to pg_catalog as $$ select case p_side when 'buyer' then 'buyer' else 'seller' end $$;

-- % and $ from the sales price. Percent basis: $ = price x % rounded to the cent. Amount basis: % is worked out to
-- 8 decimals, which gives back the same cent for any price up to $100 million.
create or replace function private.agent_fee_sync(p_price numeric, p_basis text, p_pct numeric, p_amount numeric,
  out pct numeric, out amount numeric)
language plpgsql immutable set search_path to pg_catalog as $$
begin
  if p_price is null or p_price <= 0 then
    raise exception 'Add the sales price before entering a commission, so the %% and $ stay in step.' using errcode = 'P0001';
  end if;
  if p_basis = 'percent' then
    if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'Commission %% must be a number from 0 to 100.' using errcode = 'P0001'; end if;
    pct := round(p_pct, 8); amount := round(p_price * pct / 100, 2);
  elsif p_basis = 'amount' then
    if p_amount is null or p_amount < 0 then raise exception 'Commission $ must be a dollar amount of 0 or more.' using errcode = 'P0001'; end if;
    if p_amount > p_price then raise exception 'The commission $ can''t be more than the sales price.' using errcode = 'P0001'; end if;
    amount := round(p_amount, 2); pct := round(amount * 100 / p_price, 8);
  else
    raise exception 'Enter the commission as a %% or a $ amount.' using errcode = 'P0001';
  end if;
end $$;

-- A typed number, or a plain message instead of a database error.
create or replace function private.agent_fee_num(p text, p_label text) returns numeric
language plpgsql immutable set search_path to pg_catalog as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return replace(replace(replace(btrim(p), ',', ''), '$', ''), '%', '')::numeric;
exception when others then
  raise exception '% must be a number.', p_label using errcode = 'P0001';
end $$;

-- Which side(s) the caller may see and change, and as whom. Staff who run the file: both sides as 'staff'.
-- An agent on the file: their own side as 'agent'. A TC: the side of an agent they coordinate for (their team), or both
-- sides when they are the file's TC (deals.tc_user_id), as 'tc'. Other staff on the file (sales) may read both sides.
create or replace function private.agent_fee_actor(d uuid, p_side text) returns text
language plpgsql stable security definer set search_path to pg_catalog, public, extensions as $$
declare v_uid uuid := private.effective_uid(); v_roles text[];
begin
  if v_uid is null or not private.can_access_deal(d) then return null; end if;
  if private.can_run_deal(d) then return 'staff'; end if;
  v_roles := private.file_roles_of(v_uid, d);
  if (p_side = 'buyer' and 'Buyer Agent' = any (v_roles)) or (p_side = 'listing' and 'Listing Agent' = any (v_roles)) then return 'agent'; end if;
  if private.me_role() = 'Transaction Coordinator' and (
       exists (select 1 from public.deals x where x.id = d and x.tc_user_id = v_uid)
       or exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id
                    join public.team_members ag on ag.profile_id = c.profile_id and ag.member_role = 'agent'
                    join public.team_members co on co.team_id = ag.team_id and co.member_role = 'coordinator' and co.profile_id = v_uid
                   where p.deal_id = d and p.role = case p_side when 'buyer' then 'Buyer Agent' else 'Listing Agent' end)) then
    return 'tc';
  end if;
  if private.is_staffish() and private.me_role() <> 'Transaction Coordinator' then return 'reader'; end if;
  return null;
end $$;

create or replace function private.agent_fee_json(f public.deal_agent_fees) returns jsonb
language sql stable set search_path to pg_catalog, public as $$
  select case when f.id is null then null else jsonb_strip_nulls(jsonb_build_object(
    'side', f.side, 'kind', f.kind, 'slot', f.slot, 'basis', f.basis, 'percent', f.pct, 'amount', f.amount, 'payer', f.payer,
    'description', f.description, 'paidTo', f.paid_to)) end $$;

-- Read one file's agent fees: rows the caller may see (staff: both sides; an agent or TC: their side). Buyers and sellers get nothing.
create or replace function public.agent_fees(p_deal uuid)
returns table (side text, kind text, slot smallint, basis text, percent numeric, amount numeric, payer text, description text,
               paid_to text, source text, confirmed_role text, confirmed_by_name text, confirmed_at timestamptz, updated_at timestamptz,
               can_edit boolean)
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select f.side, f.kind, f.slot, f.basis, round(f.pct, 4), f.amount, f.payer, f.description, f.paid_to, f.source, f.confirmed_role,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), f.confirmed_at, f.updated_at,
         a.actor in ('staff', 'agent', 'tc')
  from public.deal_agent_fees f
  cross join lateral (select private.agent_fee_actor(p_deal, f.side) as actor) a
  left join public.profiles p on p.id = f.confirmed_by
  where f.deal_id = p_deal and a.actor is not null
  order by f.side, case f.kind when 'commission' then 0 when 'admin' then 1 else 2 end, f.slot $$;

-- Change history for the sides the caller may see.
create or replace function public.agent_fee_history(p_deal uuid)
returns table (side text, kind text, slot smallint, old_value jsonb, new_value jsonb, reason text, source text,
               changed_by_name text, changed_at timestamptz)
language sql stable security definer set search_path to pg_catalog, public, extensions as $$
  select l.side, l.kind, l.slot, l.old_value, l.new_value, l.reason, l.source,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), l.changed_at
  from public.deal_agent_fee_log l left join public.profiles p on p.id = l.changed_by
  where l.deal_id = p_deal and private.agent_fee_actor(p_deal, l.side) is not null
  order by l.changed_at desc, l.id desc
  limit 500 $$;

-- Save one side's fees. p_fees: {"commission": {"basis": "percent"|"amount", "percent": n, "amount": n} | null,
--   "admin": {"amount": n, "payer": "buyer"|"seller"} | null, "other": [{"description", "amount", "paidTo"}] (0-5)}.
-- The whole side is replaced: a fee left out is removed. An agent or TC saving confirms every fee on the side.
-- Staff changing a fee that an agent or TC confirmed must give a reason (at least 3 characters).
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

-- When the sales price changes, redo each commission from its basis so % and $ never differ.
create or replace function private.agent_fee_price_sync() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare f public.deal_agent_fees; v_sync record; v_reason text;
begin
  if new.purchase_price is not distinct from old.purchase_price or new.purchase_price is null or new.purchase_price <= 0 then return null; end if;
  v_reason := 'Sales price changed from ' || coalesce(to_char(old.purchase_price, 'FM$999,999,999,990.00'), 'blank') || ' to ' || to_char(new.purchase_price, 'FM$999,999,999,990.00');
  for f in select * from public.deal_agent_fees x where x.deal_id = new.id and x.kind = 'commission' loop
    -- a fixed $ commission larger than the new price can't stay fixed: keep the % instead
    select * into v_sync from private.agent_fee_sync(new.purchase_price,
      case when f.basis = 'amount' and f.amount > new.purchase_price then 'percent' else f.basis end, f.pct, f.amount);
    if v_sync.pct is distinct from f.pct or v_sync.amount is distinct from f.amount then
      update public.deal_agent_fees set pct = v_sync.pct, amount = v_sync.amount, updated_at = now(),
        basis = case when f.basis = 'amount' and f.amount > new.purchase_price then 'percent' else f.basis end where id = f.id;
      insert into public.deal_agent_fee_log (deal_id, side, kind, slot, old_value, new_value, reason, source, changed_by)
        values (new.id, f.side, f.kind, f.slot, private.agent_fee_json(f),
                private.agent_fee_json(f) || jsonb_build_object('percent', v_sync.pct, 'amount', v_sync.amount), v_reason, 'system', private.effective_uid());
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists deals_agent_fee_price on public.deals;
create trigger deals_agent_fee_price after update of purchase_price on public.deals
  for each row execute function private.agent_fee_price_sync();

comment on table public.deal_agent_fees is 'AF-1: agent fees per file side (commission, admin fee, up to 5 other fees). Read and write only through agent_fees / save_agent_fees.';
comment on table public.deal_agent_fee_log is 'AF-1: every agent fee change: who, when, old, new, reason, source (staff, agent, tc, system).';

revoke all on function private.agent_fee_default_payer(text), private.agent_fee_num(text, text), private.agent_fee_sync(numeric, text, numeric, numeric),
  private.agent_fee_actor(uuid, text), private.agent_fee_json(public.deal_agent_fees), private.agent_fee_price_sync() from public, anon, authenticated;
revoke all on function public.agent_fees(uuid), public.agent_fee_history(uuid), public.save_agent_fees(uuid, text, jsonb, text) from public, anon;
grant execute on function public.agent_fees(uuid), public.agent_fee_history(uuid), public.save_agent_fees(uuid, text, jsonb, text) to authenticated;

commit;
