-- Exact rollback of 20261125210000_crm_owner_flag_grant.sql.
-- Removes the UPDATE grant on profiles.can_own_crm. The column and the guard trigger stay.
-- Not applied to hosted TEST by this commit. Never run on production.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if not has_column_privilege('authenticated', 'public.profiles', 'can_own_crm', 'UPDATE') then
    raise exception 'drift: authenticated cannot update profiles.can_own_crm';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_can_own_crm_guard'
      and tgrelid = 'public.profiles'::regclass
      and not tgisinternal
  ) then
    raise exception 'drift: profiles_can_own_crm_guard is missing';
  end if;
end
$guard$;

revoke update (can_own_crm) on public.profiles from authenticated;

do $readback$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'can_own_crm', 'UPDATE') then
    raise exception 'readback: authenticated can still update profiles.can_own_crm';
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
