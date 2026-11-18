-- CRM-OWNER-1b (Janine Santos, email to John, Nov 18 2026, 9:36 AM ET).
-- Tracker: CRM-OWNER-1b.
-- On Admin, User List, Edit user, ticking "Can own CRM records" was refused.
-- The login saw "This was not saved: your login is not allowed to change this."
-- public.profiles grants UPDATE one column at a time. The earlier file added
-- can_own_crm and the guard trigger, and did not grant UPDATE on that column.
-- Postgres then rejects the save (42501) before the trigger runs.
-- This grants that one column to authenticated. The trigger is unchanged: only an
-- active Admin or Super admin can change the tick, and each change is still logged.
-- Row access stays with the existing profiles policies.
-- Not applied to hosted TEST by this commit. Never run on production.
-- Rollback: supabase/rollbacks/20261125210000_crm_owner_flag_grant.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'drift: role authenticated is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'can_own_crm'
  ) then
    raise exception 'drift: public.profiles.can_own_crm is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_can_own_crm_guard'
      and tgrelid = 'public.profiles'::regclass
      and not tgisinternal
  ) then
    raise exception 'drift: profiles_can_own_crm_guard is missing';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'can_own_crm', 'UPDATE') then
    raise exception 'drift: authenticated can already update profiles.can_own_crm';
  end if;
end
$guard$;

grant update (can_own_crm) on public.profiles to authenticated;

do $readback$
begin
  if not has_column_privilege('authenticated', 'public.profiles', 'can_own_crm', 'UPDATE') then
    raise exception 'readback: authenticated still cannot update profiles.can_own_crm';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_can_own_crm_guard'
      and tgrelid = 'public.profiles'::regclass
      and not tgisinternal
  ) then
    raise exception 'readback: profiles_can_own_crm_guard is missing';
  end if;
end
$readback$;

commit;
