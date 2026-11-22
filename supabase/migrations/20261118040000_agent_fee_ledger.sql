-- AF-5 Agent fees post to Accounting automatically (John, Nov 12 2026; spec docs/specs/agent-fees-flow.md requirement 4).
-- Every agent fee (commission, admin fee, each other fee, per side) keeps one line on the file's fee ledger (public.accounting_fees),
-- the same way payoffs do: ALTA section "Commission", CD section H ("Other"), paid by the fee's payer, payee = the agent's company
-- (or the other fee's "paid to"), preset_key 'agent_fee:<side>:<kind>:<slot>'. A line is added, kept in step, or retired (never deleted)
-- whenever the fee is saved, removed, or worked out again after a sales price change.
-- A line a processor changed by hand on the Accounting tab is left alone (its description, payee, amount or payer no longer match what
-- was last posted), so automatic posting never overwrites a manual change. deal_agent_fee_ledger remembers what was last posted.
-- Nothing here changes who can read or edit Accounting.
begin;
set local lock_timeout = '3s';

create table if not exists public.deal_agent_fee_ledger (
  deal_id uuid not null references public.deals(id) on delete cascade,
  preset_key text not null,
  fee_id uuid not null references public.accounting_fees(id),
  posted jsonb not null,
  posted_at timestamptz not null default now(),
  primary key (deal_id, preset_key)
);
alter table public.deal_agent_fee_ledger enable row level security;
revoke all on public.deal_agent_fee_ledger from public, anon, authenticated;

-- what a ledger line looks like now, in the same shape as deal_agent_fee_ledger.posted
create or replace function private.agent_fee_ledger_shape(f public.accounting_fees) returns jsonb
language sql stable set search_path to pg_catalog, public as $$
  select jsonb_build_object('description', f.description, 'payee', f.payee, 'amount', f.amount, 'paidBy', f.paid_by,
    'split', jsonb_build_object('buyer', f.split_buyer, 'seller', f.split_seller, 'lender', f.split_lender, 'other', f.split_other),
    'altaSection', f.alta_section, 'cdSection', f.cd_section) $$;

create or replace function private.agent_fee_ledger_sync() returns trigger
language plpgsql security definer set search_path to pg_catalog, public, extensions as $$
declare
  r public.deal_agent_fees := case when tg_op = 'DELETE' then old else new end;
  v_key text := 'agent_fee:' || r.side || ':' || r.kind || ':' || r.slot;
  v_link public.deal_agent_fee_ledger; v_line public.accounting_fees; v_want jsonb; v_company text; v_side text; v_payer text;
  v_desc text; v_payee text; v_live boolean := tg_op <> 'DELETE' and r.amount > 0;
begin
  select * into v_link from public.deal_agent_fee_ledger where deal_id = r.deal_id and preset_key = v_key;
  if v_link.fee_id is not null then select * into v_line from public.accounting_fees where id = v_link.fee_id; end if;
  -- a processor changed this line by hand: leave it alone
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
      values (r.deal_id, 'charge', v_desc, 'commission', 'H', '', v_payee, r.amount, v_payer,
        case when v_payer = 'buyer' then r.amount else 0 end, case when v_payer = 'seller' then r.amount else 0 end, 0, 0, 'at',
        'From Agent fees on the file overview. Change it there; a change made here stops the automatic updates for this line.', v_key)
      returning * into v_line;
  else
    update public.accounting_fees set retired_at = null, description = v_desc, payee = v_payee, amount = r.amount, paid_by = v_payer,
        split_buyer = case when v_payer = 'buyer' then r.amount else 0 end, split_seller = case when v_payer = 'seller' then r.amount else 0 end,
        split_lender = 0, split_other = 0, alta_section = 'commission', cd_section = 'H'
      where id = v_line.id returning * into v_line;
  end if;
  insert into public.deal_agent_fee_ledger (deal_id, preset_key, fee_id, posted, posted_at)
    values (r.deal_id, v_key, v_line.id, private.agent_fee_ledger_shape(v_line), now())
    on conflict (deal_id, preset_key) do update set fee_id = excluded.fee_id, posted = excluded.posted, posted_at = excluded.posted_at;
  return null;
end $$;

drop trigger if exists zz_agent_fee_ledger on public.deal_agent_fees;
create trigger zz_agent_fee_ledger after insert or update or delete on public.deal_agent_fees
  for each row execute function private.agent_fee_ledger_sync();

comment on table public.deal_agent_fee_ledger is 'AF-5: the fee ledger line each agent fee posts to, and what was last posted (a hand-changed line is left alone).';
revoke all on function private.agent_fee_ledger_shape(public.accounting_fees), private.agent_fee_ledger_sync() from public, anon, authenticated;

commit;
