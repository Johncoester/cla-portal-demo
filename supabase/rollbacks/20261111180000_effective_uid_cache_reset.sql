-- Remove the view-as cache reset. effective_uid keeps its 20261111170000 transaction cache.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $pre$
begin
  if to_regprocedure('private.reset_effective_uid()') is null
     or not exists (select 1 from pg_trigger where tgname = 'view_as_resets_effective_uid' and not tgisinternal) then
    raise exception 'drift: the effective_uid reset is not installed';
  end if;
end
$pre$;

drop trigger view_as_resets_effective_uid on private.view_as_sessions;
drop function private.reset_effective_uid();

commit;
