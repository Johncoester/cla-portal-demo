-- Source: TEST schema_migrations (project aqcervntopidtcazcmlv).
-- Version 20261105223111, name payoffs_hoa_ffb_gr.
-- Exported November 15, 2026 (America/New_York).
-- =====================================================================
-- Migration 42 (John, Nov 4 2026: "yes build it", "mimic Qualia exactly for now"; Francis Santos's Qualia payoff / HOA / FFB / ground rent video).
-- feature/payoffs-hoa-ffb-gr. Re-runnable. Turns NOTHING on: everything is behind the 'accounting' switch (migration 34, off by default) and is
-- CLA STAFF ONLY (private.acct_reader / acct_editor: Processor / Admin / Super admin edit; Sales Person, Sales Team, TC read). Agents and
-- clients never read payoffs, the Other Contacts list, the order info or the payoff notes. FAKE DATA ONLY. Nothing is ever deleted (retire =
-- soft delete); every change is logged in deal_payoff_log by trigger. Nothing here sends anything.
--  * other_companies           global company contacts: HOA, HOA Management Co., Utility Co., Ground Rent Leaseholder, Payoff Lender, Other Company
--  * deal_other_contacts       which companies are on which order (Contacts › Other Contacts)
--  * deal_payoffs              Mortgage Payoffs, at most 4 open per order (First..Fourth Payoff). Lender, loan #, recording info, line items,
--                              Interest Calculated to/through, Calculate Additional Interest, good-through date. NO wire instructions / bank
--                              details / SSN: the JSON columns take only whitelisted keys.
--  * deal_payoff_info          order info: property type, ground rent yes/no + contract page, SDAT flags, redemption
--  * deal_payoff_notes         PAYOFF TEAM / HOA / FFB / GROUND RENT / ORDER INFO notes (markdown); never deleted, edits logged
--  * deal_payoff_log           the history (trigger-written, read only)
--  * accounting_fees.charge_meta  accepts two more keys: paidTo (text) and group ('hoaGr') for the H "HOA / Condo / Ground Rent / Payoffs" lines
--  * folders                   a DEAL folder may now be staff only ("300 Payoffs and Invoices"); folder_visible() already hides those from outsiders
-- NOTE: migration 40 (re)defines acct_meta_ok without paidTo / group; apply 42 after any re-run of 40 (the normal in-order run does that).
-- =====================================================================

-- ---------- charge_meta: + paidTo, group ----------
create or replace function private.acct_meta_ok(m jsonb) returns boolean language plpgsql immutable set search_path = public as $$
declare p jsonb; k text;
begin
  if m is null then return true; end if;
  if jsonb_typeof(m) <> 'object' or pg_column_size(m) > 8000 then return false; end if;
  for k in select jsonb_object_keys(m) loop if k not in ('payments', 'loanPct', 'months', 'perDiem', 'perMonth', 'recType', 'paidTo', 'group') then return false; end if; end loop;
  if m ? 'paidTo' and not (jsonb_typeof(m -> 'paidTo') = 'string' and char_length(m ->> 'paidTo') <= 120) then return false; end if;
  if m ? 'group' and not coalesce(m ->> 'group' in ('hoaGr'), false) then return false; end if;
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

-- ---------- staff-only DEAL folders ("300 Payoffs and Invoices"): drop the old "library only" rule on staff_only ----------
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.folders'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'staff_only' and pg_get_constraintdef(oid) ~ 'library' loop
    execute format('alter table public.folders drop constraint %I', c); end loop; end $$;

-- ---------- helpers ----------
create or replace function private.payoff_staff() returns boolean language sql stable security definer set search_path = public as $$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'), false) $$;
create or replace function private.payoff_staff_editor() returns boolean language sql stable security definer set search_path = public as $$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() = 'Processor', false) $$;
-- a JSON object with ONLY these keys, every value a string / number / boolean / null of bounded size. Any bank / wire / SSN key is refused by the whitelist.
create or replace function private.payoff_obj_ok(o jsonb, keys text[], max_len int default 200) returns boolean language plpgsql immutable set search_path = public as $$
declare k text;
begin
  if o is null then return true; end if;
  if jsonb_typeof(o) <> 'object' or pg_column_size(o) > 4000 then return false; end if;
  for k in select jsonb_object_keys(o) loop
    if not (k = any (keys)) then return false; end if;
    if jsonb_typeof(o -> k) not in ('string', 'number', 'boolean', 'null') then return false; end if;
    if jsonb_typeof(o -> k) = 'string' and char_length(o ->> k) > max_len then return false; end if;
  end loop;
  return true;
end $$;
create or replace function private.payoff_items_ok(a jsonb) returns boolean language plpgsql immutable set search_path = public as $$
declare it jsonb;
begin
  if a is null then return true; end if;
  if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 12 then return false; end if;
  for it in select jsonb_array_elements(a) loop
    if not private.payoff_obj_ok(it, array['label', 'amount'], 80) then return false; end if;
    if it ? 'amount' and jsonb_typeof(it -> 'amount') <> 'null' and not (jsonb_typeof(it -> 'amount') = 'number' and abs((it ->> 'amount')::numeric) <= 100000000) then return false; end if;
  end loop;
  return true;
end $$;

-- ---------- tables ----------
create table if not exists public.other_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null, company_type text not null, phone text not null default '', fax text not null default '', address text not null default '',
  management_company_id uuid references public.other_companies (id),
  created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id),
  constraint other_companies_rules check (char_length(btrim(name)) between 1 and 120 and company_type in ('hoa', 'hoaMgmt', 'utility', 'grLeaseholder', 'payoffLender', 'otherCompany')
    and char_length(phone) <= 40 and char_length(fax) <= 40 and char_length(address) <= 200 and management_company_id is distinct from id));
create unique index if not exists other_companies_name_uq on public.other_companies (company_type, lower(name));

create table if not exists public.deal_other_contacts (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), company_id uuid not null references public.other_companies (id),
  contact_type text not null check (contact_type in ('hoa', 'hoaMgmt', 'utility', 'grLeaseholder', 'payoffLender', 'otherCompany')),
  retired_at timestamptz, retired_by uuid references public.profiles (id), created_at timestamptz not null default now(), created_by uuid references public.profiles (id));
create unique index if not exists deal_other_contacts_open_uq on public.deal_other_contacts (deal_id, company_id, contact_type) where retired_at is null;

create table if not exists public.deal_payoffs (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id),
  position int not null check (position between 1 and 4),
  lender jsonb not null, loan_number text not null default '' check (char_length(loan_number) <= 40),
  lien_holder text not null default '' check (char_length(lien_holder) <= 120), trustee text not null default '' check (char_length(trustee) <= 120), is_mortgage boolean,
  recording jsonb not null default '{}'::jsonb,
  principal numeric(12,2) check (principal >= 0), interest numeric(12,2) check (interest >= 0), additional_interest numeric(12,2) check (additional_interest >= 0), escrow numeric(12,2) check (escrow >= 0),
  prepay_penalty numeric(12,2) check (prepay_penalty >= 0), release_charge numeric(12,2) check (release_charge >= 0), late_charge numeric(12,2) check (late_charge >= 0),
  interest_to date, interest_mode text not null default 'to' check (interest_mode in ('to', 'through')),
  calc jsonb not null default '{"daysPerYear":"365"}'::jsonb, items jsonb not null default '[]'::jsonb, good_through date, note text not null default '' check (char_length(note) <= 500),
  fee_id uuid references public.accounting_fees (id),
  retired_at timestamptz, retired_by uuid references public.profiles (id),
  created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id),
  constraint deal_payoffs_json check (
    private.payoff_obj_ok(lender, array['name', 'phone', 'address', 'otherContactId']) and coalesce(jsonb_typeof(lender -> 'name') = 'string' and char_length(btrim(lender ->> 'name')) between 1 and 120, false)
    and private.payoff_obj_ok(recording, array['originalMortgagee', 'originalTrustee', 'originalAmount', 'dotDate', 'dateRecorded', 'instrument', 'book', 'page', 'certOfTitle', 'docNo'], 60)
    and private.payoff_obj_ok(calc, array['daysPerYear', 'from', 'to', 'rate', 'perDiem'], 20) and coalesce(calc ->> 'daysPerYear', '365') in ('360', '365', '366')
    and private.payoff_items_ok(items)));
create unique index if not exists deal_payoffs_open_uq on public.deal_payoffs (deal_id, position) where retired_at is null;

create table if not exists public.deal_payoff_info (
  deal_id uuid primary key references public.deals (id), data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id),
  constraint deal_payoff_info_json check (private.payoff_obj_ok(data, array['propertyType', 'groundRent', 'grContractPage', 'sdatGrRegistration', 'sdatGrRedemption', 'redemption', 'redemptionNote', 'hoa', 'condo', 'ffb', 'needPayoff', 'deedsOfTrust'], 500)
    and coalesce(data ->> 'propertyType', 'feeSimple') in ('feeSimple', 'leasehold') and coalesce(data ->> 'groundRent', 'no') in ('yes', 'no', 'verify')
    and (not (data ? 'grContractPage') or (data ->> 'groundRent' = 'yes' and char_length(data ->> 'grContractPage') <= 20))
    and coalesce(data ->> 'redemption', 'none') in ('none', 'considering', 'requested', 'redeemed')));

create table if not exists public.deal_payoff_notes (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id),
  section text not null check (section in ('payoff', 'hoa', 'ffb', 'gr', 'orderInfo')), body text not null check (char_length(btrim(body)) between 1 and 4000), critical boolean not null default false,
  retired_at timestamptz, created_at timestamptz not null default now(), created_by uuid references public.profiles (id), updated_at timestamptz, updated_by uuid references public.profiles (id));

create table if not exists public.deal_payoff_log (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id), what text not null, row_id uuid not null,
  action text not null check (action in ('added', 'edited', 'retired', 'restored')), changed_by uuid references public.profiles (id), changed_at timestamptz not null default now(),
  old_row jsonb, new_row jsonb not null);
create index if not exists deal_payoff_log_deal_idx on public.deal_payoff_log (deal_id, changed_at);

-- ---------- guards: who / when, no moves between orders, no deletes; bank-like text never in a note ----------
create or replace function private.payoff_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  if tg_op = 'DELETE' then raise exception 'Payoff records are never deleted. Retire them instead.' using errcode = 'P0001'; end if;
  j := to_jsonb(new);
  if tg_table_name = 'deal_payoff_notes' and coalesce(j ->> 'body', '') ~ '\d{9,17}' and coalesce(j ->> 'body', '') ~* '(routing|aba|account|acct|wire)' then
    raise exception 'Notes never hold wire instructions or bank account numbers.' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if j ? 'created_by' then new := jsonb_populate_record(new, jsonb_build_object('created_by', auth.uid(), 'created_at', now())); end if;
    if j ? 'updated_by' and tg_table_name <> 'deal_payoff_notes' then new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid(), 'updated_at', now())); end if;
    if j ? 'retired_at' then new := jsonb_populate_record(new, jsonb_build_object('retired_at', null)); end if;
    return new; end if;
  if (j ? 'deal_id') and (to_jsonb(old) ->> 'deal_id') is distinct from (j ->> 'deal_id') then raise exception 'A payoff record cannot move to another order.' using errcode = 'P0001'; end if;
  if (j ? 'created_by') and ((to_jsonb(old) -> 'created_by') is distinct from (j -> 'created_by') or (to_jsonb(old) -> 'created_at') is distinct from (j -> 'created_at')) then
    raise exception 'Who created a record never changes.' using errcode = 'P0001'; end if;
  if (j ? 'retired_at') and (to_jsonb(old) ->> 'retired_at') is not null and (j ->> 'retired_at') is not null and (j - array['retired_at', 'retired_by', 'updated_at', 'updated_by']) <> (to_jsonb(old) - array['retired_at', 'retired_by', 'updated_at', 'updated_by']) then
    raise exception 'This record is retired.' using errcode = 'P0001'; end if;
  if j ? 'retired_by' and (to_jsonb(old) ->> 'retired_at') is null and (j ->> 'retired_at') is not null then new := jsonb_populate_record(new, jsonb_build_object('retired_by', auth.uid(), 'retired_at', now())); end if;
  if j ? 'updated_by' then new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid(), 'updated_at', now())); end if;
  return new;
end $$;
create or replace function private.payoff_log() returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end; v_new jsonb := to_jsonb(new); v_action text; v_id uuid; v_what text;
begin
  if v_old is not null and (v_old - array['updated_at', 'updated_by']) = (v_new - array['updated_at', 'updated_by']) then return null; end if;
  v_action := case when tg_op = 'INSERT' then 'added' when v_new ? 'retired_at' and v_old ->> 'retired_at' is null and v_new ->> 'retired_at' is not null then 'retired'
                   when v_new ? 'retired_at' and v_old ->> 'retired_at' is not null and v_new ->> 'retired_at' is null then 'restored' else 'edited' end;
  v_id := coalesce((v_new ->> 'id')::uuid, (v_new ->> 'deal_id')::uuid);
  v_what := case tg_table_name when 'deal_payoffs' then 'Payoff ' || (v_new ->> 'position') when 'deal_payoff_notes' then 'Note (' || (v_new ->> 'section') || ')'
                               when 'deal_payoff_info' then 'Order info' else 'Other contact (' || (v_new ->> 'contact_type') || ')' end;
  insert into public.deal_payoff_log (deal_id, what, row_id, action, changed_by, old_row, new_row) values ((v_new ->> 'deal_id')::uuid, v_what, v_id, v_action, auth.uid(), v_old, v_new);
  return null;
end $$;
create or replace function private.payoff_log_only() returns trigger language plpgsql as $$
begin raise exception 'The payoff history is never changed or deleted.' using errcode = 'P0001'; end $$;
create or replace function private.company_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Companies are never deleted.' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now(); end if;
  if tg_op = 'UPDATE' and (new.created_by is distinct from old.created_by or new.created_at <> old.created_at or new.company_type <> old.company_type) then
    raise exception 'Who created a company, and its type, never change.' using errcode = 'P0001'; end if;
  new.updated_by := auth.uid(); new.updated_at := now(); return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['deal_other_contacts', 'deal_payoffs', 'deal_payoff_info', 'deal_payoff_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_guard', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function private.payoff_guard()', t || '_guard', t);
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update on public.%I for each row execute function private.payoff_log()', t || '_log', t);
  end loop; end $$;
drop trigger if exists other_companies_guard on public.other_companies;
create trigger other_companies_guard before insert or update or delete on public.other_companies for each row execute function private.company_guard();
drop trigger if exists deal_payoff_log_no_change on public.deal_payoff_log;
create trigger deal_payoff_log_no_change before update or delete on public.deal_payoff_log for each row execute function private.payoff_log_only();

-- ---------- RLS: staff only, behind the switch; never delete ----------
do $$ declare t text; begin
  foreach t in array array['other_companies', 'deal_other_contacts', 'deal_payoffs', 'deal_payoff_info', 'deal_payoff_notes', 'deal_payoff_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop; end $$;
grant select, insert, update on public.other_companies, public.deal_other_contacts, public.deal_payoffs, public.deal_payoff_info, public.deal_payoff_notes to authenticated;
grant select on public.deal_payoff_log to authenticated;
drop policy if exists other_companies_read on public.other_companies;
create policy other_companies_read on public.other_companies for select to authenticated using (private.payoff_staff());
drop policy if exists other_companies_add on public.other_companies;
create policy other_companies_add on public.other_companies for insert to authenticated with check (private.payoff_staff_editor());
drop policy if exists other_companies_edit on public.other_companies;
create policy other_companies_edit on public.other_companies for update to authenticated using (private.payoff_staff_editor()) with check (private.payoff_staff_editor());
do $$ declare t text; begin
  foreach t in array array['deal_other_contacts', 'deal_payoffs', 'deal_payoff_info', 'deal_payoff_notes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.acct_reader(deal_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_add', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.acct_editor(deal_id))', t || '_add', t);
    execute format('drop policy if exists %I on public.%I', t || '_edit', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.acct_editor(deal_id)) with check (private.acct_editor(deal_id))', t || '_edit', t);
  end loop; end $$;
drop policy if exists deal_payoff_log_read on public.deal_payoff_log;
create policy deal_payoff_log_read on public.deal_payoff_log for select to authenticated using (private.acct_reader(deal_id));
