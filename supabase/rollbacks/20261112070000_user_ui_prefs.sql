-- Rollback 20261112070000_user_ui_prefs.
-- Drops public.user_ui_prefs and its policies. Not applied to hosted TEST.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if to_regclass('public.user_ui_prefs') is not null then
    drop policy if exists user_ui_prefs_update on public.user_ui_prefs;
    drop policy if exists user_ui_prefs_insert on public.user_ui_prefs;
    drop policy if exists user_ui_prefs_select on public.user_ui_prefs;
  end if;
end
$guard$;

drop table if exists public.user_ui_prefs;

commit;
