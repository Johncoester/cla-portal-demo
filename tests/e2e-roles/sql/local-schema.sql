-- Local stand-in for the tables the E2E seed writes. Not a migration and not applied to TEST.
-- auth.users is filled by the proof script before the migrations run.
-- on_auth_user_sync creates a profile only when portal_role is present, which is
-- the contract the seed script now sends. The nine existing logins are inserted
-- without that key, so they stay profile-less until the profiles migration runs.

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text not null unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);

create table public.profiles (
  id uuid primary key,
  email text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  role text not null,
  status text not null default 'active',
  is_admin boolean not null default false,
  is_demo boolean not null default false
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id),
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text not null default '',
  company text not null default '',
  contact_type text
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  street text not null,
  city text not null,
  state text not null,
  zip text not null default '',
  county text not null default '',
  transaction_type text not null default 'Purchase',
  status text not null default 'Open',
  stage integer not null default 0,
  open_date date not null,
  purchase_price numeric,
  notes text not null default '',
  processor_id uuid references public.profiles (id),
  created_by uuid,
  file_number text not null unique,
  is_demo boolean not null default false
);

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

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id)
);

create function public.on_auth_user_sync() returns trigger
language plpgsql as $$
declare
  portal_role text := nullif(btrim(coalesce(
    new.raw_app_meta_data->>'portal_role',
    new.raw_user_meta_data->>'portal_role',
    ''
  )), '');
begin
  if portal_role is null then
    return new;
  end if;
  insert into public.profiles (id, email, first_name, last_name, phone, role, status, is_admin, is_demo)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    '',
    portal_role,
    'active',
    portal_role = 'Super admin',
    false
  );
  return new;
end
$$;

create trigger on_auth_user_sync
  after insert on auth.users
  for each row execute function public.on_auth_user_sync();
