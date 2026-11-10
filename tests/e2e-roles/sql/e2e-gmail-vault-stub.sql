-- Local stand-in for Vault and the roles the e2e Gmail migration expects.
-- Not a migration and not applied to TEST.

create schema if not exists vault;
create schema if not exists private;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text,
  secret text);
create or replace view vault.decrypted_secrets as
  select id, name, description, secret as decrypted_secret from vault.secrets;

create or replace function vault.create_secret(new_secret text, new_name text, new_description text default '') returns uuid
language plpgsql as $$
declare i uuid;
begin
  insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id into i;
  return i;
end $$;

create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void
language plpgsql as $$
begin
  update vault.secrets
     set secret = coalesce(new_secret, secret),
         name = coalesce(new_name, name),
         description = coalesce(new_description, description)
   where id = secret_id;
end $$;

create table if not exists public.profiles (
  id uuid primary key,
  email text not null unique,
  role text not null,
  status text not null default 'active',
  is_admin boolean not null default false,
  is_demo boolean not null default false);

insert into public.profiles (id, email, role, status, is_admin, is_demo) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin@clatitle.com', 'Super admin', 'active', true, false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'staff@clatitle.com', 'Processor', 'active', false, false)
on conflict (id) do nothing;

insert into vault.secrets (name, description, secret)
values ('gmail_refresh_kept', 'staff token that rollback must keep', 'staff-refresh-kept')
on conflict (name) do nothing;
