-- Scratch objects for CRM-FEED-1. Disposable local Postgres only. Not applied to TEST or production.
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists private;
do $roles$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $roles$;
grant usage on schema public, private, auth to authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated;
create table public.profiles (id uuid primary key, role text not null default 'Admin', is_admin boolean not null default false, is_demo boolean not null default false, status text not null default 'active');
create table public.contacts (id uuid primary key default gen_random_uuid(), first_name text not null default '', last_name text not null default '', email text not null default '', is_demo boolean not null default false);
create unique index contacts_email_uq on public.contacts (lower(email)) where email <> '';
create sequence public.fnseq start 9000;
create table public.deals (id uuid primary key default gen_random_uuid(), file_number text not null default '', street text not null default '', city text not null default '', state text not null default '', zip text not null default '', is_demo boolean not null default false, status text not null default 'Open');
create unique index deals_file_number_key on public.deals (file_number);
create or replace function public.fill_fn() returns trigger language plpgsql as $$ begin if new.file_number = '' then new.file_number := 'FL-26-' || nextval('public.fnseq'); end if; return new; end $$;
create trigger deals_file_number before insert on public.deals for each row execute function public.fill_fn();
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals (id) on delete cascade, contact_id uuid not null references public.contacts (id), role text not null);
create index idx_participants_deal on public.deal_participants (deal_id);
create index idx_participants_contact on public.deal_participants (contact_id);
create table public.deal_sales_people (deal_id uuid not null, sales_id uuid not null);
-- The portal lets staff insert orders and parties; the scratch role does the same so the triggers run as a normal user.
grant select, insert, update, delete on public.deals, public.deal_participants, public.contacts to authenticated;
grant usage on sequence public.fnseq to authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
create or replace function private.crm_need(p_edit boolean default false) returns void language plpgsql stable security definer as $$
begin if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'The CRM is for CLA staff only.' using errcode = '42501'; end if; end $$;
create or replace function private.effective_uid() returns uuid language sql stable as $$ select auth.uid() $$;
create or replace function private.viewer_is_demo() returns boolean language sql stable security definer as $$ select coalesce((select is_demo from public.profiles where id = auth.uid()), false) $$;
create or replace function private.crm_deal_scope_all() returns boolean language sql stable security definer as $$ select coalesce((select role <> 'Sales Person' from public.profiles where id = auth.uid()), false) $$;
grant execute on all functions in schema private to authenticated;
insert into public.profiles (id, role, is_admin, is_demo) values
  ('00000000-0000-4000-8000-000000000001', 'Admin', true, false),
  ('00000000-0000-4000-8000-000000000002', 'Sales Person', false, false),
  ('00000000-0000-4000-8000-000000000003', 'Admin', true, true);
