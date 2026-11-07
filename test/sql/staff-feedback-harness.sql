-- Disposable local stand-in for the TEST project's private helpers. Not applied to hosted Supabase.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create schema if not exists private;
create table if not exists public.profiles (
  id uuid primary key,
  first_name text,
  last_name text,
  role text,
  status text,
  is_admin boolean default false,
  is_demo boolean default false
);
create table if not exists public.deals (
  id uuid primary key,
  file_number text,
  is_demo boolean default false
);

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid() and status = 'active'), false) $$;
create or replace function private.viewer_is_demo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_demo from public.profiles where id = auth.uid()), false) $$;
create or replace function private.me_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() $$;
create or replace function private.can_access_deal(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.deals d where d.id = p_deal and coalesce(d.is_demo, false) is not distinct from private.viewer_is_demo()) $$;
create or replace function private.lock_function_search_paths() returns void language sql as $$ select null::void $$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema public, storage to authenticated, service_role;
grant select, insert on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
