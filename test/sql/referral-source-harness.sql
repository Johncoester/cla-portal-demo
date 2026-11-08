-- Disposable local stand-in for the TEST helpers this migration calls.
-- Not applied to hosted Supabase. No secrets. No real orders.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema if not exists private;

create table public.profiles (
  id uuid primary key,
  first_name text,
  last_name text,
  role text,
  status text,
  is_admin boolean default false,
  is_demo boolean default false
);
create table public.deals (
  id uuid primary key,
  file_number text,
  street text default '',
  city text default '',
  state text default '',
  zip text default '',
  status text default 'Open',
  is_demo boolean default false
);
create table public.contacts (
  id uuid primary key,
  first_name text,
  last_name text,
  profile_id uuid,
  is_demo boolean default false
);
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  contact_id uuid not null,
  role text not null
);
create table public.deal_business_sources (
  deal_id uuid primary key,
  source text not null default '',
  set_by uuid,
  set_at timestamptz default now()
);
create table public.deal_sales_people (
  deal_id uuid,
  sales_id uuid,
  added_at timestamptz default now()
);
create table public.crm_picklist_options (
  list_key text,
  value text,
  label text,
  retired boolean default false,
  position int default 0
);
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid,
  action text,
  detail text
);

create or replace function private.viewer_is_demo() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select is_demo from public.profiles where id = auth.uid()), false) $$;
-- Captured live shape: me_role requires an active profile. is_processor is role or admin only.
-- can_access_deal lets that Processor or Admin through without comparing deals.is_demo to the viewer.
-- A stronger stub would hide the cross-world write. Do not add demo isolation here.
create or replace function private.me_role() returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select role from public.profiles where id = auth.uid() and status = 'active' $$;
create or replace function private.is_processor() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (p.role in ('Processor', 'Preprocessor', 'Admin', 'Super admin') or p.is_admin)) $$;
create or replace function private.can_access_deal(p_deal uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.deals d where d.id = p_deal)
     and (private.is_processor() or exists (
       select 1 from public.deal_participants dp
       join public.contacts c on c.id = dp.contact_id
       where dp.deal_id = p_deal and c.profile_id = auth.uid())) $$;
create or replace function private.crm_user() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
      and p.role in ('Processor', 'Preprocessor', 'Admin', 'Super admin', 'Sales Person', 'Sales Team', 'Transaction Coordinator')) $$;
create or replace function private.crm_deal_scope_all() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor', 'Admin', 'Super admin')) $$;
create or replace function private.crm_name(p_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from public.profiles where id = p_id $$;
create or replace function private.crm_deal_visible(p_deal uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select private.can_access_deal(p_deal) $$;
create or replace function private.crm_option_label(p_list text, p_value text) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select label from public.crm_picklist_options where list_key = p_list and value = p_value limit 1), p_value) $$;
create or replace function private.log_activity(p_deal uuid, p_action text, p_kind text, p_id uuid, p_detail text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.activity_log (deal_id, action, detail) values (p_deal, p_action, p_detail);
end $$;

grant usage on schema public to anon, authenticated;

-- Rows that already exist. The migration must not rewrite them.
insert into public.deals (id, file_number, is_demo) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'MD-KEEP-1', false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'MD-KEEP-2', false);
insert into public.deal_business_sources (deal_id, source) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'homeowner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Existing Client or Agent');
