-- 20261111170000 caches effective_uid for the rest of the transaction (cla.effective_uid_for / cla.effective_uid).
-- The cache is keyed by auth.uid(), so another person never gets it. But a view-as session that starts or stops
-- inside a transaction (start_demo_view / stop_demo_view, which are not in this repo) would leave a stale answer:
-- an effective_uid() call before the change and one after it return the same person.
-- Any write to private.view_as_sessions now clears the cache in that transaction, so the next call works it out again.
-- Also: board_owner_names was revoked from public only. anon gets nothing from it (no file access), but it is closed here too.
-- Apply after 20261111170000. Not applied on TEST by this commit.
-- Rollback: supabase/rollbacks/20261111180000_effective_uid_cache_reset.sql
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $pre$
begin
  if to_regprocedure('private.effective_uid()') is null
     or position('cla.effective_uid_for' in (select prosrc from pg_proc where oid = to_regprocedure('private.effective_uid()'))) = 0 then
    raise exception 'drift: private.effective_uid() has no transaction cache (apply 20261111170000 first)';
  end if;
  if to_regclass('private.view_as_sessions') is null then
    raise exception 'drift: private.view_as_sessions is missing';
  end if;
  if to_regprocedure('private.reset_effective_uid()') is not null
     or exists (select 1 from pg_trigger where tgname = 'view_as_resets_effective_uid' and not tgisinternal) then
    raise exception 'drift: the effective_uid reset is already installed';
  end if;
  if to_regprocedure('private.board_owner_names(uuid[])') is null then
    raise exception 'drift: private.board_owner_names(uuid[]) is missing';
  end if;
end
$pre$;

create function private.reset_effective_uid() returns trigger
language plpgsql security definer
set search_path to pg_catalog, public, extensions
as $reset$
begin
  -- '!' never equals an auth.uid() text or the empty actor, so the next effective_uid() call recomputes
  perform set_config('cla.effective_uid_for', '!', true);
  perform set_config('cla.effective_uid', '', true);
  return null;
end
$reset$;

revoke all on function private.reset_effective_uid() from public, anon, authenticated;

create trigger view_as_resets_effective_uid
after insert or update or delete on private.view_as_sessions
for each statement execute function private.reset_effective_uid();

revoke all on function private.board_owner_names(uuid[]) from anon;

commit;
