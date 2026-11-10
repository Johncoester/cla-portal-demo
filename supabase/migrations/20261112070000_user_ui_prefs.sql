-- Janine, Nov 10: CRM Manage columns follows the login.
-- One row per person per list. The list keys the screens write are leads, contacts,
-- accounts, and deals (Clients and Companies keep those route keys).
-- prefs is one jsonb object, under 16 KB. user_id is a real login and goes away with it.
-- The browser still paints from its own copy first. This table wins after that read.
-- No delete policy. No private helper. Not applied to hosted TEST (aqcervntopidtcazcmlv).
-- Rollback: supabase/rollbacks/20261112070000_user_ui_prefs.sql

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $guard$
declare
  def text;
begin
  if to_regprocedure('auth.uid()') is null then
    raise exception 'drift: auth.uid() is missing';
  end if;
  if to_regclass('auth.users') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users'
         and column_name = 'id' and data_type = 'uuid'
     ) then
    raise exception 'drift: auth.users(id) is missing';
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
    select pg_get_constraintdef(oid) into def from pg_constraint
      where conrelid = 'public.user_ui_prefs'::regclass and conname = 'user_ui_prefs_module_ok' and contype = 'c';
    if def is null or def !~ 'leads' or def !~ 'contacts' or def !~ 'accounts' or def !~ 'deals' then
      raise exception 'drift: user_ui_prefs_module_ok is missing or does not limit module to leads, contacts, accounts, deals';
    end if;
    select pg_get_constraintdef(oid) into def from pg_constraint
      where conrelid = 'public.user_ui_prefs'::regclass and conname = 'user_ui_prefs_prefs_ok' and contype = 'c';
    if def is null or def !~ 'jsonb_typeof' or def !~ '16384' then
      raise exception 'drift: user_ui_prefs_prefs_ok is missing or does not limit prefs to a small object';
    end if;
    if (
      select count(*) from pg_constraint
      where conrelid = 'public.user_ui_prefs'::regclass and contype = 'f'
        and pg_get_constraintdef(oid) ilike '%references auth.users(id)%'
        and pg_get_constraintdef(oid) ilike '%on delete cascade%'
    ) is distinct from 1 then
      raise exception 'drift: user_ui_prefs.user_id must reference auth.users(id) on delete cascade';
    end if;
  end if;
end
$guard$;

create table if not exists public.user_ui_prefs (
  user_id uuid not null default auth.uid(),
  module text not null,
  prefs jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module),
  constraint user_ui_prefs_module_ok check (module in ('leads', 'contacts', 'accounts', 'deals')),
  constraint user_ui_prefs_prefs_ok check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 16384),
  constraint user_ui_prefs_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
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
