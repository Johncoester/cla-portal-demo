-- CRM-OWNER-1 (John Coester, requested Nov 15 2026, 3:11 PM ET; confirmed Nov 16 2026, 10:55 AM ET).
-- Tracker: Requests tab row 315.
-- A per-user tick, "Can own CRM records". Off for every existing user, including admins.
-- This file does not turn anyone on.
-- Only an Admin or Super admin can change the tick. A trigger function (security definer,
-- search_path pinned) refuses everyone else and writes the activity log: who, which user,
-- old value, new value, when.
-- Ticked active users of any role are the CRM owner list (lead, client, company, deal,
-- mass update, and the spreadsheet import). Who can open the CRM does not change.
-- Not applied to hosted TEST by this commit. Never run on production.
-- Rollback: supabase/rollbacks/20261124140000_crm_owner_flag.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'drift: public.profiles is missing';
  end if;
  if to_regclass('public.activity_log') is null then
    raise exception 'drift: public.activity_log is missing';
  end if;
  if to_regprocedure('private.effective_uid()') is null
     or to_regprocedure('private.log_activity(uuid, text, text, uuid, text)') is null
     or to_regprocedure('private.is_admin()') is null
     or to_regprocedure('private.me_role()') is null
     or to_regprocedure('private.crm_need(boolean)') is null then
    raise exception 'drift: profile or CRM helper is missing';
  end if;
end
$guard$;

alter table public.profiles
  add column if not exists can_own_crm boolean not null default false;

comment on column public.profiles.can_own_crm is
  'When true, this person can be picked as the owner of a CRM record, whatever their role. Starts off for everyone, including admins. Does not change who can open the CRM.';

-- Admin and Super admin only. The activity log is the same log as other user changes.
create or replace function private.profiles_can_own_crm_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  allowed boolean;
begin
  if tg_op <> 'UPDATE' or new.can_own_crm is not distinct from old.can_own_crm then
    return new;
  end if;
  select coalesce(p.is_admin, false) and p.status = 'active' and p.role in ('Admin', 'Super admin')
    into allowed
  from public.profiles p
  where p.id = private.effective_uid();
  if not coalesce(allowed, false) then
    raise exception 'Only an Admin or Super admin can change who can own CRM records.'
      using errcode = '42501';
  end if;
  perform private.log_activity(
    null,
    'user.crm_owner',
    'user',
    new.id,
    'Can own CRM records for ' || btrim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''))
      || ' changed from ' || case when old.can_own_crm then 'yes' else 'no' end
      || ' to ' || case when new.can_own_crm then 'yes' else 'no' end
  );
  return new;
end
$fn$;

revoke all on function private.profiles_can_own_crm_guard() from public, anon, authenticated;

drop trigger if exists profiles_can_own_crm_guard on public.profiles;
create trigger profiles_can_own_crm_guard
  before update of can_own_crm on public.profiles
  for each row execute function private.profiles_can_own_crm_guard();

-- A new owner must be an active user with the tick. The person already on the record
-- can stay, even when the tick is off, so the name on an old record does not go blank.
-- A salesperson's new record is still theirs, but only when they themselves are ticked.
create or replace function private.crm_owner_check(p_new uuid, p_old uuid, p_insert boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  if p_insert and p_new is null and private.effective_uid() is not null and not private.is_admin()
     and coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) then
    if exists (
      select 1 from public.profiles
      where id = private.effective_uid() and status = 'active' and can_own_crm
    ) then
      p_new := private.effective_uid();
    else
      raise exception 'The owner must be an active user who can own CRM records.'
        using errcode = 'P0001';
    end if;
  end if;
  if p_new is not null and p_new is distinct from p_old and not exists (
    select 1 from public.profiles
    where id = p_new and status = 'active' and can_own_crm
  ) then
    raise exception 'The owner must be an active user who can own CRM records.'
      using errcode = 'P0001';
  end if;
  if private.effective_uid() is not null and p_new is distinct from p_old
     and p_new is distinct from private.effective_uid() and not private.is_admin()
     and coalesce(private.me_role() = 'Sales Person', false) then
    raise exception 'A Sales Person can only assign records to themselves.'
      using errcode = 'P0001';
  end if;
  return p_new;
end
$fn$;

create or replace function private.rpc_crm_owners()
returns table(id uuid, name text, role text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  perform private.crm_need();
  return query
  select p.id, btrim(p.first_name || ' ' || p.last_name), p.role
  from public.profiles p
  where p.status = 'active' and p.can_own_crm
  order by 2;
end
$fn$;

-- Names for people already on a record, including someone whose tick is now off.
create or replace function private.rpc_crm_owner_labels(p_ids uuid[])
returns table(id uuid, name text, role text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  perform private.crm_need();
  return query
  select p.id, btrim(p.first_name || ' ' || p.last_name), p.role
  from public.profiles p
  where p.id = any(coalesce(p_ids, array[]::uuid[]));
end
$fn$;

create or replace function public.crm_owner_labels(p_ids uuid[])
returns table(id uuid, name text, role text)
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $fn$
  select * from private.rpc_crm_owner_labels(p_ids);
$fn$;

revoke all on function private.rpc_crm_owner_labels(uuid[]) from public, anon;
revoke all on function public.crm_owner_labels(uuid[]) from public, anon;
grant execute on function private.rpc_crm_owner_labels(uuid[]) to authenticated;
grant execute on function public.crm_owner_labels(uuid[]) to authenticated;

-- Deal owner picker and the import owner column. Same tick, any role.
do $patch$
declare
  sig text;
  def text;
  nxt text;
  old_owners text := $o$p.role in ('Sales Person', 'Sales Team') and (p.status = 'active' or exists (select 1 from public.deal_sales_people s where s.sales_id = p.id))$o$;
  new_owners text := $n$p.status = 'active' and p.can_own_crm$n$;
  old_role text := $o$role in ('Sales Person', 'Sales Team')$o$;
begin
  foreach sig in array array['public.crm_deal_filters()', 'private.rpc_crm_deal_filters()']
  loop
    if to_regprocedure(sig) is null then
      continue;
    end if;
    def := pg_get_functiondef(sig::regprocedure);
    if position(old_owners in def) > 0 then
      execute replace(def, old_owners, new_owners);
    elsif position(new_owners in def) = 0 then
      raise exception 'drift: % does not list deal owners the way this file expects', sig;
    end if;
  end loop;

  if to_regprocedure('public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer)') is not null then
    def := pg_get_functiondef('public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer)'::regprocedure);
    if (length(def) - length(replace(def, old_role, ''))) / length(old_role) = 4 then
      nxt := replace(def, old_role, 'can_own_crm');
      nxt := replace(nxt,
        'The default Owner must be an active Sales Person or Sales Team user.',
        'The default Owner must be an active user who can own CRM records.');
      nxt := replace(nxt,
        'Owner "%" matches more than one salesperson. Use the email.',
        'Owner "%" matches more than one user who can own CRM records. Use the email.');
      nxt := replace(nxt,
        'Owner "%" is not an active Sales Person or Sales Team user.',
        'Owner "%" is not an active user who can own CRM records.');
      execute nxt;
    elsif position('can own CRM records' in def) = 0 then
      raise exception 'drift: crm_import_batch owner matching is not the salesperson check this file replaces';
    end if;
  end if;
end
$patch$;

-- Place Order still accepts an active staff login. A ticked user of any other role
-- can also be saved as the deal owner from the CRM.
create or replace function private.deal_sales_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare s public.profiles;
begin
  select * into s from public.profiles where id = new.sales_id;
  if s.id is null then raise exception 'Salesperson not found.' using errcode = 'P0001'; end if;
  if coalesce(current_setting('cla.sales_backfill', true), '') = 'on' then return new; end if;
  if s.status <> 'active' or (
       s.role not in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
       and not coalesce(s.can_own_crm, false)
     ) then
    raise exception 'Only an active staff login can be a salesperson on an order.' using errcode = 'P0001';
  end if;
  if s.is_demo is distinct from coalesce((select d.is_demo from public.deals d where d.id = new.deal_id), false) then
    raise exception 'A real order cannot use a demo login, and a demo order cannot use a real login.' using errcode = 'P0001';
  end if;
  return new;
end
$fn$;

do $readback$
declare
  col_default text;
  src text;
  definer boolean;
  conf text[];
begin
  select c.column_default into col_default
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'can_own_crm' and c.is_nullable = 'NO';
  if col_default is null or position('false' in col_default) = 0 then
    raise exception 'readback: can_own_crm is not a required column that starts off';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_can_own_crm_guard' and tgrelid = 'public.profiles'::regclass) then
    raise exception 'readback: the tick is not guarded';
  end if;
  select p.prosecdef, p.proconfig into definer, conf
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'profiles_can_own_crm_guard';
  if not coalesce(definer, false) or coalesce(array_to_string(conf, ','), '') !~ 'search_path=' then
    raise exception 'readback: the guard is not security definer with a pinned search_path';
  end if;
  select pg_get_functiondef('private.profiles_can_own_crm_guard()'::regprocedure) into src;
  if position('user.crm_owner' in src) = 0 or position('Super admin' in src) = 0 then
    raise exception 'readback: a change is not limited to Admin and Super admin, or it is not logged';
  end if;
  select pg_get_functiondef('private.rpc_crm_owners()'::regprocedure) into src;
  if position('can_own_crm' in src) = 0 or position('Sales Person' in src) > 0 then
    raise exception 'readback: the owner list is still limited to a role';
  end if;
  select pg_get_functiondef('private.crm_owner_check(uuid, uuid, boolean)'::regprocedure) into src;
  if position('can_own_crm' in src) = 0 or position('Sales Person or Sales Team user' in src) > 0 then
    raise exception 'readback: a new owner is still checked by role';
  end if;
  if to_regprocedure('public.crm_deal_filters()') is not null then
    select pg_get_functiondef('public.crm_deal_filters()'::regprocedure) into src;
    if position('p.status = ''active'' and p.can_own_crm' in src) = 0 then
      raise exception 'readback: the deal owner picker was not updated';
    end if;
  end if;
  if to_regprocedure('public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer)') is not null then
    select pg_get_functiondef('public.crm_import_batch(boolean, text, text, text, jsonb, jsonb, uuid, integer)'::regprocedure) into src;
    if position('can own CRM records' in src) = 0 or position('Sales Person or Sales Team user' in src) > 0 then
      raise exception 'readback: import owner matching still requires a salesperson';
    end if;
  end if;
end
$readback$;

commit;
