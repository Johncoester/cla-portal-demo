-- Throwaway schema for the due-anchor migration. Not the hosted database.
create schema if not exists private;
create schema if not exists extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create table public.profiles (id uuid primary key, role text);
create table public.contacts (id uuid primary key, profile_id uuid);
create table public.deals (id uuid primary key, open_date date, contract_date date, closing_date date);
create table public.task_templates (
  id uuid primary key, code text, version int, title text, description text, roles text[], due_days int,
  active boolean, retired_at timestamptz, lane text, audiences text[]
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), deal_id uuid, title text, description text, assigned_role text,
  status text, due_date date, created_by uuid, kind text, participant_id uuid, owner_profile_id uuid,
  template_id uuid, template_code text, template_version int, lane text, audiences text[]
);
create table public.deal_participants (id uuid primary key, deal_id uuid, contact_id uuid, role text);
create or replace function private.effective_uid() returns uuid language sql stable as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create or replace function private.is_admin() returns boolean language sql stable as $$ select exists (select 1 from public.profiles where id = private.effective_uid() and role in ('Admin', 'Super admin')) $$;
create or replace function private.is_processor() returns boolean language sql stable as $$ select exists (select 1 from public.profiles where id = private.effective_uid() and role in ('Processor', 'Preprocessor', 'Admin', 'Super admin')) $$;
create or replace function private.can_access_deal(p uuid) returns boolean language sql stable as $$ select true $$;
create or replace function private.task_enabled(code text) returns boolean language sql stable as $$ select true $$;
create or replace function private.notify(ids uuid[], kind text, deal uuid, title text, href text) returns void language sql as $$ select null::void $$;
create or replace function private.lock_function_search_paths() returns void language sql as $$ select null::void $$;
insert into public.profiles (id, role) values ('11111111-1111-1111-1111-111111111111', 'Admin');
insert into public.contacts (id, profile_id) values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.deals (id, open_date, closing_date) values
  ('44444444-4444-4444-4444-444444444444', '2026-11-01', '2026-12-15'),
  ('55555555-5555-5555-5555-555555555555', '2026-11-01', null);
insert into public.task_templates (id, code, version, title, description, roles, due_days, active, retired_at, lane, audiences) values
  ('66666666-6666-6666-6666-666666666666', 'survey_anchor', 1, 'Survey', '', array['Client-Buyer'], 7, true, null, 'portal', array['buyer']),
  ('77777777-7777-7777-7777-777777777777', 'seller_only', 1, 'Seller', '', array['Client-Seller'], 7, true, null, 'portal', array['seller']);
