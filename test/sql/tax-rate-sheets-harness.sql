-- Scratch objects for the tax rate sheet row-security check. Not applied to TEST or production.
create schema if not exists auth;
create schema if not exists private;
create schema if not exists public;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$roles$;

create or replace function auth.uid() returns uuid
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;

create table if not exists public.profiles (
  id uuid primary key,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  role text not null,
  status text not null default 'active',
  is_admin boolean not null default false
);

create or replace function private.effective_uid() returns uuid
language sql stable as $fn$
  select auth.uid()
$fn$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public' as $fn$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false)
$fn$;

create or replace function private.me_role() returns text
language sql stable security definer set search_path to 'pg_catalog', 'public' as $fn$
  select role from public.profiles where id = private.effective_uid() and status = 'active'
$fn$;

create or replace function private.is_staffish() returns boolean
language sql stable security definer set search_path to 'pg_catalog', 'public' as $fn$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false)
$fn$;

grant execute on function private.is_admin(), private.me_role(), private.is_staffish(), private.effective_uid() to authenticated;
grant select on public.profiles to authenticated;
