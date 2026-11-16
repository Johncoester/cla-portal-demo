-- Scratch objects for CRM-OWNER-1. Not applied to TEST or production.
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
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  role text not null,
  status text not null default 'active',
  is_admin boolean not null default false,
  is_demo boolean not null default false
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key,
  is_demo boolean not null default false
);

create or replace function private.effective_uid() returns uuid
language sql stable as $fn$
  select auth.uid()
$fn$;

create or replace function private.is_admin() returns boolean
language sql stable as $fn$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false)
$fn$;

create or replace function private.me_role() returns text
language sql stable as $fn$
  select role from public.profiles where id = private.effective_uid() and status = 'active'
$fn$;

create or replace function private.crm_need(p_edit boolean default false) returns void
language sql as $fn$
  select null::void
$fn$;

create or replace function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text)
returns void
language sql as $fn$
  insert into public.activity_log (deal_id, actor_id, action, entity, entity_id, detail)
  values (p_deal, private.effective_uid(), p_action, p_entity, p_id, left(p_detail, 300))
$fn$;
