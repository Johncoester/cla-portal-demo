-- FF-030 / JN-42 phase 1. CRM Companies (public.crm_accounts) is the one company list.
-- Not applied to hosted TEST (aqcervntopidtcazcmlv). One transaction. lock_timeout 3s.
--
-- Adds:
--   public.company_lookup(text, integer)          active companies for a typeahead
--   public.company_find_or_create(text, text, text)  existing active id, or a new row
--   public.company_match_active(text)             exact key, one active id, or null
--   crm_accounts_company_key_active_idx           prefix index on the normalized name
--   crm_accounts_name_sync                        copies a renamed company onto linked contacts
--
-- No change to crm_accounts policies. No new private helper used by a policy.
-- No change to deals, tasks, or profiles policies. No pg_trgm.
-- private.crm_company_key, is_processor, is_preprocessor, crm_user, crm_editor,
-- and effective_uid are used as they already exist. Their bodies are not replaced.
--
-- The CRM user answered: everyone gets every company record. v_owner_private
-- defaults to false. The true path stays in the function so it can be turned
-- back on without a new migration. false (the default) shows every active name
-- to every caller who passed the role check, with no owner predicate.
-- true uses the owner rule the CRM list uses:
--   (select private.crm_all())
--   or the row's owner is the caller
--   or the caller is Sales Team and the owner is blank or a salesperson.
-- Those three checks are hoisted with (select ...). The profiles lookup runs
-- only for a Sales Team caller, once per candidate row, and it is not a
-- private.* helper. The default path does not call a per-row private.* helper.
-- The other half of today's account rule (a company you can see because you
-- can see one of its clients) is not in the switch. That half is a per-contact
-- private helper. Do not add it as a per-row call.
-- State on a new company is only the p_state argument. These functions never
-- read a deal or copy the property's state.
--
-- crm_accounts_name_uq is a partial unique index, not a constraint:
--   unique on lower(btrim(name)) WHERE (archived_at IS NULL).
-- An archived row is outside that index, so it does not block a new active
-- row with the same trimmed name. company_find_or_create does not use
-- ON CONFLICT. A partial index is inferred only when ON CONFLICT repeats the
-- expression and that WHERE predicate.
--
-- Company kinds. The CRM list was brokerage, lender, other. Payoff lender, HOA,
-- and utility are the same list, not a second table. This file adds only those
-- three codes (payoff_lender, hoa, utility) to an existing allowed-value check
-- on crm_accounts.kind, and to crm_picklist_options accountKind when that table
-- exists. It does not create a check if kind was unrestricted, and it does not
-- touch other_companies. The previous check text is saved on the constraint
-- comment (ff030-kind-prev:) so the rollback can put that exact check back.
--
-- Contains search (key like '%' || q || '%') is not in the function. A leading
-- wildcard cannot use the new index. On a local scratch database of 110,000
-- active companies that scan was 1305 ms (sequential scan, 1,698 buffer hits).
-- The same prefix, ordered with ~<~ so the new index can stop at the limit,
-- was 0.18 ms for one match and 0.66 ms to return 20 rows from 11,111 matches.
-- company_lookup itself was 2.9 ms and 1.3 ms for those two calls. Do not add
-- the contains scan to the typeahead.
--
-- The index is a plain CREATE INDEX so TEST can apply this file inside the
-- transaction. Production should create the same index CONCURRENTLY, outside a
-- transaction, and only then run the rest. CREATE INDEX CONCURRENTLY cannot
-- run inside this BEGIN.
--
-- Follow-up, not done here: private.rpc_crm_account_list counts contacts, orders,
-- and volume per account with per-row helpers. More linked contacts will make
-- that list slower. It needs a set-based rewrite.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $pre$
declare
  id_type text;
  id_default text;
  state_null text;
  v_volatile "char";
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'drift: role authenticated is missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'drift: role anon is missing';
  end if;
  if to_regclass('public.crm_accounts') is null then
    raise exception 'drift: public.crm_accounts is missing';
  end if;
  if to_regclass('public.contacts') is null then
    raise exception 'drift: public.contacts is missing';
  end if;
  if to_regclass('public.contacts_account_idx') is null then
    raise exception 'drift: contacts_account_idx is missing';
  end if;
  if to_regprocedure('private.crm_company_key(text)') is null then
    raise exception 'drift: private.crm_company_key(text) is missing';
  end if;
  if to_regprocedure('private.is_processor()') is null
     or to_regprocedure('private.is_preprocessor()') is null
     or to_regprocedure('private.crm_user()') is null
     or to_regprocedure('private.crm_editor()') is null
     or to_regprocedure('private.crm_all()') is null
     or to_regprocedure('private.me_role()') is null
     or to_regprocedure('private.effective_uid()') is null then
    raise exception 'drift: a company_lookup role helper is missing';
  end if;
  select provolatile into v_volatile from pg_proc where oid = 'private.crm_company_key(text)'::regprocedure;
  if v_volatile is distinct from 'i' then
    raise exception 'drift: private.crm_company_key(text) must be immutable for the prefix index (provolatile %)', v_volatile;
  end if;
  if to_regprocedure('public.company_lookup(text, integer)') is not null
     or to_regprocedure('public.company_find_or_create(text, text, text)') is not null
     or to_regprocedure('public.company_match_active(text)') is not null
     or to_regprocedure('public.crm_account_name_sync()') is not null then
    raise exception 'drift: company lookup functions already exist';
  end if;
  if to_regclass('public.crm_accounts_company_key_active_idx') is not null then
    raise exception 'drift: crm_accounts_company_key_active_idx already exists';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'crm_accounts_name_sync' and tgrelid = 'public.crm_accounts'::regclass and not tgisinternal) then
    raise exception 'drift: trigger crm_accounts_name_sync already exists';
  end if;
  if to_regclass('public.crm_accounts_name_uq') is null then
    raise exception 'drift: unique index crm_accounts_name_uq is missing';
  end if;
  -- pg_get_indexdef / pg_indexes.indexdef for the partial index on TEST.
  if (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'crm_accounts_name_uq')
     is distinct from 'CREATE UNIQUE INDEX crm_accounts_name_uq ON public.crm_accounts USING btree (lower(btrim(name))) WHERE (archived_at IS NULL)' then
    raise exception 'drift: crm_accounts_name_uq is %',
      (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'crm_accounts_name_uq');
  end if;

  select data_type, column_default into id_type, id_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_accounts' and column_name = 'id';
  if id_type is distinct from 'uuid' or id_default is null then
    raise exception 'drift: crm_accounts.id must be a uuid with a default';
  end if;
  select is_nullable into state_null
  from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_accounts' and column_name = 'state';
  if state_null is distinct from 'NO' then
    raise exception 'drift: crm_accounts.state must be not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_accounts' and column_name = 'owner_id' and is_nullable = 'NO'
  ) then
    raise exception 'drift: crm_accounts.owner_id is not null, so company_find_or_create cannot insert owner_id null';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_accounts' and column_name = 'archived_at'
      and data_type = 'timestamp with time zone'
  ) then
    raise exception 'drift: crm_accounts.archived_at timestamptz is missing';
  end if;
  if exists (
    select 1 from (values ('name'), ('kind'), ('city'), ('state'), ('phone'), ('website'), ('notes')) as col(n)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'crm_accounts' and c.column_name = col.n
        and c.data_type in ('text', 'character varying')
    )
  ) then
    raise exception 'drift: crm_accounts is missing a text column the company functions use';
  end if;
  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'crm_accounts' and column_name = 'created_by' and data_type = 'uuid';
  if not found then raise exception 'drift: crm_accounts.created_by uuid is missing'; end if;
  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'contacts' and column_name = 'account_id' and data_type = 'uuid';
  if not found then raise exception 'drift: contacts.account_id uuid is missing'; end if;
  perform 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'contacts' and column_name = 'company'
    and data_type in ('text', 'character varying');
  if not found then raise exception 'drift: contacts.company text is missing'; end if;
end
$pre$;

-- Prefix index. Plain CREATE INDEX is what TEST runs inside this transaction.
-- Production: create this CONCURRENTLY, outside a transaction, before relying on it.
create index crm_accounts_company_key_active_idx
  on public.crm_accounts (private.crm_company_key(name) text_pattern_ops)
  where archived_at is null;

comment on index public.crm_accounts_company_key_active_idx is
  'Prefix match for public.company_lookup (active companies only). TEST creates this inside the migration transaction. Production should CREATE INDEX CONCURRENTLY, outside a transaction.';

create function public.company_lookup(p_q text, p_limit integer default 20)
returns table (id uuid, name text, kind text, city text, state text, phone text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  -- OWNER PRIVACY SWITCH. false: everyone who passed the role check sees every
  -- active name. true: the owner rule. The CRM user chose false.
  v_owner_private boolean := false;
  v_key text;
  v_lim integer;
begin
  -- Once per call. The (select ...) form is the same hoist the RLS policies use.
  if not ((select private.is_processor()) or (select private.crm_user())) then
    raise exception 'Only a Processor or CRM user can look up companies.' using errcode = '42501';
  end if;

  v_key := private.crm_company_key(p_q);
  if v_key = '' then
    return;
  end if;
  v_lim := least(25, greatest(1, coalesce(p_limit, 20)));

  -- Default path (v_owner_private false).
  -- The index is (crm_company_key(name) text_pattern_ops) WHERE archived_at is null.
  -- No owner predicate and no per-row private.* helper. Contains (leading '%') is absent.
  if not v_owner_private then
    return query
    select a.id, a.name, a.kind, a.city, a.state, a.phone
    from public.crm_accounts a
    where a.archived_at is null
      and private.crm_company_key(a.name) like v_key || '%'
    -- ~<~ is the text_pattern_ops order. A plain ORDER BY text does not match
    -- the index, so a wide prefix is read and sorted in full (267 ms for
    -- 11,111 matches on the scratch database). USING ~<~ stops after v_lim
    -- (0.66 ms for those same 11,111 matches, 20 rows returned).
    order by private.crm_company_key(a.name) using ~<~
    limit v_lim;
    return;
  end if;

  -- Owner-privacy path. Not used while v_owner_private is false.
  -- No per-row private.* helper.
  -- The profiles probe is a primary-key lookup, and only when the caller is Sales Team.
  return query
  select a.id, a.name, a.kind, a.city, a.state, a.phone
  from public.crm_accounts a
  where a.archived_at is null
    and private.crm_company_key(a.name) like v_key || '%'
    and (
      (select private.crm_all())
      or a.owner_id is not distinct from (select private.effective_uid())
      or (
        (select private.me_role()) = 'Sales Team'
        and (
          a.owner_id is null
          or exists (
            select 1 from public.profiles p
            where p.id = a.owner_id and p.role in ('Sales Person', 'Sales Team')
          )
        )
      )
    )
  order by private.crm_company_key(a.name) using ~<~
  limit v_lim;
end
$fn$;

comment on function public.company_lookup(text, integer) is
  'Active CRM companies for a typeahead. Prefix on private.crm_company_key. Owner privacy is off (v_owner_private): every caller who passed the role check sees every active name. Cap 25. Does not search with a leading wildcard.';

create function public.company_find_or_create(p_name text, p_kind text, p_state text)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_name text;
  v_kind text;
  v_state text;
  v_key text;
  v_id uuid;
begin
  -- Once per call.
  -- Processors who are not preprocessors match contacts_insert: they will link
  -- file contacts to a company later. Admins pass is_processor() and are not
  -- preprocessors. Preprocessors fail this half.
  -- private.crm_editor() is the existing CRM write check (an admin, or a Sales
  -- Person / Sales Team member whose CRM switch is on). Sales users already
  -- create companies in the CRM and are not processors, so without this OR
  -- they could not use the shared function. A preprocessor is not a CRM editor.
  if not (
    ((select private.is_processor()) and not (select private.is_preprocessor()))
    or (select private.crm_editor())
  ) then
    raise exception 'Only a Processor (not a Preprocessor) or a CRM editor can add a company.' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Company name is required.' using errcode = '22023';
  end if;
  if char_length(v_name) > 160 then
    raise exception 'Company name is too long.' using errcode = '22023';
  end if;
  -- State is whatever the caller passed. Never a deal's property state.
  v_state := upper(btrim(coalesce(p_state, '')));
  if v_state !~ '^[A-Z]{2}$' then
    raise exception 'State is required.' using errcode = '22023';
  end if;
  v_kind := btrim(coalesce(p_kind, ''));
  if v_kind = '' then
    v_kind := 'other';
  end if;
  v_key := private.crm_company_key(v_name);

  -- Active rows only. crm_accounts_name_uq does not include archived rows:
  -- it is unique on lower(btrim(name)) where archived_at is null, so a name
  -- that exists only on an archived row can be inserted. No ON CONFLICT.
  -- unique_violation is a race with another active row. Return that id when
  -- the normalized key matches; otherwise re-raise.
  select a.id into v_id
  from public.crm_accounts a
  where a.archived_at is null
    and private.crm_company_key(a.name) = v_key
  order by a.created_at nulls last, a.id
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.crm_accounts (name, kind, state, phone, website, city, notes, owner_id, created_by)
    values (v_name, v_kind, v_state, '', '', '', '', null, (select private.effective_uid()))
    returning id into v_id;
  exception
    when unique_violation then
      select a.id into v_id
      from public.crm_accounts a
      where a.archived_at is null
        and private.crm_company_key(a.name) = v_key
      order by a.id
      limit 1;
      if v_id is null then
        raise;
      end if;
  end;
  return v_id;
end
$fn$;

comment on function public.company_find_or_create(text, text, text) is
  'Returns the active crm_accounts id whose normalized name matches, or inserts one with owner_id null. State is the p_state argument only, never a property state. Active names are unique on partial index crm_accounts_name_uq (lower(btrim(name)) where archived_at is null). Archived rows are not in that index.';

-- Exact auto-link. Returns the one active account id whose normalized name
-- equals p_name, or null. Two or more active matches return null. No prefix,
-- no contains, no insert, and no company columns. An outside user may call it.
-- A processor or CRM user may call it. Nobody else may. company_lookup stays
-- closed to outside users, and this function does not create a company.
create function public.company_match_active(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_key text;
  v_id uuid;
  v_n int;
begin
  if not (
    (select private.me_role()) = 'Outside user'
    or (select private.is_processor())
    or (select private.crm_user())
  ) then
    raise exception 'You cannot match a company.' using errcode = '42501';
  end if;
  v_key := private.crm_company_key(p_name);
  if v_key = '' then
    return null;
  end if;
  select count(*)::int into v_n
  from (
    select 1
    from public.crm_accounts a
    where a.archived_at is null
      and private.crm_company_key(a.name) = v_key
    limit 2
  ) s;
  if v_n <> 1 then
    return null;
  end if;
  select a.id into v_id
  from public.crm_accounts a
  where a.archived_at is null
    and private.crm_company_key(a.name) = v_key
  limit 1;
  return v_id;
end
$fn$;

comment on function public.company_match_active(text) is
  'Exact normalized name, exactly one active crm_accounts row: returns that id. Otherwise null. No company fields. Outside user, processor, or CRM user.';

-- Payoff lender, HOA, and utility join the existing company-kind list.
-- A check that is not a simple allowed-value list is left alone. No check is
-- created when kind was unrestricted. other_companies is not touched.
do $kinds$
declare
  r record;
  old_def text;
  body text;
begin
  for r in
    select c.oid, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.conrelid = 'public.crm_accounts'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~* '\mkind\M'
      and pg_get_constraintdef(c.oid) ~* '\m(any|in)\M'
      and pg_get_constraintdef(c.oid) !~* '\m(and|or)\M'
  loop
    if r.def ~* 'payoff_lender' and r.def ~* '\mhoa\M' and r.def ~* '\mutility\M' then
      continue;
    end if;
    if pg_catalog.obj_description(r.oid, 'pg_constraint') is not null then
      raise exception 'drift: kind check % already has a comment', r.conname;
    end if;
    old_def := r.def;
    body := btrim(regexp_replace(old_def, '^\s*CHECK\s*', '', 'i'));
    execute format('alter table public.crm_accounts drop constraint %I', r.conname);
    execute format(
      'alter table public.crm_accounts add constraint %I check ((%s) or kind in (''payoff_lender'', ''hoa'', ''utility''))',
      r.conname, body);
    execute format(
      'comment on constraint %I on public.crm_accounts is %L',
      r.conname, 'ff030-kind-prev:' || old_def);
  end loop;

  if to_regclass('public.crm_picklist_options') is not null then
    if exists (
      select 1 from (values ('list_key'), ('value'), ('label'), ('retired'), ('position')) as col(n)
      where not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'crm_picklist_options' and c.column_name = col.n
      )
    ) then
      raise exception 'drift: crm_picklist_options is missing a column the company kinds need';
    end if;
    insert into public.crm_picklist_options (list_key, value, label, retired, position)
    select 'accountKind', v.value, v.label, false,
           coalesce((select max(o.position) from public.crm_picklist_options o where o.list_key = 'accountKind'), 0) + v.n
    from (values (1, 'payoff_lender', 'Payoff lender'), (2, 'hoa', 'HOA'), (3, 'utility', 'Utility')) as v(n, value, label)
    where not exists (
      select 1 from public.crm_picklist_options o
      where o.list_key = 'accountKind' and o.value = v.value
    );
  end if;
end
$kinds$;

-- Trigger function, not a policy helper and not a private.* function.
-- A direct RPC call is a no-op: TG_OP is null outside a trigger.
-- SECURITY DEFINER so the rename still updates linked contacts when the
-- editor cannot update those contact rows under RLS. search_path is pinned.
create function public.crm_account_name_sync()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
begin
  if tg_op is distinct from 'UPDATE' or tg_relid is distinct from 'public.crm_accounts'::regclass then
    return null;
  end if;
  if new.name is not distinct from old.name then
    return null;
  end if;
  -- contacts_account_idx supports account_id = new.id. Leads are not updated.
  update public.contacts c
     set company = new.name
   where c.account_id = new.id
     and c.company is distinct from new.name;
  return null;
end
$fn$;

comment on function public.crm_account_name_sync() is
  'AFTER UPDATE OF name on crm_accounts. Copies the new name onto contacts linked by account_id. Not a policy helper. A direct call does nothing.';

create trigger crm_accounts_name_sync
  after update of name on public.crm_accounts
  for each row
  execute function public.crm_account_name_sync();

revoke all on function public.company_lookup(text, integer) from public, anon;
revoke all on function public.company_find_or_create(text, text, text) from public, anon;
revoke all on function public.company_match_active(text) from public, anon;
revoke all on function public.crm_account_name_sync() from public, anon;
grant execute on function public.company_lookup(text, integer) to authenticated;
grant execute on function public.company_find_or_create(text, text, text) to authenticated;
grant execute on function public.company_match_active(text) to authenticated;
grant execute on function public.crm_account_name_sync() to authenticated;

do $readback$
begin
  if (select prosecdef from pg_proc where oid = 'public.company_lookup(text, integer)'::regprocedure) is not true then
    raise exception 'readback: company_lookup is not security definer';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.company_find_or_create(text, text, text)'::regprocedure) is not true then
    raise exception 'readback: company_find_or_create is not security definer';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.crm_account_name_sync()'::regprocedure) is not true then
    raise exception 'readback: crm_account_name_sync is not security definer';
  end if;
  if (select proconfig from pg_proc where oid = 'public.company_lookup(text, integer)'::regprocedure)::text not like '%search_path%'
     or (select proconfig from pg_proc where oid = 'public.company_find_or_create(text, text, text)'::regprocedure)::text not like '%search_path%'
     or (select proconfig from pg_proc where oid = 'public.crm_account_name_sync()'::regprocedure)::text not like '%search_path%' then
    raise exception 'readback: a company function search_path is not pinned';
  end if;
  if has_function_privilege('public', 'public.company_lookup(text, integer)', 'execute')
     or has_function_privilege('anon', 'public.company_lookup(text, integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.company_lookup(text, integer)', 'execute') then
    raise exception 'readback: company_lookup grants are not authenticated-only';
  end if;
  if has_function_privilege('public', 'public.company_find_or_create(text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.company_find_or_create(text, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.company_find_or_create(text, text, text)', 'execute') then
    raise exception 'readback: company_find_or_create grants are not authenticated-only';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.company_match_active(text)'::regprocedure) is not true then
    raise exception 'readback: company_match_active is not security definer';
  end if;
  if has_function_privilege('public', 'public.company_match_active(text)', 'execute')
     or has_function_privilege('anon', 'public.company_match_active(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.company_match_active(text)', 'execute') then
    raise exception 'readback: company_match_active grants are not authenticated-only';
  end if;
  if has_function_privilege('public', 'public.crm_account_name_sync()', 'execute')
     or has_function_privilege('anon', 'public.crm_account_name_sync()', 'execute')
     or not has_function_privilege('authenticated', 'public.crm_account_name_sync()', 'execute') then
    raise exception 'readback: crm_account_name_sync grants are not authenticated-only';
  end if;
end
$readback$;

do $trig$
declare
  def text;
begin
  select pg_get_triggerdef(t.oid) into def
  from pg_trigger t
  where t.tgname = 'crm_accounts_name_sync' and t.tgrelid = 'public.crm_accounts'::regclass and not t.tgisinternal;
  if def is null or def not like '%AFTER UPDATE OF name%' or def not like '%crm_account_name_sync%' then
    raise exception 'readback: crm_accounts_name_sync is %', def;
  end if;
  if pg_get_indexdef('public.crm_accounts_company_key_active_idx'::regclass) not like '%text_pattern_ops%'
     or pg_get_indexdef('public.crm_accounts_company_key_active_idx'::regclass) not like '%archived_at IS NULL%' then
    raise exception 'readback: company key index is %', pg_get_indexdef('public.crm_accounts_company_key_active_idx'::regclass);
  end if;
end
$trig$;

commit;
