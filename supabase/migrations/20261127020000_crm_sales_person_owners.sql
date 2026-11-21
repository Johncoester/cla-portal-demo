-- F35 row 415. Janine Santos, Nov 19 Feedback 35 video, confirmed Nov 20 2026, 12:40 PM ET.
-- An active Sales Person shows in every CRM owner list, along with anyone who already
-- has Can own CRM records turned on. Unassigned stays a blank choice on the screen.
-- A disabled or removed person is not a choice. Sales Team is not added by role.
-- Saving that person as the owner uses the same rule. A salesperson can still change
-- only a record they own, and can still assign a record only to themselves.
-- The tick on User List is unchanged. Spreadsheet import still matches the tick.
-- This file does not change a policy, profiles row security, or a per-row helper.
-- NOT applied to hosted TEST by this commit. The portal lead applies it. Never run on production.
-- Rollback: supabase/rollbacks/20261127020000_crm_sales_person_owners.sql

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public, extensions;

create or replace function private.crm_owner_check(p_new uuid, p_old uuid, p_insert boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
begin
  -- A blank owner on a new record still becomes the signed-in salesperson when they
  -- may own records: the tick, or an active Sales Person.
  if p_insert and p_new is null and private.effective_uid() is not null and not private.is_admin()
     and coalesce(private.me_role() in ('Sales Person', 'Sales Team'), false) then
    if exists (
      select 1 from public.profiles
      where id = private.effective_uid() and status = 'active'
        and (can_own_crm or role = 'Sales Person')
    ) then
      p_new := private.effective_uid();
    else
      raise exception 'The owner must be an active user who can own CRM records.'
        using errcode = 'P0001';
    end if;
  end if;
  if p_new is not null and p_new is distinct from p_old and not exists (
    select 1 from public.profiles
    where id = p_new and status = 'active' and (can_own_crm or role = 'Sales Person')
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
  where p.status = 'active' and (p.can_own_crm or p.role = 'Sales Person')
  order by 2;
end
$fn$;

-- The screen calls public.crm_owners. On TEST that calls private.rpc_crm_owners.
-- A database that still writes the list inside public.crm_owners gets the same rule.
do $public_owners$
declare
  src text;
  role_list text := $o$p.status = 'active' and p.role in ('Sales Person', 'Sales Team')$o$;
  tick_list text := $o$p.status = 'active' and p.can_own_crm$o$;
  next_list text := $n$p.status = 'active' and (p.can_own_crm or p.role = 'Sales Person')$n$;
begin
  if to_regprocedure('public.crm_owners()') is null then
    return;
  end if;
  select pg_get_functiondef('public.crm_owners()'::regprocedure) into src;
  if position('rpc_crm_owners' in src) > 0 or position(next_list in src) > 0 then
    return;
  end if;
  if position(tick_list in src) > 0 then
    execute replace(src, tick_list, next_list);
  elsif position(role_list in src) > 0 then
    execute replace(src, role_list, next_list);
  else
    raise exception 'drift: public.crm_owners does not list owners the way this file expects';
  end if;
end
$public_owners$;

-- Deal Owner filter. Same people as the other owner lists.
do $deal_owners$
declare
  sig text;
  src text;
  tick_list text := $o$p.status = 'active' and p.can_own_crm$o$;
  next_list text := $n$p.status = 'active' and (p.can_own_crm or p.role = 'Sales Person')$n$;
begin
  foreach sig in array array['public.crm_deal_filters()', 'private.rpc_crm_deal_filters()']
  loop
    if to_regprocedure(sig) is null then
      continue;
    end if;
    select pg_get_functiondef(sig::regprocedure) into src;
    if position(next_list in src) > 0 then
      continue;
    end if;
    if position(tick_list in src) = 0 then
      raise exception 'drift: % does not list deal owners the way this file expects', sig;
    end if;
    execute replace(src, tick_list, next_list);
  end loop;
end
$deal_owners$;

do $readback$
declare
  src text;
  next_list text := $n$p.status = 'active' and (p.can_own_crm or p.role = 'Sales Person')$n$;
begin
  select pg_get_functiondef('private.rpc_crm_owners()'::regprocedure) into src;
  if position(next_list in src) = 0 or position('can_own_crm' in src) = 0 then
    raise exception 'readback: the owner list does not include an active Sales Person and the tick';
  end if;
  select pg_get_functiondef('private.crm_owner_check(uuid, uuid, boolean)'::regprocedure) into src;
  if position('can_own_crm or role = ''Sales Person''' in src) = 0
     or position('A Sales Person can only assign records to themselves.' in src) = 0 then
    raise exception 'readback: saving an owner dropped the Sales Person choice or the assign-to-self rule';
  end if;
  if to_regprocedure('public.crm_owners()') is not null then
    select pg_get_functiondef('public.crm_owners()'::regprocedure) into src;
    if position('rpc_crm_owners' in src) = 0 and position(next_list in src) = 0 then
      raise exception 'readback: public.crm_owners is not the shared owner list';
    end if;
  end if;
  if to_regprocedure('public.crm_deal_filters()') is not null then
    select pg_get_functiondef('public.crm_deal_filters()'::regprocedure) into src;
    if position(next_list in src) = 0 and position('rpc_crm_deal_filters' in src) = 0 then
      raise exception 'readback: the deal owner picker was not updated';
    end if;
  end if;
end
$readback$;

commit;
