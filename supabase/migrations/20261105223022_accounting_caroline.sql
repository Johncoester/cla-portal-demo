-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105223022, name accounting_caroline.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 39 (Caroline Kim, Nov 4 2026): Accounting tab feedback. Re-runnable. Turns NOTHING on: the 'accounting' switch from migration 34
-- still gates every read and write (off by default). FAKE DATA ONLY in every environment this has been run in. No delete is added anywhere.
--  * TCs READ the Accounting tab: private.acct_reader() now includes 'Transaction Coordinator' (orders they can open). Editors are unchanged
--    (Processor / Admin / Super admin). Agents, clients and anonymous users still get nothing. (The CLA / underwriter split, migration 38
--    uw_reader, is NOT given to TCs.)
--  * accounting_fees gets:
--      reduces        an escrow AGGREGATE ADJUSTMENT: a borrower charge in CD section G / ALTA Impounds that lowers the total (shown negative)
--      lender_credit  a LENDER CREDIT: a credit lender -> borrower that the CD shows in J ("Lender Credits"), not as an L line
--      proration      a calculated PRORATION (property taxes, HOA dues ...): { item, cycle, cycleAmount, periodStart, basis, status, calc }; the
--                     app works the amount and direction out from the order's settlement date (settlement day charged to the buyer);
--                     the row's amount must equal calc.amount and the direction must match paid (buyer -> seller) / unpaid (seller -> buyer).
--  * public.accounting_cd_details: one row per order of MANUAL Closing Disclosure entries (loan terms, projected payments, Loan Estimate column,
--    loan disclosures / calculations, prepaids + escrow inputs) as a flat jsonb object; public.accounting_cd_log keeps every change (who, when,
--    old -> new per field), written by a trigger, never changed or deleted. Same RLS as the fees: readers select, editors insert / update.
-- NOTE: migration 34 (re)defines acct_reader WITHOUT the TC; apply 39 after any re-run of 34 (the normal in-order run does that).
-- =====================================================================
create or replace function private.acct_reader(d uuid) returns boolean language sql stable security definer set search_path = public as $$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'), false) and private.can_access_deal(d) $$;

alter table public.accounting_fees add column if not exists reduces boolean not null default false;
alter table public.accounting_fees add column if not exists lender_credit boolean not null default false;
alter table public.accounting_fees add column if not exists proration jsonb;
alter table public.accounting_fees drop constraint if exists accounting_fees_caroline_rules;
alter table public.accounting_fees add constraint accounting_fees_caroline_rules check (
  (not reduces or (kind = 'charge' and cd_section = 'G' and alta_section = 'impounds' and paid_by = 'buyer' and split_buyer = amount and not poc and timing = 'at'))
  and (not lender_credit or (kind = 'credit' and credit_from = 'lender' and credit_to = 'buyer' and cd_section = ''))
  and (proration is null or (kind = 'credit' and alta_section = 'prorations' and cd_section = '' and not lender_credit and jsonb_typeof(proration) = 'object'
        and coalesce(proration ->> 'cycle' in ('annual', 'semiannual', 'quarterly', 'monthly'), false)
        and coalesce(proration ->> 'basis' in ('365', '360', '366', 'installment'), false)
        and coalesce(proration ->> 'status' in ('paid', 'unpaid'), false)
        and coalesce(proration ->> 'periodStart' ~ '^\d{4}-\d{2}-\d{2}$', false)
        and case when jsonb_typeof(proration -> 'cycleAmount') = 'number' then (proration ->> 'cycleAmount')::numeric > 0 else false end
        and case when jsonb_typeof(proration -> 'calc') = 'object' and jsonb_typeof(proration -> 'calc' -> 'amount') = 'number' then (proration -> 'calc' ->> 'amount')::numeric = amount else false end
        and ((proration ->> 'status' = 'paid' and credit_from = 'buyer' and credit_to = 'seller') or (proration ->> 'status' = 'unpaid' and credit_from = 'seller' and credit_to = 'buyer'))
        and pg_column_size(proration) < 8000)));

-- ---------- Closing Disclosure details (manual entries) + their history ----------
create table if not exists public.accounting_cd_details (
  deal_id uuid primary key references public.deals (id),
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) default auth.uid(), updated_at timestamptz not null default now(),
  constraint accounting_cd_details_shape check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 20000));
create table if not exists public.accounting_cd_log (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id),
  action text not null check (action in ('added', 'edited')), changed_by uuid references public.profiles (id), changed_at timestamptz not null default now(),
  old_data jsonb, new_data jsonb not null, changes jsonb not null default '[]'::jsonb);
create index if not exists accounting_cd_log_deal_idx on public.accounting_cd_log (deal_id, changed_at);

create or replace function private.acct_cd_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'DELETE' then raise exception 'Closing Disclosure details are never deleted.' using errcode = 'P0001'; end if;
  if jsonb_typeof(new.data) <> 'object' then raise exception 'Closing Disclosure details must be a set of named fields.' using errcode = '23514'; end if;
  for k in select jsonb_object_keys(new.data) loop
    if k !~ '^[a-z]{1,8}[0-9]?\.[A-Za-z0-9]{1,30}$' then raise exception 'Unknown Closing Disclosure field: %', k using errcode = '23514'; end if;
    if jsonb_typeof(new.data -> k) not in ('string', 'number') then raise exception 'Closing Disclosure field % must be text or a number.', k using errcode = '23514'; end if;
  end loop;
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.updated_by := new.created_by; new.created_at := now(); new.updated_at := now(); return new; end if;
  if new.deal_id <> old.deal_id then raise exception 'Closing Disclosure details cannot move to another order.' using errcode = 'P0001'; end if;
  if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then raise exception 'Who created them never changes.' using errcode = 'P0001'; end if;
  new.updated_by := auth.uid(); new.updated_at := now(); return new;
end $$;
drop trigger if exists accounting_cd_details_guard on public.accounting_cd_details;
create trigger accounting_cd_details_guard before insert or update or delete on public.accounting_cd_details for each row execute function private.acct_cd_guard();

create or replace function private.acct_cd_log() returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end; v_changes jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('field', k, 'old', v_old -> k, 'new', new.data -> k) order by k), '[]'::jsonb) into v_changes
    from (select jsonb_object_keys(v_old) k union select jsonb_object_keys(new.data)) keys where (v_old -> k) is distinct from (new.data -> k);
  if tg_op = 'UPDATE' and v_changes = '[]'::jsonb then return null; end if;
  insert into public.accounting_cd_log (deal_id, action, changed_by, old_data, new_data, changes)
    values (new.deal_id, case when tg_op = 'INSERT' then 'added' else 'edited' end, auth.uid(), case when tg_op = 'UPDATE' then old.data else null end, new.data, v_changes);
  return null;
end $$;
drop trigger if exists accounting_cd_details_log on public.accounting_cd_details;
create trigger accounting_cd_details_log after insert or update on public.accounting_cd_details for each row execute function private.acct_cd_log();
drop trigger if exists accounting_cd_log_no_change on public.accounting_cd_log;
create trigger accounting_cd_log_no_change before update or delete on public.accounting_cd_log for each row execute function private.acct_log_only();

alter table public.accounting_cd_details enable row level security;
alter table public.accounting_cd_log enable row level security;
revoke all on public.accounting_cd_details from public, anon, authenticated;
revoke all on public.accounting_cd_log from public, anon, authenticated;
grant select, insert, update on public.accounting_cd_details to authenticated;   -- never delete
grant select on public.accounting_cd_log to authenticated;                         -- written only by the trigger
drop policy if exists accounting_cd_read on public.accounting_cd_details;
create policy accounting_cd_read on public.accounting_cd_details for select to authenticated using (private.acct_reader(deal_id));
drop policy if exists accounting_cd_add on public.accounting_cd_details;
create policy accounting_cd_add on public.accounting_cd_details for insert to authenticated with check (private.acct_editor(deal_id));
drop policy if exists accounting_cd_edit on public.accounting_cd_details;
create policy accounting_cd_edit on public.accounting_cd_details for update to authenticated using (private.acct_editor(deal_id)) with check (private.acct_editor(deal_id));
drop policy if exists accounting_cd_log_read on public.accounting_cd_log;
create policy accounting_cd_log_read on public.accounting_cd_log for select to authenticated using (private.acct_reader(deal_id));
