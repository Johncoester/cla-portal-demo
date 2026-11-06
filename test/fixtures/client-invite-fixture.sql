-- Throwaway schema for the unapplied buyer/seller invite migration. Not a hosted change.
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

create or replace function private.effective_uid() returns uuid language plpgsql stable as $$
declare v text := current_setting('cla.effective_uid', true);
begin
  if v is not null and v <> '' then return v::uuid; end if;
  return auth.uid();
end $$;
create or replace function private.viewer_is_demo() returns boolean language sql stable as $$
  select coalesce(current_setting('cla.viewer_is_demo', true), '') = '1' $$;
create or replace function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text) returns void
language plpgsql as $$
begin
  insert into public.activity (deal_id, action, entity, entity_id, detail) values (p_deal, p_action, p_entity, p_id, p_detail);
end $$;
create or replace function private.lock_function_search_paths() returns void language sql as $$ select null::void $$;
create or replace function private.fmt_phone(p text) returns text language sql as $$ select coalesce(p, '') $$;
create or replace function private.agent_profile_write(p_user uuid, p jsonb) returns void language sql as $$ select null::void $$;
create or replace function private.assert_invite_service() returns void language plpgsql as $$
declare jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if jwt_role is distinct from 'service_role' and not (jwt_role = '' and session_user in ('postgres', 'supabase_admin')) then
    raise exception 'This invite link is not valid or has expired.' using errcode = '42501';
  end if;
end $$;

create table if not exists public.hr_employees (
  id uuid primary key, email text, first_name text, last_name text, phone text, country text, archived_at timestamptz, profile_id uuid
);
create table if not exists public.hr_invites (
  id uuid primary key, employee_id uuid, email text, token_hash text, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, accepted_profile uuid
);
create table if not exists public.agent_invites (
  id uuid primary key, contact_id uuid, email text, token_hash text, status text, expires_at timestamptz, accepted_at timestamptz, accepted_profile uuid
);
create or replace function public.agent_invite_status(i public.agent_invites) returns text language sql as $$ select i.status $$;

create table if not exists public.profiles (
  id uuid primary key, email text unique, first_name text, last_name text, phone text default '',
  role text, is_admin boolean default false, status text default 'active', is_demo boolean default false
);
create table if not exists public.contacts (
  id uuid primary key, profile_id uuid, first_name text, last_name text, email text, phone text default '', company text default ''
);
create table if not exists public.deals (
  id uuid primary key, is_demo boolean default false, preprocessor_user_id uuid, file_number text
);
create table if not exists public.deal_participants (
  id uuid primary key, deal_id uuid, contact_id uuid, role text
);
create table if not exists public.activity (
  id bigserial primary key, deal_id uuid, action text, entity text, entity_id uuid, detail text
);
create table if not exists public.documents (
  id uuid primary key, deal_id uuid, name text, visibility text, wire_instructions boolean default false
);
create table if not exists private.test_tokens (id int primary key, token text);

insert into public.profiles (id, email, first_name, last_name, role, is_admin, status, is_demo) values
  ('11111111-1111-4111-8111-111111111111', 'proc@example.test', 'Paula', 'Processor', 'Processor', false, 'active', false),
  ('22222222-2222-4222-8222-222222222222', 'pre@example.test', 'Pat', 'Preprocessor', 'Preprocessor', false, 'active', false),
  ('33333333-3333-4333-8333-333333333333', 'sales@example.test', 'Sam', 'Sales', 'Sales Person', false, 'active', false),
  ('44444444-4444-4444-8444-444444444444', 'admin@example.test', 'Ada', 'Admin', 'Admin', true, 'active', false),
  ('55555555-5555-4555-8555-555555555555', 'exist@example.test', 'Evan', 'Existing', 'Outside user', false, 'active', false),
  ('66666666-6666-4666-8666-666666666666', 'staff@example.test', 'Stan', 'Staff', 'Admin', true, 'active', false),
  ('88888888-8888-4888-8888-888888888888', 'wrong@example.test', 'Willa', 'Wrong', 'Outside user', false, 'active', false),
  ('99999999-9999-4999-8999-999999999999', 'demo@example.test', 'Dana', 'Demo', 'Processor', false, 'active', true),
  ('12121212-1212-4212-8212-121212121299', 'off@example.test', 'Otto', 'Off', 'Processor', false, 'disabled', false);

insert into public.contacts (id, email, first_name, last_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'buyer@example.test', 'Wendy', 'Buyer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'seller@example.test', 'Walt', 'Seller'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'other@example.test', 'Olga', 'Other'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'staff@example.test', 'Stan', 'Staff'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'exist@example.test', 'Evan', 'Existing'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'regen@example.test', 'Rita', 'Regen'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 'revoke@example.test', 'Rex', 'Revoke'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'expire@example.test', 'Ed', 'Expire'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'race@example.test', 'Race', 'Buyer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'mismatch@example.test', 'Mia', 'Mismatch'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'pam.client@example.test', 'Pam', 'Pre');

insert into public.deals (id, is_demo, preprocessor_user_id, file_number) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', false, '22222222-2222-4222-8222-222222222222', 'D1'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', false, null, 'D2'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', false, null, 'D3'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', true, null, 'DEMO');

insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Client-Buyer'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Client-Buyer'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Client-Seller'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Client-Buyer'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Client-Buyer'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc6', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'Client-Seller'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc7', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'Client-Buyer'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc8', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 'Client-Seller'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc9', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'Client-Buyer'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc10', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'Client-Buyer'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc11', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'Client-Seller'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc12', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'Client-Buyer');

insert into public.documents (id, deal_id, name, visibility, wire_instructions) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Contract', 'all', false),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Wire Instructions', 'all', true),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Internal', 'staff', false),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'Other file', 'all', false);
