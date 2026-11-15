-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105222952, name accounting_fees.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 34 (John, Nov 3): the ACCOUNTING tab. One fee ledger per order that feeds the ALTA Settlement Statement and the Closing
-- Disclosure fee view (built in the app: public/js/data/accounting.js). Re-runnable. FAKE DATA ONLY in every environment this has been run in.
--  * FEATURE SWITCH: private.features ('accounting', enabled = FALSE). Applying this migration turns NOTHING on: while it is off every policy
--    refuses (no reads, no writes, even for an Admin), so a live database shows no accounting data even if someone flips only the browser flag.
--      Turn on:   update private.features set enabled = true  where name = 'accounting';
--      Turn off:  update private.features set enabled = false where name = 'accounting';   (data is kept, just unreachable)
--  * Access (RLS): Processor / Admin / Super admin read + write fees on orders they can open; Sales Person / Sales Team READ ONLY on orders they
--    can open (private.can_access_deal); Transaction Coordinators, agents, clients and anonymous users: nothing.
--  * Fees are never deleted (no delete policy, no grant, and a trigger): retired_at marks a retired fee. A retired fee must be restored before
--    it can be edited. deal_id and created_by never change.
--  * Every insert / update writes public.accounting_fee_log (who, when, action, old row, new row, changed fields). The log is read-only.
--  * A refinance has no seller side: seller-paid amounts and credits to / from the seller are refused on a Refinance order.
-- =====================================================================
insert into private.features (name, enabled, note) values ('accounting', false, 'Accounting tab: fee ledger -> ALTA + CD (migration 34). Off by default; turn on only on the test portal.')
  on conflict (name) do nothing;

create or replace function private.acct_on() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from private.features where name = 'accounting'), false) $$;
create or replace function private.acct_reader(d uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Sales Person', 'Sales Team'), false) and private.can_access_deal(d) $$;
create or replace function private.acct_editor(d uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() = 'Processor', false) and private.can_access_deal(d) $$;

create table if not exists public.accounting_fees (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  kind text not null default 'charge',
  description text not null,
  alta_section text not null default 'misc',
  cd_section text not null default '',
  cd_line text not null default '',
  payee text not null default '',
  amount numeric(14,2) not null,
  paid_by text,
  split_buyer numeric(14,2) not null default 0, split_seller numeric(14,2) not null default 0, split_lender numeric(14,2) not null default 0, split_other numeric(14,2) not null default 0,
  timing text not null default 'at',
  poc boolean not null default false,
  title_prefix boolean not null default false,
  credit_from text, credit_to text,
  note text not null default '',
  preset_key text,
  retired_at timestamptz, retired_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id) default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) default auth.uid(), updated_at timestamptz not null default now());
alter table public.accounting_fees drop constraint if exists accounting_fees_rules;
alter table public.accounting_fees add constraint accounting_fees_rules check (
  kind in ('charge', 'credit') and char_length(btrim(description)) between 1 and 200
  and alta_section in ('financial', 'prorations', 'loanCharges', 'otherLoanCharges', 'impounds', 'title', 'commission', 'government', 'payoffs', 'misc')
  and cd_section in ('A', 'B', 'C', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N', '') and cd_line ~ '^((0[1-9])|([1-9][0-9]))?$'
  and amount > 0 and amount <= 100000000 and split_buyer >= 0 and split_seller >= 0 and split_lender >= 0 and split_other >= 0
  and char_length(payee) <= 120 and char_length(note) <= 1000 and timing in ('at', 'before') and (not poc or timing = 'before')
  and (kind <> 'charge' or (credit_from is null and credit_to is null and paid_by in ('buyer', 'seller', 'lender', 'other', 'split')
        and split_buyer + split_seller + split_lender + split_other <= amount and cd_section not in ('K', 'L', 'M')
        and (cd_section <> 'N' or split_seller > 0) and (not title_prefix or alta_section = 'title')))
  and (kind <> 'credit' or (credit_from in ('buyer', 'seller', 'lender', 'deposit', 'other') and credit_to in ('buyer', 'seller') and credit_from <> credit_to
        and cd_section in ('', 'K', 'L', 'M', 'N') and paid_by is null and split_buyer + split_seller + split_lender + split_other = 0
        and not title_prefix and not poc and timing = 'at')));
create index if not exists accounting_fees_deal_idx on public.accounting_fees (deal_id);

create table if not exists public.accounting_fee_log (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), fee_id uuid not null references public.accounting_fees (id),
  action text not null check (action in ('added', 'edited', 'retired', 'restored')), changed_by uuid references public.profiles (id), changed_at timestamptz not null default now(),
  old_row jsonb, new_row jsonb not null, changes jsonb not null default '[]'::jsonb);
create index if not exists accounting_fee_log_deal_idx on public.accounting_fee_log (deal_id, changed_at);

-- ---------- rules no CHECK can express: refinance, immutables, retired fees, no deletes ----------
create or replace function private.acct_fee_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if tg_op = 'DELETE' then raise exception 'Fees are never deleted. Retire it instead.' using errcode = 'P0001'; end if;
  select transaction_type into v_type from public.deals where id = new.deal_id;
  if v_type = 'Refinance' and (new.split_seller > 0 or new.credit_from = 'seller' or new.credit_to = 'seller') then
    raise exception 'A refinance has no seller side.' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by); new.updated_by := new.created_by; new.created_at := now(); new.updated_at := now();
    new.retired_at := null; new.retired_by := null; return new; end if;
  if new.deal_id <> old.deal_id then raise exception 'A fee cannot move to another order.' using errcode = 'P0001'; end if;
  if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then raise exception 'Who created a fee never changes.' using errcode = 'P0001'; end if;
  if old.retired_at is not null and new.retired_at is not null and (to_jsonb(new) - array['updated_at', 'updated_by', 'retired_at', 'retired_by']) <> (to_jsonb(old) - array['updated_at', 'updated_by', 'retired_at', 'retired_by']) then
    raise exception 'This fee is retired. Restore it before editing.' using errcode = 'P0001'; end if;
  if old.retired_at is null and new.retired_at is not null then new.retired_by := auth.uid(); new.retired_at := now(); end if;
  if new.retired_at is null then new.retired_by := null; end if;
  new.updated_by := auth.uid(); new.updated_at := now(); return new;
end $$;
drop trigger if exists accounting_fees_guard on public.accounting_fees;
create trigger accounting_fees_guard before insert or update or delete on public.accounting_fees for each row execute function private.acct_fee_guard();

create or replace function private.acct_fee_log() returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end; v_new jsonb := to_jsonb(new); v_changes jsonb; v_action text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('field', k, 'old', v_old -> k, 'new', v_new -> k) order by k), '[]'::jsonb) into v_changes
    from jsonb_object_keys(v_new) k where k not in ('updated_at', 'updated_by', 'created_at', 'created_by', 'retired_by', 'id', 'deal_id') and (v_old is null or v_old -> k is distinct from v_new -> k);
  v_action := case when tg_op = 'INSERT' then 'added' when old.retired_at is null and new.retired_at is not null then 'retired' when old.retired_at is not null and new.retired_at is null then 'restored' else 'edited' end;
  if tg_op = 'UPDATE' and v_changes = '[]'::jsonb then return null; end if;
  insert into public.accounting_fee_log (deal_id, fee_id, action, changed_by, old_row, new_row, changes) values (new.deal_id, new.id, v_action, auth.uid(), v_old, v_new, v_changes);
  return null;
end $$;
drop trigger if exists accounting_fees_log on public.accounting_fees;
create trigger accounting_fees_log after insert or update on public.accounting_fees for each row execute function private.acct_fee_log();

create or replace function private.acct_log_only() returns trigger language plpgsql as $$
begin raise exception 'The accounting edit history is never changed or deleted.' using errcode = 'P0001'; end $$;
drop trigger if exists accounting_fee_log_no_change on public.accounting_fee_log;
create trigger accounting_fee_log_no_change before update or delete on public.accounting_fee_log for each row execute function private.acct_log_only();

-- ---------- RLS: staff only, behind the switch ----------
alter table public.accounting_fees enable row level security;
alter table public.accounting_fee_log enable row level security;
revoke all on public.accounting_fees from public, anon, authenticated;
revoke all on public.accounting_fee_log from public, anon, authenticated;
grant select, insert, update on public.accounting_fees to authenticated;   -- never delete
grant select on public.accounting_fee_log to authenticated;                -- written only by the trigger
drop policy if exists accounting_fees_read on public.accounting_fees;
create policy accounting_fees_read on public.accounting_fees for select to authenticated using (private.acct_reader(deal_id));
drop policy if exists accounting_fees_add on public.accounting_fees;
create policy accounting_fees_add on public.accounting_fees for insert to authenticated with check (private.acct_editor(deal_id));
drop policy if exists accounting_fees_edit on public.accounting_fees;
create policy accounting_fees_edit on public.accounting_fees for update to authenticated using (private.acct_editor(deal_id)) with check (private.acct_editor(deal_id));
drop policy if exists accounting_fee_log_read on public.accounting_fee_log;
create policy accounting_fee_log_read on public.accounting_fee_log for select to authenticated using (private.acct_reader(deal_id));

-- the app asks whether the signed-in user may edit (button state only; RLS above is what enforces it)
create or replace function public.accounting_access(p_deal uuid) returns text language sql stable security definer set search_path = public as $$
  select case when not private.acct_on() then 'off' when private.acct_editor(p_deal) then 'edit' when private.acct_reader(p_deal) then 'read' else 'none' end $$;
revoke all on function public.accounting_access(uuid) from public, anon;
grant execute on function public.accounting_access(uuid) to authenticated;
