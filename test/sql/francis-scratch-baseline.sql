-- Scratch baseline so main's migrations can be applied in order.
-- Not a hosted migration. Deals starts at 57 columns (what 20261109150000 expects).
-- Contacts starts at 41 columns (what 20261110081500 expects) and already rejects
-- unknown keys in the custom column, the rule the hosted CRM import relies on.
create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  role text not null default 'Processor',
  status text not null default 'active',
  is_admin boolean not null default false,
  is_demo boolean not null default false
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  street text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  county text not null default '',
  transaction_type text not null default 'Purchase',
  status text not null default 'Open',
  stage integer not null default 0,
  open_date date not null default current_date,
  closing_date date,
  purchase_price numeric,
  loan_amount numeric,
  emd_amount numeric,
  emd_due_date date,
  notes text not null default '',
  processor_id uuid references public.profiles (id),
  created_by uuid,
  file_number text not null default '',
  is_demo boolean not null default false,
  lender_name text not null default '',
  lender_contact text not null default '',
  lender_phone text not null default '',
  lender_email text not null default '',
  loss_payee_name text not null default ''
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id),
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text not null default '',
  company text not null default '',
  contact_type text,
  is_demo boolean not null default false,
  custom jsonb not null default '{}'::jsonb
);

alter table public.contacts add constraint contacts_contact_type_check
  check (contact_type is null or contact_type in ('realtor', 'lender', 'buyer_seller'));

do $$
declare n int; i int := 0;
begin
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'deals';
  while n < 57 loop
    i := i + 1;
    execute format('alter table public.deals add column scratch_deal_%s text not null default ''''', i);
    n := n + 1;
  end loop;
  i := 0;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'contacts';
  while n < 41 loop
    i := i + 1;
    execute format('alter table public.contacts add column scratch_contact_%s text not null default ''''', i);
    n := n + 1;
  end loop;
end $$;

create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  contact_id uuid not null references public.contacts (id),
  role text not null
);

create table public.deal_sales_people (
  deal_id uuid not null references public.deals (id),
  sales_id uuid not null references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (deal_id, sales_id)
);

alter table public.deals enable row level security;
alter table public.contacts enable row level security;
grant select, insert, update, delete on public.deals to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;

-- Stand-in for the hosted CRM check. Unknown keys in contacts.custom are rejected.
create or replace function private.crm_settings_row() returns jsonb
language sql stable as $$ select '{"custom":["license"]}'::jsonb $$;

create or replace function private.crm_custom_in() returns trigger
language plpgsql as $$
declare k text;
begin
  if new.custom is null or new.custom = '{}'::jsonb then return new; end if;
  if jsonb_typeof(new.custom) is distinct from 'object' then
    raise exception 'contacts custom must be an object';
  end if;
  for k in select jsonb_object_keys(new.custom) loop
    if k is distinct from 'license' then
      raise exception 'unknown contacts custom key: %', k;
    end if;
  end loop;
  return new;
end $$;

create trigger contacts_crm_custom_in
  before insert or update of custom on public.contacts
  for each row execute function private.crm_custom_in();

-- Objects the hosted CRM import migration requires before it will run.
create table public.crm_imports (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  kind text not null,
  file_name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create or replace function public.crm_create_contact(p jsonb) returns uuid
language plpgsql as $$
declare id uuid := gen_random_uuid();
begin
  insert into public.contacts (id, first_name, last_name, email, phone, company, contact_type)
  values (id, coalesce(p->>'firstName', ''), coalesce(p->>'lastName', ''), nullif(p->>'email', ''), coalesce(p->>'phone', ''), coalesce(p->>'company', ''), nullif(p->>'contactType', ''));
  return id;
end $$;

create or replace function private.is_admin() returns boolean language sql stable as $$ select true $$;
create or replace function private.effective_uid() returns uuid language sql stable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
