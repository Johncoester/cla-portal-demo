-- Rollback F35 row 415. The owner list goes back to active users with Can own CRM records.
-- An active Sales Person is no longer added by role. The tick is not dropped.
-- Run on TEST only if 20261127020000_crm_sales_person_owners.sql was applied there.
-- Never run on production.

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

do $public_owners$
declare
  src text;
  next_list text := $n$p.status = 'active' and (p.can_own_crm or p.role = 'Sales Person')$n$;
  tick_list text := $o$p.status = 'active' and p.can_own_crm$o$;
begin
  if to_regprocedure('public.crm_owners()') is null then
    return;
  end if;
  select pg_get_functiondef('public.crm_owners()'::regprocedure) into src;
  if position('rpc_crm_owners' in src) > 0 or position(next_list in src) = 0 then
    return;
  end if;
  execute replace(src, next_list, tick_list);
end
$public_owners$;

do $deal_owners$
declare
  sig text;
  src text;
  next_list text := $n$p.status = 'active' and (p.can_own_crm or p.role = 'Sales Person')$n$;
  tick_list text := $o$p.status = 'active' and p.can_own_crm$o$;
begin
  foreach sig in array array['public.crm_deal_filters()', 'private.rpc_crm_deal_filters()']
  loop
    if to_regprocedure(sig) is null then
      continue;
    end if;
    select pg_get_functiondef(sig::regprocedure) into src;
    if position(next_list in src) = 0 then
      continue;
    end if;
    execute replace(src, next_list, tick_list);
  end loop;
end
$deal_owners$;

commit;
