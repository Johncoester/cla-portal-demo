-- Throwaway schema for the hoist candidates. Catalog bodies and policies.
-- Not the hosted database. No customer rows.
-- Execute privileges mirror the captured TEST catalog: private helpers are
-- executable by authenticated only, except private.effective_uid() which
-- authenticated and anon can both execute. public cannot execute them.
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;

create table public.profiles (
  id uuid primary key,
  role text not null,
  status text not null,
  is_admin boolean not null,
  is_demo boolean not null default false,
  email text not null unique
);
create table public.contacts (
  id uuid primary key,
  profile_id uuid unique,
  first_name text not null,
  last_name text not null,
  company text not null default '',
  email text not null,
  phone text not null default '',
  is_demo boolean not null default false
);
create table public.deals (
  id uuid primary key,
  file_number text not null unique,
  street text not null,
  city text not null,
  state text not null,
  zip text not null,
  closing_date date,
  status text not null,
  is_demo boolean not null default false,
  created_by uuid,
  preprocessor_user_id uuid
);
create table public.deal_participants (
  id uuid primary key,
  deal_id uuid not null references public.deals(id),
  contact_id uuid not null references public.contacts(id),
  role text not null
);
create table public.tasks (
  id uuid primary key,
  deal_id uuid references public.deals(id),
  title text not null,
  description text not null default '',
  assigned_role text not null,
  status text not null,
  due_date date,
  completed_at timestamptz,
  completed_by uuid,
  kind text not null default 'simple',
  participant_id uuid,
  owner_profile_id uuid,
  template_id uuid,
  template_code text,
  template_version integer,
  created_at timestamptz not null default now(),
  form_data jsonb,
  task_group text,
  lane text,
  audiences text[]
);
create table private.view_as_sessions (
  actor_id uuid,
  target_id uuid,
  stopped_at timestamptz,
  expires_at timestamptz
);
create table public.deal_sales_people (
  deal_id uuid,
  sales_id uuid
);
create table public.team_members (
  team_id uuid,
  profile_id uuid,
  member_role text
);
create table public.task_template_switches (
  code text,
  enabled boolean
);
create table public.task_templates (
  code text,
  version integer,
  retired_at timestamptz
);

\ir catalog-functions.sql

insert into public.profiles (id, role, status, is_admin, is_demo, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'active', true, false, 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000a9', 'Super admin', 'active', true, false, 'super@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'Processor', 'active', false, false, 'processor@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'Sales Person', 'active', false, false, 'sales@example.test'),
  ('00000000-0000-0000-0000-0000000000a7', 'Sales Team', 'active', false, false, 'team@example.test'),
  ('00000000-0000-0000-0000-0000000000a8', 'Preprocessor', 'active', false, false, 'pre@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'Buyer Agent', 'active', false, false, 'agent@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'Client-Buyer', 'active', false, false, 'client@example.test'),
  ('00000000-0000-0000-0000-0000000000aa', 'Outside user', 'active', false, false, 'pure@example.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'Admin', 'disabled', true, false, 'disabled@example.test'),
  ('00000000-0000-0000-0000-0000000000a6', 'Processor', 'active', false, true, 'demo@example.test');
insert into public.contacts (id, profile_id, first_name, last_name, email, phone) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Pat', 'Agent', 'agent-c@example.test', '555-1001'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Ann', 'Client', 'client-c@example.test', '555-1002'),
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-0000000000aa', 'Bea', 'Buyer', 'pure-c@example.test', '555-1003'),
  ('00000000-0000-0000-0000-0000000000c7', null, 'Lee', 'List', 'lee@example.test', '555-0101'),
  ('00000000-0000-0000-0000-0000000000c8', null, 'Sam', 'Sell', 'sam@example.test', '555-0102'),
  ('00000000-0000-0000-0000-0000000000c9', null, 'Len', 'Lend', 'len@example.test', '555-0103');
insert into public.deals (id, file_number, street, city, state, zip, status, is_demo, created_by, preprocessor_user_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'MD-LIVE', '1 Main', 'Baltimore', 'MD', '21201', 'Open', false, '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000d2', 'MD-DEMO', '2 Side', 'Baltimore', 'MD', '21201', 'Open', true, '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000d3', 'MD-PRE', '3 Pre', 'Baltimore', 'MD', '21201', 'Open', false, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a8'),
  ('00000000-0000-0000-0000-0000000000d4', 'MD-CLOSED', '4 End', 'Baltimore', 'MD', '21201', 'Closed', false, '00000000-0000-0000-0000-0000000000a1', null);
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3', 'Buyer Agent'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c4', 'Client-Buyer'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000ca', 'Client-Buyer'),
  ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c7', 'Listing Agent'),
  ('00000000-0000-0000-0000-0000000000cd', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c8', 'Client-Seller'),
  ('00000000-0000-0000-0000-0000000000ce', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c9', 'Lender');
insert into public.deal_sales_people (deal_id, sales_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2');
insert into public.task_templates (code, version, retired_at) values
  ('RETIRED', 1, now());
insert into public.task_template_switches (code, enabled) values
  ('DISABLED', false),
  ('OK', true);
insert into private.view_as_sessions (actor_id, target_id, stopped_at, expires_at) values
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a4', null, now() + interval '1 day');
insert into public.tasks (id, deal_id, title, assigned_role, status, owner_profile_id, template_code, audiences, participant_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'Open blank', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a1', null, null, '00000000-0000-0000-0000-0000000000c5'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', 'Internal', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a1', null, '{internal}', null),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d1', 'Retired done', 'Client-Buyer', 'done', '00000000-0000-0000-0000-0000000000a1', 'RETIRED', null, null),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000d1', 'Retired open owner', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a2', 'RETIRED', null, null),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000d1', 'Switch off', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a1', 'DISABLED', null, null),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000d1', 'Buyer audience', 'Client-Buyer', 'in_progress', '00000000-0000-0000-0000-0000000000a4', 'OK', '{buyer}', '00000000-0000-0000-0000-0000000000c6'),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000d1', 'Null owner', 'Client-Buyer', 'blocked', null, null, null, null),
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000d2', 'Demo task', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a1', null, null, null),
  ('00000000-0000-0000-0000-0000000000e9', null, 'No file', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a1', null, null, null),
  ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000d3', 'Pre file', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a8', null, null, null),
  ('00000000-0000-0000-0000-0000000000eb', '00000000-0000-0000-0000-0000000000d4', 'Closed file', 'Client-Buyer', 'todo', '00000000-0000-0000-0000-0000000000a1', null, null, null);

alter table public.tasks enable row level security;
alter table public.tasks force row level security;
alter table public.deals enable row level security;
alter table public.deals force row level security;
alter table public.deal_participants enable row level security;
alter table public.deal_participants force row level security;
alter table public.contacts enable row level security;
alter table public.contacts force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

\ir initplan-policies.sql

grant usage on schema public, private to authenticated;
grant select on public.tasks, public.deals, public.deal_participants, public.contacts, public.profiles to authenticated;
grant execute on all functions in schema public to authenticated;
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format('revoke all on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated', r.fn);
  end loop;
end $$;
grant execute on function private.effective_uid() to anon;
