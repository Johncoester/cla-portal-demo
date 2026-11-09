-- Disposable local schema for the Francis migrations. Not a hosted migration.
-- Tables and an older staff-only insert policy stand in for the portal that already exists.
-- auth.uid() reads the request claim, the same claim a signed-in session carries.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists private;

create extension if not exists pgcrypto with schema extensions;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function private.lock_function_search_paths() returns void
language sql as $$ select null::void $$;

create or replace function private.fmt_phone(p text) returns text
language sql immutable as $$ select coalesce(p, '') $$;

create or replace function private.agent_profile_write(p_user uuid, p jsonb) returns void
language sql as $$ select null::void $$;

create or replace function private.crm_option_label(p_list text, p_value text) returns text
language sql stable as $$ select coalesce(p_value, '') $$;

create or replace function private.crm_name(p_id uuid) returns text
language sql stable as $$ select '' $$;

create or replace function private.crm_user() returns boolean language sql stable as $$ select false $$;
create or replace function private.crm_deal_scope_all() returns boolean language sql stable as $$ select false $$;
create or replace function private.crm_deal_visible(p_deal uuid) returns boolean language sql stable as $$ select false $$;
create or replace function private.me_role() returns text language sql stable as $$ select '' $$;
create or replace function private.is_processor() returns boolean language sql stable as $$ select false $$;
create or replace function private.is_admin() returns boolean language sql stable as $$ select false $$;
create or replace function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text) returns void
language sql as $$ select null::void $$;
create or replace function private.hr_is_super() returns boolean language sql stable as $$ select false $$;
create or replace function private.hr_is_manager() returns boolean language sql stable as $$ select false $$;
create or replace function private.hr_open() returns boolean language sql stable as $$ select false $$;
create or replace function private.hr_my_employee() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function private.can_access_deal(p_deal uuid) returns boolean language sql stable as $$ select true $$;
create or replace function private.viewer_is_demo() returns boolean language sql stable as $$ select false $$;
create or replace function private.is_staffish() returns boolean language sql stable as $$ select false $$;

create table public.profiles (
  id uuid primary key,
  email text not null,
  first_name text default '',
  last_name text default '',
  phone text default '',
  role text not null,
  status text not null default 'active',
  is_demo boolean not null default false,
  is_admin boolean not null default false
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  first_name text default '',
  last_name text default '',
  email text default '',
  phone text default '',
  company text default '',
  is_demo boolean not null default false
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  file_number text default '',
  street text default '',
  city text default '',
  state text default '',
  zip text default '',
  county text default '',
  status text default 'Open',
  transaction_type text default 'Purchase',
  purchase_price numeric,
  loan_amount numeric,
  closing_date date,
  open_date date,
  created_at timestamptz default now(),
  processor_id uuid references public.profiles(id),
  is_demo boolean not null default false
);

create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id),
  contact_id uuid not null references public.contacts(id),
  role text not null
);

create table public.deal_sales_people (
  deal_id uuid,
  sales_id uuid,
  added_at timestamptz default now()
);

create table public.deal_business_sources (
  deal_id uuid primary key,
  source text default '',
  set_by uuid,
  set_at timestamptz default now()
);

create table public.crm_picklist_options (
  list_key text,
  value text,
  label text,
  retired boolean default false,
  position int default 0
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  code text,
  version int,
  title text,
  agent_roles text[]
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id),
  participant_id uuid references public.deal_participants(id),
  owner_profile_id uuid references public.profiles(id),
  assigned_role text,
  status text default 'todo',
  title text default ''
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id),
  name text not null,
  description text default '',
  mime_type text default '',
  size_bytes bigint default 0,
  storage_path text default '',
  visibility text not null,
  uploaded_by uuid not null references public.profiles(id),
  doc_type text default '',
  wire_instructions boolean not null default false
);

create table public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  email text,
  first_name text,
  last_name text,
  phone text,
  country text,
  archived_at timestamptz,
  profile_id uuid
);

create table public.hr_invites (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid,
  email text,
  token_hash text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  accepted_profile uuid
);

create table public.agent_invites (
  id uuid primary key default gen_random_uuid(),
  email text,
  token_hash text,
  status text,
  contact_id uuid,
  accepted_at timestamptz,
  accepted_profile uuid
);

create or replace function private.agent_invite_status(i public.agent_invites) returns text
language sql stable as $$ select coalesce(i.status, 'pending') $$;

-- Older insert rule: CLA staff in the same world may add a file. Agents may not.
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid());
create policy contacts_read on public.contacts for select to authenticated using (profile_id = auth.uid());
create policy participants_read on public.deal_participants for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = deal_participants.contact_id and c.profile_id = auth.uid()));

alter table public.documents enable row level security;
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.deal_participants enable row level security;
alter table public.tasks enable row level security;

create policy documents_staff_insert on public.documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.status = 'active'
        and pr.role in ('Processor', 'Preprocessor', 'Transaction Coordinator', 'Admin', 'Super admin')
        and coalesce(pr.is_demo, false) is not distinct from coalesce((select d.is_demo from public.deals d where d.id = documents.deal_id), false)
    )
  );

-- Read rule matching the portal: CLA staff see a file, the uploader sees their own,
-- and another party sees it only on their side or when it is shared with everyone.
-- A wire file stays with the buyer and CLA staff.
create policy documents_select on public.documents
  for select to authenticated
  using (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.status = 'active'
      and coalesce(pr.is_demo, false) is not distinct from coalesce((select d.is_demo from public.deals d where d.id = documents.deal_id), false))
    and (
      uploaded_by = auth.uid()
      or exists (
        select 1 from public.profiles pr
        where pr.id = auth.uid() and pr.status = 'active'
          and pr.role in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin')
      )
      or (
        coalesce(wire_instructions, false) = false
        and visibility <> 'staff'
        and exists (
          select 1 from public.deal_participants p
          join public.contacts c on c.id = p.contact_id
          where p.deal_id = documents.deal_id and c.profile_id = auth.uid()
            and (
              visibility = 'all'
              or (visibility = 'seller' and p.role in ('Listing Agent', 'Client-Seller'))
              or (visibility = 'buyer' and p.role in ('Buyer Agent', 'Client-Buyer'))
            )
        )
      )
      or (
        coalesce(wire_instructions, false) = true
        and exists (
          select 1 from public.deal_participants p
          join public.contacts c on c.id = p.contact_id
          where p.deal_id = documents.deal_id and c.profile_id = auth.uid() and p.role = 'Client-Buyer'
        )
      )
    )
  );

grant usage on schema public to authenticated;
grant select, insert on public.documents, public.profiles, public.contacts, public.deal_participants, public.tasks, public.deals to authenticated;
