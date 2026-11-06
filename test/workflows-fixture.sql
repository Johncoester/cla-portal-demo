-- Throwaway stand-ins for the helpers and tables the workflows migration calls.
-- Local only. Not a copy of the TEST database.
create schema if not exists private;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;

create table public.profiles (
  id uuid primary key,
  role text,
  is_admin boolean not null default false,
  status text not null default 'active'
);

create table public.task_templates (
  id uuid primary key,
  code text not null,
  version integer not null,
  title text not null,
  retired_at timestamptz
);

insert into public.profiles (id, role, is_admin, status)
values ('11111111-1111-1111-1111-111111111111', 'Super admin', true, 'active');

insert into public.task_templates (id, code, version, title)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lender_info', 1, 'Lender information');

insert into public.task_templates (id, code, version, title, retired_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'old_task', 1, 'Old', now());

create or replace function private.effective_uid() returns uuid
language sql stable as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

create or replace function private.is_admin() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;

create or replace function private.is_staffish() returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$ select coalesce(current_setting('test.staff', true), '') = 'on' or private.is_admin() $$;

create or replace function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text)
returns void language plpgsql as $$ begin return; end $$;

create or replace function private.lock_function_search_paths() returns void
language plpgsql as $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = pg_catalog, public, extensions', r.sig);
  end loop;
end $$;
