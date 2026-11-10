-- Janine, Nov 10: CRM Manage columns follows the login.
-- One row per person per list. prefs is the column order the list saves.
-- The browser still paints from its own copy first. This table wins after that read.
-- No delete. No private helper. Not applied to hosted TEST (aqcervntopidtcazcmlv).
-- Rollback: supabase/rollbacks/20261112070000_user_ui_prefs.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
begin
  if to_regprocedure('auth.uid()') is null then
    raise exception 'drift: auth.uid() is missing';
  end if;
  if to_regclass('public.user_ui_prefs') is not null then
    if (
      select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'user_ui_prefs'
        and (
          (column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO')
          or (column_name = 'module' and data_type = 'text' and is_nullable = 'NO')
          or (column_name = 'prefs' and data_type = 'jsonb' and is_nullable = 'NO')
          or (column_name = 'updated_at' and data_type = 'timestamp with time zone' and is_nullable = 'NO')
        )
    ) is distinct from 4 then
      raise exception 'drift: public.user_ui_prefs exists with a different shape';
    end if;
    if (
      select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.user_ui_prefs'::regclass and contype = 'p'
    ) is distinct from 'PRIMARY KEY (user_id, module)' then
      raise exception 'drift: public.user_ui_prefs primary key is not (user_id, module)';
    end if;
  end if;
end
$guard$;

create table if not exists public.user_ui_prefs (
  user_id uuid not null default auth.uid(),
  module text not null,
  prefs jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module)
);

alter table public.user_ui_prefs enable row level security;

revoke all on table public.user_ui_prefs from public, anon, authenticated;
grant select, insert, update on table public.user_ui_prefs to authenticated;

drop policy if exists user_ui_prefs_select on public.user_ui_prefs;
create policy user_ui_prefs_select on public.user_ui_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_ui_prefs_insert on public.user_ui_prefs;
create policy user_ui_prefs_insert on public.user_ui_prefs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_ui_prefs_update on public.user_ui_prefs;
create policy user_ui_prefs_update on public.user_ui_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
